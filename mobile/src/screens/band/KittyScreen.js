import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ActionSheet from '../../components/ActionSheet';
import { Ionicons } from '@expo/vector-icons';
import ErrorState from '../../components/ErrorState';
import PressableRow from '../../components/PressableRow';
import { SkeletonList } from '../../components/SkeletonLoader';
import formatDate from '../../utils/formatDate';
import api from '../../services/api';
import { useLayout } from '../../hooks/useLayout';
import getCurrencySymbol, { CURRENCIES } from '../../utils/getCurrencySymbol';

const TRANSACTION_TYPES = [
  { key: 'GIG_PAY', label: 'Gig Pay', icon: 'cash-outline', positive: true },
  { key: 'FEE', label: 'Fee', icon: 'card-outline', positive: true },
  { key: 'EXPENSE', label: 'Expense', icon: 'arrow-up-outline', positive: false },
  { key: 'OTHER_INCOME', label: 'Other Income', icon: 'arrow-down-outline', positive: true },
];

const EXPENSE_CATEGORIES = [
  { key: 'equipment', label: 'Equipment' },
  { key: 'travel', label: 'Travel' },
  { key: 'rehearsal', label: 'Rehearsal Space' },
  { key: 'studio', label: 'Studio' },
  { key: 'noruma', label: 'Noruma' },
  { key: 'bar_tab', label: 'Bar Tab' },
  { key: 'promo', label: 'Promotion' },
  { key: 'other', label: 'Other' },
];

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
];

