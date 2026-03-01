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
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

const TRANSACTION_TYPES = [
  { key: 'GIG_PAY', label: 'Gig Pay', icon: '\uD83C\uDFA4', positive: true },
  { key: 'FEE', label: 'Fee', icon: '\uD83D\uDCB5', positive: true },
  { key: 'EXPENSE', label: 'Expense', icon: '\uD83D\uDCB8', positive: false },
  { key: 'OTHER_INCOME', label: 'Other Income', icon: '\uD83D\uDCB0', positive: true },
];

const EXPENSE_CATEGORIES = [
  { key: 'equipment', label: 'Equipment' },
  { key: 'travel', label: 'Travel' },
  { key: 'rehearsal', label: 'Rehearsal Space' },
  { key: 'studio', label: 'Studio' },
  { key: 'promo', label: 'Promotion' },
  { key: 'other', label: 'Other' },
];

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
];

const CURRENCIES = [
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '\u20AC' },
  { code: 'GBP', symbol: '\u00A3' },
  { code: 'JPY', symbol: '\u00A5' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'AUD', symbol: 'A$' },
];

function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === code)?.symbol || '$';
}

function formatAmount(amount, currency) {
  const sym = getCurrencySymbol(currency);
  return `${sym}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
  const { user } = useAuth();
  const { colors } = useTheme();

  const [kitty, setKitty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filterTab, setFilterTab] = useState('all');

  // Transaction form
  const [showForm, setShowForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [txType, setTxType] = useState('GIG_PAY');
  const [txAmount, setTxAmount] = useState('');
  const [txDescription, setTxDescription] = useState('');
  const [txCategory, setTxCategory] = useState('');
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
              <Text style={{ fontSize: 20 }}>{'\u2699\uFE0F'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => { resetForm(); setShowForm(true); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Add transaction"
          >
            <Text style={{ color: colors.primary, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, colors.primary, isAdmin, kitty]);

  const loadData = useCallback(async () => {
    try {
      const [data, ws] = await Promise.all([
        api.getKitty(workspaceId),
        api.getWorkspace(workspaceId),
      ]);
      setKitty(data);
      const membership = ws.members?.find(m => m.userId === user?.id);
      setIsAdmin(membership?.role === 'admin');
    } catch (err) {
      console.error('Failed to load kitty:', err);
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
    setTxType('GIG_PAY');
    setTxAmount('');
    setTxDescription('');
    setTxCategory('');
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
      .reduce((sum, t) => sum + t.amount, 0);
  }, [kitty?.transactions]);

  const totalExpenses = useMemo(() => {
    return (kitty?.transactions || [])
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [kitty?.transactions]);

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
      <TouchableOpacity
        style={[styles.txCard, { backgroundColor: colors.bgSecondary }]}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.description}, ${isExpense ? 'expense' : 'income'} ${formatAmount(item.amount, currency)}. Long press for options`}
      >
        <Text style={styles.txIcon}>{info.icon}</Text>
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
        <Text style={[styles.txAmount, { color: isExpense ? '#ef4444' : '#22c55e' }]}>
          {isExpense ? '-' : '+'}{formatAmount(item.amount, currency)}
        </Text>
      </TouchableOpacity>
    );
  }, [colors, currency, handleLongPress]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (showForm) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.bgPrimary }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.formTitle, { color: colors.textPrimary }]}>
            {editingTx ? 'Edit Transaction' : 'New Transaction'}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Type</Text>
          <TouchableOpacity
            style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
            onPress={() => setShowTypePicker(true)}
            accessibilityRole="button"
            accessibilityLabel={`Transaction type: ${getTypeInfo(txType).label}`}
          >
            <Text style={{ fontSize: 16, marginRight: 8 }}>{getTypeInfo(txType).icon}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{getTypeInfo(txType).label}</Text>
          </TouchableOpacity>

          {txType === 'EXPENSE' && (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Category</Text>
              <TouchableOpacity
                style={[styles.input, styles.pickerInput, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                onPress={() => setShowCategoryPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Expense category: ${txCategory ? EXPENSE_CATEGORIES.find(c => c.key === txCategory)?.label || txCategory : 'Select category'}`}
              >
                <Text style={{ color: txCategory ? colors.textPrimary : colors.textSecondary, fontSize: 15 }}>
                  {txCategory ? EXPENSE_CATEGORIES.find(c => c.key === txCategory)?.label || txCategory : 'Select category'}
                </Text>
              </TouchableOpacity>
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
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.formButtonTextWhite}>{editingTx ? 'Save' : 'Create'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Type Picker */}
        <Modal visible={showTypePicker} transparent animationType="fade" onRequestClose={() => setShowTypePicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)} accessibilityRole="button" accessibilityLabel="Close type picker">
            <View style={[styles.pickerContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Transaction Type</Text>
              {TRANSACTION_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.pickerOption, txType === t.key && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setTxType(t.key); setShowTypePicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.label}${txType === t.key ? ', selected' : ''}`}
                >
                  <Text style={{ fontSize: 18, marginRight: 10 }}>{t.icon}</Text>
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{t.label}</Text>
                  {txType === t.key && <Text style={{ color: colors.primary, marginLeft: 'auto' }}>{'\u2713'}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Category Picker */}
        <Modal visible={showCategoryPicker} transparent animationType="fade" onRequestClose={() => setShowCategoryPicker(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)} accessibilityRole="button" accessibilityLabel="Close category picker">
            <View style={[styles.pickerContent, { backgroundColor: colors.modalBg }]}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]} accessibilityRole="header">Expense Category</Text>
              {EXPENSE_CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.pickerOption, txCategory === c.key && { backgroundColor: colors.bgTertiary }]}
                  onPress={() => { setTxCategory(c.key); setShowCategoryPicker(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.label}${txCategory === c.key ? ', selected' : ''}`}
                >
                  <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{c.label}</Text>
                  {txCategory === c.key && <Text style={{ color: colors.primary }}>{'\u2713'}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  const balance = kitty?.currentBalance ?? 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
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
            <Text style={[styles.filterChipText, { color: filterTab === f.key ? '#ffffff' : colors.textSecondary }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={groupedData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyIcon}>{'\uD83D\uDCB0'}</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No transactions yet</Text>
          </View>
        }
      />

      {/* Action Sheet */}
      <Modal visible={showActions} transparent animationType="slide" onRequestClose={() => { setShowActions(false); setSelectedTx(null); }}>
        <TouchableOpacity style={styles.actionOverlay} activeOpacity={1} onPress={() => { setShowActions(false); setSelectedTx(null); }} accessibilityRole="button" accessibilityLabel="Close action sheet">
          <View style={[styles.actionSheet, { backgroundColor: colors.modalBg }]}>
            <View style={[styles.actionHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.actionTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {selectedTx?.description}
            </Text>
            <TouchableOpacity
              style={styles.actionItem}
              onPress={() => {
                setShowActions(false);
                setEditingTx(selectedTx);
                setTxType(selectedTx.type);
                setTxAmount(String(selectedTx.amount));
                setTxDescription(selectedTx.description || '');
                setTxCategory(selectedTx.category || '');
                setShowForm(true);
                setSelectedTx(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Edit transaction"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionItem} onPress={handleDeleteTransaction} accessibilityRole="button" accessibilityLabel="Delete transaction">
              <Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionItem, styles.actionCancel]} onPress={() => { setShowActions(false); setSelectedTx(null); }} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
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
                    <Text style={[styles.currencyChipText, { color: settingsCurrency === c.code ? '#ffffff' : colors.textSecondary }]}>
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
                {savingSettings ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.formButtonTextWhite}>Save</Text>}
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  // Balance
  balanceHeader: { alignItems: 'center', paddingVertical: 16 },
  balanceLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceValue: { fontSize: 32, fontWeight: '800', marginTop: 4 },
  // Summary
  summaryRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  summaryValue: { fontSize: 16, fontWeight: '800' },
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
  txAmount: { fontSize: 16, fontWeight: '800' },
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
  // Action sheet
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingBottom: 40, paddingTop: 12 },
  actionHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  actionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  actionItem: { paddingVertical: 16, alignItems: 'center' },
  actionText: { fontSize: 17 },
  actionCancel: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  // Settings
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  settingsContent: { borderRadius: 12, padding: 24 },
  settingsTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  currencyChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  currencyChipText: { fontSize: 14, fontWeight: '600' },
});
