import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

function timeAgo(dateStr) {
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true });
  } catch {
    return '';
  }
}

export default function PollsScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { colors } = useTheme();
  const { user } = useAuth();

  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  // Per-poll vote selections (keyed by poll id)
  const [selections, setSelections] = useState({});
  const [voting, setVoting] = useState({});

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [creating, setCreating] = useState(false);

  // Action sheet
  const [selectedPoll, setSelectedPoll] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => openCreateModal()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Create poll"
        >
          <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  const loadPolls = useCallback(async () => {
    try {
      const data = await api.getPolls(workspaceId, { includeCompleted: showClosed });
      setPolls(data);
    } catch (err) {
      console.error('Failed to load polls:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, showClosed]);

  useEffect(() => {
    loadPolls();
  }, [loadPolls]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadPolls();
    });
    return unsubscribe;
  }, [navigation, loadPolls]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPolls();
  }, [loadPolls]);

  const openCreateModal = useCallback(() => {
    setQuestion('');
    setDescription('');
    setOptions(['', '']);
    setAllowMultiple(false);
    setIsAnonymous(false);
    setShowCreate(true);
  }, []);

  const updateOption = useCallback((index, text) => {
    setOptions(prev => {
      const next = [...prev];
      next[index] = text;
      return next;
    });
  }, []);

  const addOption = useCallback(() => {
    setOptions(prev => {
      if (prev.length >= 10) return prev;
      return [...prev, ''];
    });
  }, []);

  const removeOption = useCallback((index) => {
    setOptions(prev => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const handleCreate = useCallback(async () => {
    if (!question.trim()) {
      Alert.alert('Required', 'Question is required');
      return;
    }
    const validOptions = options.map(o => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      Alert.alert('Required', 'At least 2 options are required');
      return;
    }
    setCreating(true);
    try {
      await api.createPoll(workspaceId, {
        question: question.trim(),
        description: description.trim() || null,
        options: validOptions,
        allowMultiple,
        isAnonymous,
      });
      setShowCreate(false);
      loadPolls();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create poll');
    } finally {
      setCreating(false);
    }
  }, [question, description, options, allowMultiple, isAnonymous, workspaceId, loadPolls]);

  const toggleSelection = useCallback((pollId, optionId, isMultiple) => {
    setSelections(prev => {
      const current = prev[pollId] || [];
      if (isMultiple) {
        const next = current.includes(optionId)
          ? current.filter(id => id !== optionId)
          : [...current, optionId];
        return { ...prev, [pollId]: next };
      }
      return { ...prev, [pollId]: [optionId] };
    });
  }, []);

  const handleVote = useCallback(async (pollId) => {
    const selected = selections[pollId];
    if (!selected?.length) return;
    setVoting(prev => ({ ...prev, [pollId]: true }));
    try {
      await api.votePoll(pollId, selected);
      loadPolls();
      setSelections(prev => {
        const next = { ...prev };
        delete next[pollId];
        return next;
      });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to vote');
    } finally {
      setVoting(prev => ({ ...prev, [pollId]: false }));
    }
  }, [selections, loadPolls]);

  const handleClosePoll = useCallback(async () => {
    if (!selectedPoll) return;
    try {
      await api.closePoll(selectedPoll.id);
      loadPolls();
    } catch (err) {
      Alert.alert('Error', 'Failed to close poll');
    }
    setShowActions(false);
    setSelectedPoll(null);
  }, [selectedPoll, loadPolls]);

  const handleDeletePoll = useCallback(() => {
    if (!selectedPoll) return;
    Alert.alert('Delete Poll', 'Delete this poll?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePoll(selectedPoll.id);
            setPolls(prev => prev.filter(p => p.id !== selectedPoll.id));
          } catch (err) {
            Alert.alert('Error', 'Failed to delete poll');
          }
          setShowActions(false);
          setSelectedPoll(null);
        },
      },
    ]);
  }, [selectedPoll]);

  const renderPoll = useCallback(({ item: poll }) => {
    const hasVoted = poll.userVotes?.length > 0;
    const showResults = hasVoted || poll.isClosed;
    const isCreator = poll.createdBy?.id === user?.id;
    const pollSelections = selections[poll.id] || [];
    const isVoting = voting[poll.id];

    return (
      <TouchableOpacity
        style={[styles.pollCard, { backgroundColor: colors.bgSecondary }, poll.isClosed && styles.closedCard]}
        onLongPress={() => { setSelectedPoll(poll); setShowActions(true); }}
        delayLongPress={400}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Poll: ${poll.question}. Long press for options`}
      >
        <View style={styles.pollHeader}>
          <Text style={[styles.pollQuestion, { color: colors.textPrimary }]}>{poll.question}</Text>
          {poll.isClosed && (
            <View style={[styles.closedBadge, { backgroundColor: 'rgba(107,114,128,0.2)' }]}>
              <Text style={styles.closedBadgeText}>Closed</Text>
            </View>
          )}
        </View>

        {poll.description ? (
          <Text style={[styles.pollDescription, { color: colors.textSecondary }]}>{poll.description}</Text>
        ) : null}

        <Text style={[styles.pollMeta, { color: colors.textSecondary }]}>
          By {poll.createdBy?.displayName || poll.removedCreatorName || 'Deleted User'} {'\u00B7'} {timeAgo(poll.createdAt)}
          {poll.allowMultiple ? ' \u00B7 Multi-select' : ''}
        </Text>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {poll.options?.map(opt => {
            const isSelected = pollSelections.includes(opt.id);
            const isVoted = poll.userVotes?.includes(opt.id);

            if (showResults) {
              // Results view
              return (
                <View key={opt.id} style={styles.resultRow}>
                  <View style={styles.resultInfo}>
                    <Text style={[styles.resultText, { color: colors.textPrimary }]}>
                      {opt.text}
                      {isVoted ? ' (Your vote)' : ''}
                    </Text>
                    <Text style={[styles.resultPercent, { color: colors.textSecondary }]}>
                      {opt.percentage}% ({opt.voteCount})
                    </Text>
                  </View>
                  <View style={[styles.resultBarBg, { backgroundColor: colors.bgTertiary }]}>
                    <View
                      style={[
                        styles.resultBarFill,
                        {
                          width: `${opt.percentage}%`,
                          backgroundColor: isVoted ? colors.primary : colors.primary + '60',
                        },
                      ]}
                    />
                  </View>
                  {!poll.isAnonymous && opt.voters?.length > 0 && (
                    <Text style={[styles.voterNames, { color: colors.textSecondary }]}>
                      {opt.voters.map(v => v.displayName).join(', ')}
                    </Text>
                  )}
                </View>
              );
            }

            // Voting view
            return (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.voteOption,
                  { backgroundColor: colors.bgTertiary },
                  isSelected && { borderColor: colors.primary, borderWidth: 1 },
                ]}
                onPress={() => toggleSelection(poll.id, opt.id, poll.allowMultiple)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${opt.text}${isSelected ? ", selected" : ""}`}
              >
                <View style={[styles.voteIndicator, isSelected && { backgroundColor: colors.primary }]}>
                  {isSelected && <Text style={styles.voteCheck}>{'\u2713'}</Text>}
                </View>
                <Text style={[styles.voteText, { color: colors.textPrimary }]}>{opt.text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Vote button */}
        {!showResults && !poll.isClosed && pollSelections.length > 0 && (
          <TouchableOpacity
            style={[styles.voteButton, { backgroundColor: colors.primary }]}
            onPress={() => handleVote(poll.id)}
            disabled={isVoting}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Submit vote"
          >
            {isVoting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.voteButtonText}>Submit Vote</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Total votes */}
        {showResults && (
          <Text style={[styles.totalVotes, { color: colors.textSecondary }]}>
            {poll.totalVotes} total {poll.totalVotes === 1 ? 'vote' : 'votes'}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [colors, user?.id, selections, voting, toggleSelection, handleVote]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      {/* Show closed toggle */}
      <TouchableOpacity
        style={[styles.toggleRow, { backgroundColor: colors.bgSecondary }]}
        onPress={() => setShowClosed(prev => !prev)}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`Show closed polls, ${showClosed ? "checked" : "unchecked"}`}
      >
        <View style={[styles.toggleCheck, { borderColor: colors.border }, showClosed && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
          {showClosed && <Text style={styles.toggleCheckmark}>{'\u2713'}</Text>}
        </View>
        <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Show closed polls</Text>
      </TouchableOpacity>

      <FlatList
        data={polls}
        keyExtractor={(item) => item.id}
        renderItem={renderPoll}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No polls</Text>
          </View>
        }
      />

      {/* Create Modal */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Create Poll</Text>

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Question *</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={question}
                onChangeText={setQuestion}
                placeholder="What would you like to ask?"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                accessibilityLabel="Poll question"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Description</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Optional description"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Poll description"
              />

              <Text style={[styles.modalLabel, { color: colors.textSecondary }]}>Options</Text>
              {options.map((opt, i) => (
                <View key={i} style={styles.optionInputRow}>
                  <TextInput
                    style={[styles.optionInput, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
                    value={opt}
                    onChangeText={(text) => updateOption(i, text)}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={colors.textSecondary}
                    accessibilityLabel={`Option ${i + 1}`}
                  />
                  {options.length > 2 && (
                    <TouchableOpacity style={styles.removeOption} onPress={() => removeOption(i)} accessibilityRole="button" accessibilityLabel={`Remove option ${i + 1}`}>
                      <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: '700' }}>{'\u00D7'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {options.length < 10 && (
                <TouchableOpacity style={styles.addOptionBtn} onPress={addOption} accessibilityRole="button" accessibilityLabel="Add option">
                  <Text style={[styles.addOptionText, { color: colors.primary }]}>+ Add option</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setAllowMultiple(prev => !prev)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Allow multiple selections, ${allowMultiple ? "checked" : "unchecked"}`}
              >
                <View style={[styles.checkbox, { borderColor: colors.border }, allowMultiple && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {allowMultiple && <Text style={styles.checkmark}>{'\u2713'}</Text>}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Allow multiple selections</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsAnonymous(prev => !prev)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Anonymous voting, ${isAnonymous ? "checked" : "unchecked"}`}
              >
                <View style={[styles.checkbox, { borderColor: colors.border }, isAnonymous && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {isAnonymous && <Text style={styles.checkmark}>{'\u2713'}</Text>}
                </View>
                <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>Anonymous voting</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.bgTertiary }]}
                onPress={() => setShowCreate(false)}
                disabled={creating}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.modalButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: colors.primary }]}
                onPress={handleCreate}
                disabled={creating || !question.trim()}
                accessibilityRole="button"
                accessibilityLabel="Create poll"
              >
                {creating ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalButtonTextWhite}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => setShowActions(false)}>
        <TouchableOpacity
          style={styles.actionOverlay}
          activeOpacity={1}
          onPress={() => { setShowActions(false); setSelectedPoll(null); }}
          accessibilityRole="button"
          accessibilityLabel="Close action sheet"
        >
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {selectedPoll?.question}
            </Text>
            {selectedPoll && !selectedPoll.isClosed && (
              <TouchableOpacity style={styles.actionItem} onPress={handleClosePoll} accessibilityRole="button" accessibilityLabel="Close poll">
                <Text style={[styles.actionText, { color: colors.textPrimary }]}>Close Poll</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionItem} onPress={handleDeletePoll} accessibilityRole="button" accessibilityLabel="Delete poll">
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionItem, styles.actionCancel]}
              onPress={() => { setShowActions(false); setSelectedPoll(null); }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15 },
  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toggleCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  toggleCheckmark: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  toggleLabel: { fontSize: 14 },
  // List
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  // Poll card
  pollCard: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  closedCard: { opacity: 0.7 },
  pollHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  pollQuestion: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  closedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  closedBadgeText: { color: '#6b7280', fontSize: 11, fontWeight: '600' },
  pollDescription: { fontSize: 14, marginBottom: 4 },
  pollMeta: { fontSize: 12, marginBottom: 10 },
  optionsContainer: { gap: 6 },
  // Vote options
  voteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  voteIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  voteCheck: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  voteText: { fontSize: 15, flex: 1 },
  // Results
  resultRow: { marginBottom: 4 },
  resultInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultText: { fontSize: 14, flex: 1, marginRight: 8 },
  resultPercent: { fontSize: 13, fontWeight: '600' },
  resultBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  resultBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  voterNames: { fontSize: 11, marginTop: 2 },
  totalVotes: { fontSize: 13, marginTop: 8 },
  // Vote button
  voteButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  voteButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 12,
    padding: 24,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  modalLabel: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  removeOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addOptionBtn: { marginBottom: 16 },
  addOptionText: { fontSize: 15, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkmark: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  checkboxLabel: { fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600' },
  modalButtonTextWhite: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  // Action sheet
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 12,
  },
  actionHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  actionItem: { paddingVertical: 16, alignItems: 'center' },
  actionText: { fontSize: 17 },
  actionCancel: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
});
