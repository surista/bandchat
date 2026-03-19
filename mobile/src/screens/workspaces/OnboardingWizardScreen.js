import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Share,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useLayout } from '../../hooks/useLayout';
import { successNotification, selectionFeedback } from '../../utils/haptics';
import { APP_BASE_URL } from '../../utils/constants';
import api from '../../services/api';

const STEPS = ['name', 'channels', 'invite', 'done'];
const STEP_LABELS = { name: 'Name', channels: 'Channels', invite: 'Invite', done: 'Done' };

const SUGGESTED_CHANNELS = [
  { name: 'general', description: 'General discussions', enabled: true, isDefault: true },
  { name: 'rehearsals', description: 'Schedule and discuss rehearsals', enabled: true },
  { name: 'gig-ideas', description: 'Venue ideas and booking opportunities', enabled: true },
  { name: 'setlists', description: 'Setlist planning and discussion', enabled: true },
  { name: 'off-topic', description: 'Non-band chat', enabled: false },
  { name: 'gear', description: 'Equipment and gear discussion', enabled: false },
  { name: 'songwriting', description: 'Original songs and arrangements', enabled: false },
];

export default function OnboardingWizardScreen({ navigation }) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { isTablet, contentMaxWidth } = useLayout();

  const [step, setStep] = useState('name');
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: Name
  const [workspaceName, setWorkspaceName] = useState('');

  // Step 2: Channels
  const [channels, setChannels] = useState(SUGGESTED_CHANNELS.map(c => ({ ...c })));
  const [customChannelName, setCustomChannelName] = useState('');

  // Step 3: Invite
  const [copied, setCopied] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailsSent, setEmailsSent] = useState([]);
  const [emailError, setEmailError] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const currentStepIndex = STEPS.indexOf(step);
  const customInputRef = useRef(null);

  // --- Close handler ---
  const handleClose = useCallback(() => {
    if (!workspace) {
      navigation.goBack();
      return;
    }
    Alert.alert(
      'Leave setup?',
      'Your workspace has been created. You can set up channels and invite members later from Settings.',
      [
        { text: 'Continue', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => navigation.replace('Workspace', { id: workspace.id, name: workspace.name }),
        },
      ]
    );
  }, [workspace, navigation]);

  // Android hardware back button
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClose();
      return true;
    });
    return () => sub.remove();
  }, [handleClose]);

  // --- Step 1: Create workspace ---
  const handleCreateWorkspace = useCallback(async () => {
    const name = workspaceName.trim();
    if (!name || loading) return;
    setLoading(true);
    setError(null);
    try {
      const ws = await api.createWorkspace(name);
      setWorkspace(ws);
      successNotification();
      setStep('channels');
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  }, [workspaceName, loading]);

  // --- Step 2: Channels ---
  const handleToggleChannel = useCallback((index) => {
    selectionFeedback();
    setChannels(prev => prev.map((c, i) => i === index ? { ...c, enabled: !c.enabled } : c));
  }, []);

  const handleAddCustomChannel = useCallback(() => {
    const name = customChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) return;
    if (channels.some(c => c.name === name)) {
      setError(`Channel "${name}" already exists`);
      return;
    }
    setChannels(prev => [...prev, { name, description: '', enabled: true, isCustom: true }]);
    setCustomChannelName('');
    setError(null);
    selectionFeedback();
  }, [customChannelName, channels]);

  const handleRemoveCustomChannel = useCallback((index) => {
    selectionFeedback();
    setChannels(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreateChannels = useCallback(async () => {
    const toCreate = channels.filter(c => c.enabled && !c.isDefault);
    if (toCreate.length === 0) {
      setStep('invite');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await Promise.all(
        toCreate.map(c => api.createChannel(workspace.id, { name: c.name, description: c.description }))
      );
      successNotification();
      setStep('invite');
    } catch (err) {
      setError(err.message || 'Failed to create some channels');
    } finally {
      setLoading(false);
    }
  }, [channels, workspace]);

  // --- Step 3: Invite ---
  const inviteUrl = workspace?.inviteCode ? `${APP_BASE_URL}/join/${workspace.inviteCode}` : '';

  const handleCopyInvite = useCallback(async () => {
    if (!inviteUrl) return;
    await Clipboard.setStringAsync(inviteUrl);
    setCopied(true);
    successNotification();
    setTimeout(() => setCopied(false), 2000);
  }, [inviteUrl]);

  const handleShareInvite = useCallback(async () => {
    if (!inviteUrl) return;
    try {
      await Share.share({
        message: `Join ${workspace?.name || 'my band'} on BandChat! ${inviteUrl}`,
      });
    } catch {
      // User cancelled
    }
  }, [inviteUrl, workspace]);

  const handleSendEmail = useCallback(async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    if (emailsSent.includes(email)) {
      setEmailError('Invite already sent to this email');
      return;
    }
    setEmailLoading(true);
    setEmailError('');
    try {
      await api.sendInviteEmail(workspace.id, email);
      setEmailsSent(prev => [...prev, email]);
      setEmailInput('');
      successNotification();
    } catch (err) {
      setEmailError(err.message || 'Failed to send invite');
    } finally {
      setEmailLoading(false);
    }
  }, [emailInput, emailsSent, workspace]);

  // --- Step 4: Done ---
  const handleFinish = useCallback(() => {
    successNotification();
    navigation.replace('Workspace', { id: workspace.id, name: workspace.name });
  }, [workspace, navigation]);

  // --- Render ---
  const channelCount = channels.filter(c => c.enabled).length;

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={styles.progressBars}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressBar,
              { backgroundColor: i <= currentStepIndex ? colors.primary : colors.bgTertiary },
            ]}
          />
        ))}
      </View>
      <Text
        style={[styles.progressLabel, { color: colors.textSecondary }]}
        accessibilityLabel={`Step ${currentStepIndex + 1} of ${STEPS.length}, ${STEP_LABELS[step]}`}
      >
        Step {currentStepIndex + 1} of {STEPS.length} — {STEP_LABELS[step]}
      </Text>
    </View>
  );

  const renderNameStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepHero}>
        <Ionicons name="musical-notes-outline" size={64} color={colors.primary} />
        <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Name your workspace</Text>
        <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>This is usually your band name.</Text>
      </View>
      <TextInput
        style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
        value={workspaceName}
        onChangeText={setWorkspaceName}
        placeholder="e.g., The Rockers"
        placeholderTextColor={colors.textSecondary}
        autoFocus
        maxLength={50}
        returnKeyType="done"
        onSubmitEditing={handleCreateWorkspace}
        accessibilityLabel="Workspace name"
      />
      <Text style={[styles.charCount, { color: colors.textSecondary }]}>{workspaceName.length} / 50</Text>
    </View>
  );

  const renderChannelsStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitleSmall, { color: colors.textPrimary }]}>Set up your channels</Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary, marginBottom: 16 }]}>
        Channels are where your band communicates. We've suggested a few to get started.
      </Text>

      {channels.map((ch, index) => (
        <View key={ch.name} style={[styles.channelRow, { backgroundColor: colors.bgSecondary }]}>
          <Switch
            value={ch.enabled}
            onValueChange={() => handleToggleChannel(index)}
            disabled={ch.isDefault}
            trackColor={{ false: colors.bgTertiary, true: colors.primary }}
            accessibilityLabel={`${ch.name} channel`}
          />
          <View style={styles.channelInfo}>
            <View style={styles.channelNameRow}>
              <Text style={[styles.channelHash, { color: colors.textSecondary }]}>#</Text>
              <Text style={[styles.channelName, { color: colors.textPrimary }]}>{ch.name}</Text>
              {ch.isDefault && (
                <View style={[styles.defaultBadge, { backgroundColor: colors.bgTertiary }]}>
                  <Text style={[styles.defaultBadgeText, { color: colors.textSecondary }]}>default</Text>
                </View>
              )}
            </View>
            {ch.description ? (
              <Text style={[styles.channelDesc, { color: colors.textSecondary }]} numberOfLines={1}>{ch.description}</Text>
            ) : null}
          </View>
          {ch.isCustom && (
            <TouchableOpacity
              onPress={() => handleRemoveCustomChannel(index)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${ch.name} channel`}
            >
              <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      ))}

      <View style={styles.addChannelRow}>
        <TextInput
          ref={customInputRef}
          style={[styles.addChannelInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
          value={customChannelName}
          onChangeText={setCustomChannelName}
          placeholder="Add a custom channel..."
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleAddCustomChannel}
          accessibilityLabel="Custom channel name"
        />
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.bgSecondary, opacity: customChannelName.trim() ? 1 : 0.5 }]}
          onPress={handleAddCustomChannel}
          disabled={!customChannelName.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add channel"
        >
          <Text style={[styles.addButtonText, { color: colors.textPrimary }]}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderInviteStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitleSmall, { color: colors.textPrimary }]}>Invite your bandmates</Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary, marginBottom: 16 }]}>
        Share the invite link or send email invitations.
      </Text>

      {/* Share section */}
      <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Invite Link</Text>
        <View style={[styles.linkBox, { backgroundColor: colors.bgTertiary }]}>
          <Text style={[styles.linkText, { color: colors.textPrimary }]} numberOfLines={1} selectable>
            {inviteUrl}
          </Text>
        </View>
        <View style={styles.shareButtons}>
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: colors.bgTertiary }]}
            onPress={handleCopyInvite}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Copy invite link"
          >
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? '#22c55e' : colors.textPrimary} />
            <Text style={[styles.shareButtonText, { color: copied ? '#22c55e' : colors.textPrimary }]}>
              {copied ? 'Copied!' : 'Copy'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shareButton, { backgroundColor: colors.primary }]}
            onPress={handleShareInvite}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Share invite link"
          >
            <Ionicons name="share-outline" size={18} color="#ffffff" />
            <Text style={[styles.shareButtonText, { color: '#ffffff' }]}>Share</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.linkHint, { color: colors.textSecondary }]}>This invite link expires in 24 hours.</Text>
      </View>

      {/* Email section */}
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, marginTop: 12 }]}>
        <Text style={[styles.cardLabel, { color: colors.textPrimary }]}>Send Email Invites</Text>
        <View style={styles.emailRow}>
          <TextInput
            style={[styles.emailInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={emailInput}
            onChangeText={(t) => { setEmailInput(t); setEmailError(''); }}
            placeholder="bandmate@email.com"
            placeholderTextColor={colors.textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={handleSendEmail}
            accessibilityLabel="Email address"
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.primary, opacity: emailInput.trim() && !emailLoading ? 1 : 0.5 }]}
            onPress={handleSendEmail}
            disabled={!emailInput.trim() || emailLoading}
            accessibilityRole="button"
            accessibilityLabel="Send invite email"
          >
            {emailLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
        {emailError ? <Text style={styles.emailError}>{emailError}</Text> : null}
        {emailsSent.map(email => (
          <View key={email} style={styles.sentRow}>
            <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            <Text style={[styles.sentEmail, { color: colors.textSecondary }]}>{email}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderDoneStep = () => (
    <View style={[styles.stepContent, styles.stepHero]}>
      <Ionicons name="checkmark-circle" size={72} color="#22c55e" />
      <Text style={[styles.stepTitle, { color: colors.textPrimary, marginTop: 16 }]}>You're all set!</Text>
      <Text style={[styles.stepSubtitle, { color: colors.textSecondary, marginBottom: 24 }]}>Your workspace is ready to go.</Text>

      <View style={[styles.summaryCard, { backgroundColor: colors.bgSecondary }]}>
        <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Workspace</Text>
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{workspace?.name}</Text>
        </View>
        <View style={[styles.summaryRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Channels</Text>
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{channelCount}</Text>
        </View>
        <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Invites sent</Text>
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{emailsSent.length}</Text>
        </View>
      </View>
    </View>
  );

  const renderStep = () => {
    switch (step) {
      case 'name': return renderNameStep();
      case 'channels': return renderChannelsStep();
      case 'invite': return renderInviteStep();
      case 'done': return renderDoneStep();
      default: return null;
    }
  };

  const handleNext = () => {
    switch (step) {
      case 'name': handleCreateWorkspace(); break;
      case 'channels': handleCreateChannels(); break;
      case 'invite': setStep('done'); successNotification(); break;
      case 'done': handleFinish(); break;
    }
  };

  const handleSkip = () => {
    if (step === 'channels') setStep('invite');
    else if (step === 'invite') { setStep('done'); successNotification(); }
  };

  const handleBack = () => {
    if (step === 'invite') setStep('channels');
  };

  const canGoNext = () => {
    if (step === 'name') return workspaceName.trim().length > 0 && !loading;
    return !loading;
  };

  const nextLabel = () => {
    switch (step) {
      case 'name': return loading ? 'Creating...' : 'Create Workspace';
      case 'channels': return loading ? 'Creating...' : 'Next';
      case 'invite': return 'Done';
      case 'done': return 'Go to Workspace';
      default: return 'Next';
    }
  };

  const showSkip = step === 'channels' || step === 'invite';
  const showBack = step === 'invite';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          {showBack ? (
            <TouchableOpacity
              onPress={handleBack}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerButton} />
          )}
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Create Workspace</Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Close wizard"
          >
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Progress */}
        {renderProgressBar()}

        {/* Body */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
          keyboardShouldPersistTaps="handled"
        >
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={16} color="#fca5a5" />
              </TouchableOpacity>
            </View>
          )}
          {renderStep()}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {showSkip && (
            <TouchableOpacity
              style={[styles.footerButton, styles.skipButton, { backgroundColor: colors.bgTertiary }]}
              onPress={handleSkip}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip this step"
            >
              <Text style={[styles.footerButtonText, { color: colors.textPrimary }]}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.footerButton,
              styles.nextButton,
              { backgroundColor: colors.primary, opacity: canGoNext() ? 1 : 0.5 },
              !showSkip && { flex: 1 },
            ]}
            onPress={handleNext}
            disabled={!canGoNext()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={nextLabel()}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.nextButtonText}>{nextLabel()}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  // Progress
  progressContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  progressBars: { flexDirection: 'row', gap: 4 },
  progressBar: { flex: 1, height: 3, borderRadius: 1.5 },
  progressLabel: { fontSize: 13, marginTop: 6 },
  // Body
  body: { padding: 20, paddingBottom: 40 },
  stepContent: {},
  stepHero: { alignItems: 'center', paddingTop: 32 },
  stepTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  stepTitleSmall: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  stepSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  charCount: { fontSize: 12, textAlign: 'right', marginTop: 4 },
  // Input
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginTop: 24,
  },
  // Channels
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    gap: 12,
    minHeight: 52,
  },
  channelInfo: { flex: 1 },
  channelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  channelHash: { fontSize: 14, fontWeight: '600' },
  channelName: { fontSize: 15, fontWeight: '600' },
  channelDesc: { fontSize: 12, marginTop: 2 },
  defaultBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginLeft: 4 },
  defaultBadgeText: { fontSize: 11, fontWeight: '500' },
  addChannelRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addChannelInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addButton: { paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { fontSize: 14, fontWeight: '600' },
  // Invite
  card: { borderRadius: 10, padding: 14 },
  cardLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  linkBox: { borderRadius: 8, padding: 12, marginBottom: 10 },
  linkText: { fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  linkHint: { fontSize: 11, marginTop: 8 },
  shareButtons: { flexDirection: 'row', gap: 8 },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
  },
  shareButtonText: { fontSize: 15, fontWeight: '600' },
  emailRow: { flexDirection: 'row', gap: 8 },
  emailInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: { paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  sendButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  emailError: { color: '#ef4444', fontSize: 12, marginTop: 6 },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  sentEmail: { fontSize: 13 },
  // Done
  summaryCard: { borderRadius: 10, width: '100%', marginTop: 8 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: '#ef4444', fontSize: 14, flex: 1, marginRight: 8 },
  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  skipButton: { flex: 1 },
  nextButton: { flex: 2 },
  footerButtonText: { fontSize: 16, fontWeight: '600' },
  nextButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