function formatAmount(amount, currency) {
  const sym = getCurrencySymbol(currency);
  return `${sym}${Math.abs(Number(amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMonth(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function getTypeInfo(type) {
  return TRANSACTION_TYPES.find(t => t.key === type) || TRANSACTION_TYPES[0];
}

export default function KittyScreen({ navigation, route }) {
  const { workspaceId } = route.params;
  const { user } = useAuth()
  const { isTablet, contentMaxWidth } = useLayout();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();

  const [kitty, setKitty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filterTab, setFilterTab] = useState('all');

  // Transaction form
  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [txType, setTxType] = useState('EXPENSE');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txCategory, setTxCategory] = useState('studio');
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settingsCurrency, setSettingsCurrency] = useState('USD');
  const [settingsBalance, setSettingsBalance] = useState('0');
  const [savingSettings, setSavingSettings] = useState(false);

  // Action sheet
  const [selectedTx, setSelectedTx] = useState(null);
  const [showActions, setShowActions] = useState(false);

  const loadingRef = useRef(loading);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => {
                setSettingsCurrency(kitty?.currency || 'USD');
                setSettingsBalance(String(kitty?.startingBalance || 0));
                setShowSettings(true);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Kitty settings"
            >
              <Ionicons name="settings-outline" size={22} color={colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => { resetForm(); setShowForm(true); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
          >
            <Ionicons name="add" size={28} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, colors.primary, isAdmin, kitty]);

  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [data, ws] = await Promise.all([
        api.getKitty(workspaceId),
        api.getWorkspace(workspaceId),
      ]);
      setKitty(data);
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'ADMIN');
    } catch (err) {
      setLoadError('Could not load kitty data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!loadingRef.current) loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const resetForm = useCallback(() => {
    setEditingTx(null);
    setTxType('EXPENSE');
    setTxAmount('');
    setTxDescription('');
    setTxCategory('studio');
  }, []);

  const filteredTransactions = useMemo(() => {
    const txs = kitty?.transactions || [];
    if (filterTab === 'income') return txs.filter(t => t.type !== 'EXPENSE');
    if (filterTab === 'expenses') return txs.filter(t => t.type === 'EXPENSE');
    return txs;
  }, [kitty?.transactions, filterTab]);

  // Group transactions by month
  const groupedData = useMemo(() => {
    const items = [];
    let currentMonth = null;
    for (const tx of filteredTransactions) {
      const month = formatMonth(tx.date);
      if (month !== currentMonth) {
        currentMonth = month;
        items.push({ type: 'month', month, id: `month-${month}` });
      }
      items.push({ type: 'transaction', ...tx });
    }
    return items;
  }, [filteredTransactions]);

  const totalIncome = useMemo(() => {
    return (kitty?.transactions || [])
      .filter(t => t.type !== 'EXPENSE')
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [kitty?.transactions]);

  const totalExpenses = useMemo(() => {
    return (kitty?.transactions || [])
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [kitty?.transactions]);

  // Running balance: iterate oldest→newest, income adds, expense subtracts
  const runningBalanceMap = useMemo(() => {
    const txs = kitty?.transactions || [];
    if (!txs.length) return {};
    const reversed = [...txs].reverse();
    let balance = Number(kitty?.startingBalance) || 0;
    const map = {};
    for (const tx of reversed) {
      if (tx.type === 'EXPENSE') {
        balance -= Number(tx.amount);
      } else {
        balance += Number(tx.amount);
      }
      map[tx.id] = balance;
    }
    return map;
  }, [kitty?.transactions, kitty?.startingBalance]);

  const handleSaveTransaction = useCallback(async () => {
    const amount = parseFloat(txAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Required', 'Enter a valid amount');
      return;
    }
    setSaving(true);
    const data = {
      type: txType,
      amount,
      description: txDescription.trim() || txType,
      category: txType === 'EXPENSE' ? (txCategory || 'other') : undefined,
    };
    try {
      if (editingTx) {
        await api.updateKittyTransaction(editingTx.id, data);
      } else {
        await api.createKittyTransaction(workspaceId, data);
      }
      setShowForm(false);
      resetForm();
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  }, [txType, txAmount, txDescription, txCategory, editingTx, workspaceId, resetForm, loadData]);

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await api.updateKittySettings(workspaceId, {
        currency: settingsCurrency,
        startingBalance: parseFloat(settingsBalance) || 0,
      });
      setShowSettings(false);
      loadData();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  }, [workspaceId, settingsCurrency, settingsBalance, loadData]);

  const handleLongPress = useCallback((tx) => {
    if (tx.gigId) return; // Can't edit gig-linked transactions
    const canEdit = tx.createdById === user?.id || isAdmin;
    if (!canEdit) return;
    setSelectedTx(tx);
    setShowActions(true);
  }, [user?.id, isAdmin]);

  const handleDeleteTransaction = useCallback(async () => {
    if (!selectedTx) return;
    Alert.alert('Delete Transaction', 'Delete this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteKittyTransaction(selectedTx.id);
            loadData();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete transaction');
          }
          setShowActions(false);
          setSelectedTx(null);
        },
      },
    ]);
  }, [selectedTx, loadData]);

  const currency = kitty?.currency || 'USD';
  const sym = getCurrencySymbol(currency);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'month') {
      return (
        <Text style={[styles.monthHeader, { color: colors.textSecondary }]}>{item.month}</Text>
      );
    }
    const info = getTypeInfo(item.type);
    const isExpense = item.type === 'EXPENSE';
    return (
      <PressableRow
        style={[styles.txCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={`${item.description}, ${isExpense ? 'expense' : 'income'} ${formatAmount(item.amount, currency)}. Long press for options`}
      >
        <Ionicons name={info.icon} size={22} color={isExpense ? '#ef4444' : '#22c55e'} />
        <View style={styles.txInfo}>
          <Text style={[styles.txDescription, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={[styles.txMeta, { color: colors.textSecondary }]}>
            {formatDate(item.date)}
            {item.category ? ` \u00B7 ${item.category}` : ''}
            {item.gig ? ` \u00B7 ${item.gig.title}` : ''}
          </Text>
          {(item.createdBy || item.removedCreatorName) ? (
            <Text style={[styles.txCreator, { color: colors.textSecondary }]}>
              by {item.createdBy?.displayName || item.removedCreatorName || 'Deleted User'}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.txAmount, { color: isExpense ? '#ef4444' : '#22c55e' }]}>
            {isExpense ? '-' : '+'}{formatAmount(item.amount, currency)}
          </Text>
          {runningBalanceMap[item.id] !== undefined && (
            <Text style={[styles.txBalance, { color: runningBalanceMap[item.id] >= 0 ? colors.textSecondary : '#ef4444' }]}>
              Bal: {formatAmount(runningBalanceMap[item.id], currency)}
            </Text>
          )}
        </View>
      </PressableRow>
    );
  }, [colors, currency, handleLongPress, runningBalanceMap]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <SkeletonList count={5} />
      </SafeAreaView>
    );
  }

  if (loadError && !kitty) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ErrorState
          iconName="wallet-outline"
          title="Couldn't load kitty"
          message={loadError}
          onRetry={() => { setLoadError(null); loadData(); }}
        />
      </SafeAreaView>
    );
  }

  if (showForm) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <ScrollView contentContainerStyle={[styles.formContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
            {editingTx ? 'Edit Transaction' : 'New Transaction'}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
          <PressableRow
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowTypePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Transaction type: ${getTypeInfo(txType).label}`}
          >
            <Ionicons name={getTypeInfo(txType).icon} size={16} color={colors.textPrimary} style={{ marginRight: 8 }} />
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{getTypeInfo(txType).label}</Text>
          </PressableRow>

          {txType === 'EXPENSE' && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
              <PressableRow
                style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setShowCategoryPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Expense category: ${txCategory ? EXPENSE_CATEGORIES.find(c => c.key === txCategory)?.label || txCategory : 'Select category'}`}
              >
                <Text style={{ color: txCategory ? colors.textPrimary : colors.textSecondary, fontSize: 15 }}>
                  {txCategory ? EXPENSE_CATEGORIES.find(c => c.key === txCategory)?.label || txCategory : 'Select category'}
                </Text>
              </PressableRow>
            </>
          )}

          <Text style={[styles.label, { color: colors.textSecondary }]}>Amount ({sym})</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={txAmount}
            onChangeText={setTxAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>Description</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
            value={txDescription}
            onChangeText={setTxDescription}
            placeholder="Optional description"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Description"
          />

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.bgTertiary }]}
              onPress={() => { setShowForm(false); resetForm(); }}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleSaveTransaction}
              disabled={saving || !txAmount}
              accessibilityRole="button"
              accessibilityLabel={editingTx ? 'Save transaction' : 'Create transaction'}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryText} size="small" />
              ) : (
                <Text style={[styles.formButtonTextWhite, { color: colors.primaryText }]}>{editingTx ? 'Save' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Type Picker */}
        <Modal visible={showTypePicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowTypePicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)} accessibilityRole="button" accessibilityLabel="Close type picker">
            <View style={[styles.pickerContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Transaction Type</Text>
              {TRANSACTION_TYPES.map(t => (
                <PressableRow
                  key={t.key}
                  style={[styles.pickerOption, txType === t.key && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setTxType(t.key); setShowTypePicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.label}${txType === t.key ? ', selected' : ''}`}
                >
                  <Ionicons name={t.icon} size={18} color={colors.textPrimary} style={{ marginRight: 10 }} />
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{t.label}</Text>
                  {txType === t.key && <Ionicons name="checkmark" size={20} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                </PressableRow>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Category Picker */}
        <Modal visible={showCategoryPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCategoryPicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)} accessibilityRole="button" accessibilityLabel="Close category picker">
            <View style={[styles.pickerContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Expense Category</Text>
              {EXPENSE_CATEGORIES.map(c => (
                <PressableRow
                  key={c.key}
                  style={[styles.pickerOption, txCategory === c.key && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setTxCategory(c.key); setShowCategoryPicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.label}${txCategory === c.key ? ', selected' : ''}`}
                >
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{c.label}</Text>
                  {txCategory === c.key && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                </PressableRow>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  const balance = kitty?.currentBalance ?? 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      {/* Balance header */}
      <View style={styles.balanceHeader}>
        <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Current Balance</Text>
        <Text style={[styles.balanceValue, { color: balance >= 0 ? '#22c55e' : '#ef4444' }]}>
          {balance < 0 ? '-' : ''}{formatAmount(balance, currency)}
        </Text>
      </View>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
          <Text style={[styles.summaryValue, { color: '#22c55e' }]}>{formatAmount(totalIncome, currency)}</Text>
          <Text style={[styles.summaryLabel, { color: '#22c55e' }]}>Income</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
          <Text style={[styles.summaryValue, { color: '#ef4444' }]}>{formatAmount(totalExpenses, currency)}</Text>
          <Text style={[styles.summaryLabel, { color: '#ef4444' }]}>Expenses</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, { backgroundColor: filterTab === f.key ? colors.primary : colors.bgTertiary }]}
            onPress={() => setFilterTab(f.key)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${f.label}${filterTab === f.key ? ', selected' : ''}`}
          >
            <Text style={[styles.filterChipText, { color: filterTab === f.key ? colors.primaryText : colors.textSecondary }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={groupedData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="wallet-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No transactions yet</Text>
          </View>
        }
      />

      {/* Action Sheet */}
      <ActionSheet
        visible={showActions}
        title={selectedTx?.description}
        actions={[
          {
            label: 'Edit',
            onPress: () => {
              setShowActions(false);
              setEditingTx(selectedTx);
              setTxType(selectedTx.type);
              setTxAmount(String(selectedTx.amount));
              setTxDescription(selectedTx.description || '');
              setTxCategory(selectedTx.category || '');
              setShowForm(true);
              setSelectedTx(null);
            },
          },
          { label: 'Delete', destructive: true, onPress: handleDeleteTransaction },
        ]}
        onClose={() => { setShowActions(false); setSelectedTx(null); }}
      />

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowSettings(false)}>
        <View style={styles.settingsOverlay}>
          <View style={[styles.settingsContent, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.settingsTitle, { color: colors.textPrimary }]}>Kitty Settings</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {CURRENCIES.map(c => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.currencyChip, { backgroundColor: settingsCurrency === c.code ? colors.primary : colors.bgTertiary }]}
                    onPress={() => setSettingsCurrency(c.code)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.code}${settingsCurrency === c.code ? ', selected' : ''}`}
                  >
                    <Text style={[styles.currencyChipText, { color: settingsCurrency === c.code ? colors.primaryText : colors.textSecondary }]}>
                      {c.symbol} {c.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Starting Balance</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]}
              value={settingsBalance}
              onChangeText={setSettingsBalance}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Starting balance"
            />
            <View style={styles.formActions}>
              <TouchableOpacity style={[styles.formButton, { backgroundColor: colors.bgTertiary }]} onPress={() => setShowSettings(false)} disabled={savingSettings} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={[styles.formButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.formButton, { backgroundColor: colors.primary }]} onPress={handleSaveSettings} disabled={savingSettings} accessibilityRole="button" accessibilityLabel="Save settings">
                {savingSettings ? <ActivityIndicator color={colors.primaryText} size="small" /> : <Text style={[styles.formButtonTextWhite, { color: colors.primaryText }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  // Balance
  balanceHeader: { alignItems: 'center', paddingVertical: 16 },
  balanceLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceValue: { fontSize: 32, fontWeight: '700', marginTop: 4 },
  // Summary
  summaryRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryLabel: { fontSize: 12, fontWeight: '600', opacity: 0.8, marginTop: 2 },
  // Filters
  filterRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  filterChipText: { fontSize: 13, fontWeight: '600' },
  // List
  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  monthHeader: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  txCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 12, marginBottom: 6, gap: 10 },
  txIcon: { fontSize: 22 },
  txInfo: { flex: 1 },
  txDescription: { fontSize: 15, fontWeight: '600' },
  txMeta: { fontSize: 12, marginTop: 2 },
  txCreator: { fontSize: 11, marginTop: 1 },
  txAmount: { fontSize: 16, fontWeight: '700' },
  txBalance: { fontSize: 11, marginTop: 2 },
  // Empty
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  // Form
  formContent: { padding: 16, paddingBottom: 40 },
  formTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  pickerInput: { flexDirection: 'row', alignItems: 'center' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  formButton: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  formButtonText: { fontSize: 16, fontWeight: '600' },
  formButtonTextWhite: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  // Pickers
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerContent: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  pickerTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickerOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8 },
  pickerOptionText: { fontSize: 15, flex: 1 },
  // Settings
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  settingsContent: { borderRadius: 12, padding: 24 },
  settingsTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  currencyChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  currencyChipText: { fontSize: 14, fontWeight: '600' },
});
