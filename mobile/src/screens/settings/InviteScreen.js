import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ErrorState from '../../components/ErrorState';
import api from '../../services/api';
import formatDate from '../../utils/formatDate';
import { useLayout } from '../../hooks/useLayout';

export default function InviteScreen({ route }) {
  const { workspaceId } = route.params;
  const { user } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();

  const [inviteData, setInviteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Email invite
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const loadInviteData = useCallback(async () => {
    setLoadError(null);
    try {
      const [invite, ws] = await Promise.all([
        api.getInviteCode(workspaceId),
        api.getWorkspace(workspaceId),
      ]);
      setInviteData(invite);
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'ADMIN');
    } catch (err) {
      setLoadError('Could not load invite data');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, user?.id]);

  useEffect(() => {
    loadInviteData();
  }, [loadInviteData]);

  const handleCopy = useCallback(async () => {
    if (!inviteData?.inviteCode) return;
    await Clipboard.setStringAsync(inviteData.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteData?.inviteCode]);

  const handleShare = useCallback(async () => {
    if (!inviteData?.inviteCode) return;
    try {
      await Share.share({
        message: `Join our band on BandChat! Use invite code: ${inviteData.inviteCode}`,
      });
    } catch {
      // User cancelled
    }
  }, [inviteData?.inviteCode]);

  const handleRegenerate = useCallback(async () => {
    Alert.alert(
      'Regenerate Code',
      'This will invalidate the current invite code. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          onPress: async () => {
            setRegenerating(true);
            try {
              const newInvite = await api.regenerateInviteCode(workspaceId);
              setInviteData(newInvite);
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to regenerate code');
            } finally {
              setRegenerating(false);
            }
          },
        },
      ]
    );
  }, [workspaceId]);

  const handleSendEmail = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      await api.sendInviteEmail(workspaceId, trimmed);
      Alert.alert('Sent', `Invitation sent to ${trimmed}`);
      setEmail('');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to send invitation');
    } finally {
      setSending(false);
    }
  }, [email, workspaceId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !inviteData) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="mail-outline"
          title="Couldn't load invite"
          message={loadError}
          onRetry={() => { setLoadError(null); loadInviteData(); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled">
        {/* Invite Code */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>INVITE CODE</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <View style={[styles.codeBox, { backgroundColor: colors.bgTertiary }]}>
            <Text style={[styles.codeText, { color: colors.textPrimary }]}>
              {inviteData?.inviteCode || 'N/A'}
            </Text>
          </View>

          {inviteData?.expiresAt && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Expires: {formatDate(inviteData.expiresAt)}
            </Text>
          )}
          {inviteData?.usedCount != null && (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              Used {inviteData.usedCount} time{inviteData.usedCount !== 1 ? 's' : ''}
              {inviteData.maxUses ? ` / ${inviteData.maxUses}` : ''}
            </Text>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={handleCopy}
              activeOpacity={0.7}
            >
              <Text style={styles.actionButtonText}>
                {copied ? 'Copied!' : 'Copy'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
          </View>

          {isAdmin && (
            <TouchableOpacity
              style={[styles.regenerateButton, { borderColor: colors.border }]}
              onPress={handleRegenerate}
              disabled={regenerating}
              activeOpacity={0.7}
            >
              {regenerating ? (
                <ActivityIndicator color={colors.textSecondary} size="small" />
              ) : (
                <Text style={[styles.regenerateText, { color: colors.textSecondary }]}>
                  Regenerate Code
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Email Invite */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>EMAIL INVITE</Text>
        <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Email address"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: email.trim() ? colors.primary : colors.bgTertiary }]}
            onPress={handleSendEmail}
            disabled={sending || !email.trim()}
            activeOpacity={0.7}
          >
            {sending ? (
              <ActivityIndicator color={colors.primaryText} size="small" />
            ) : (
              <Text style={[styles.sendButtonText, { color: email.trim() ? colors.primaryText : colors.textSecondary }]}>
                Send Invitation
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    padding: 16,
  },
  codeBox: {
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  codeText: { fontSize: 24, fontWeight: '700', letterSpacing: 2 },
  meta: { fontSize: 13, marginBottom: 4 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  regenerateButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  regenerateText: { fontSize: 14, fontWeight: '500' },
  // Email
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  sendButton: {
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
  },
  sendButtonText: { fontSize: 15, fontWeight: '600' },
});
