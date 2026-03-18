import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import api from '../../services/api';
import ConfirmDialog from '../common/ConfirmDialog';
import Modal from '../common/Modal';
import Skeleton from '../common/Skeleton';
import ErrorMessage from '../common/ErrorMessage';
import { CURRENCIES, getCurrencySymbol } from '../../utils/currencies';

const TRANSACTION_TYPES = [
  { id: 'GIG_PAY', label: 'Gig Pay', icon: '🎤', positive: true },
  { id: 'FEE', label: 'Fee', icon: '💵', positive: true },
  { id: 'EXPENSE', label: 'Expense', icon: '💸', positive: false },
  { id: 'OTHER_INCOME', label: 'Other Income', icon: '💰', positive: true }
];

const EXPENSE_CATEGORIES = [
  { id: 'equipment', label: 'Equipment' },
  { id: 'travel', label: 'Travel' },
  { id: 'rehearsal', label: 'Rehearsal Space' },
  { id: 'studio', label: 'Studio' },
  { id: 'noruma', label: 'Noruma' },
  { id: 'bar_tab', label: 'Bar Tab' },
  { id: 'promo', label: 'Promotion' },
  { id: 'other', label: 'Other' }
];

// CURRENCIES imported from ../../utils/currencies

function BandKitty({ workspaceId }) {
  const [kitty, setKitty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Form state
  const [formType, setFormType] = useState('EXPENSE');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formCategory, setFormCategory] = useState('studio');
  const [formLoading, setFormLoading] = useState(false);

  // Settings state
  const [settingsBalance, setSettingsBalance] = useState('');
  const [settingsDate, setSettingsDate] = useState('');
  const [settingsCurrency, setSettingsCurrency] = useState('USD');
  const [settingsLoading, setSettingsLoading] = useState(false);

  const currencySymbol = useMemo(() => getCurrencySymbol(kitty?.currency), [kitty?.currency]);

  useEffect(() => {
    loadKitty();
  }, [workspaceId]);

  const loadKitty = async () => {
    setLoading(true);
    try {
      const data = await api.getKitty(workspaceId);
      setKitty(data);
      setSettingsBalance(data.startingBalance?.toString() || '0');
      setSettingsDate(format(new Date(data.balanceAsOfDate), 'yyyy-MM-dd'));
      setSettingsCurrency(data.currency || 'USD');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formAmount) return;

    setFormLoading(true);
    try {
      const data = {
        type: formType,
        amount: parseFloat(formAmount),
        description: formDescription,
        date: formDate,
        category: formType === 'EXPENSE' ? formCategory : null
      };

      if (editingTransaction) {
        await api.updateKittyTransaction(editingTransaction.id, data);
      } else {
        await api.createKittyTransaction(workspaceId, data);
      }

      await loadKitty();
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (transactionId) => {
    setError('');
    try {
      await api.deleteKittyTransaction(transactionId);
      await loadKitty();
      setDeleteConfirm(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setError('');
    setSettingsLoading(true);
    try {
      await api.updateKittySettings(workspaceId, {
        startingBalance: parseFloat(settingsBalance) || 0,
        balanceAsOfDate: settingsDate,
        currency: settingsCurrency
      });
      await loadKitty();
      setShowSettings(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingTransaction(null);
    setFormType('EXPENSE');
    setFormAmount('');
    setFormDescription('');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormCategory('studio');
  };

  const openEditForm = (transaction) => {
    setEditingTransaction(transaction);
    setFormType(transaction.type);
    setFormAmount(transaction.amount.toString());
    setFormDescription(transaction.description);
    setFormDate(format(new Date(transaction.date), 'yyyy-MM-dd'));
    setFormCategory(transaction.category || 'other');
    setShowForm(true);
  };

  const getTypeInfo = (type) => TRANSACTION_TYPES.find(t => t.id === type) || TRANSACTION_TYPES[0];

  const filteredTransactions = useMemo(() => {
    const txs = kitty?.transactions || [];
    if (filterType === 'income') return txs.filter(t => ['GIG_PAY', 'FEE', 'OTHER_INCOME'].includes(t.type));
    if (filterType === 'expense') return txs.filter(t => t.type === 'EXPENSE');
    return txs;
  }, [kitty?.transactions, filterType]);

  const groupedTransactions = useMemo(() => {
    return filteredTransactions.reduce((groups, t) => {
      const month = format(new Date(t.date), 'MMMM yyyy');
      if (!groups[month]) groups[month] = [];
      groups[month].push(t);
      return groups;
    }, {});
  }, [filteredTransactions]);

  const totalIncome = useMemo(() => {
    return (kitty?.transactions || [])
      .filter(t => ['GIG_PAY', 'FEE', 'OTHER_INCOME'].includes(t.type))
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [kitty?.transactions]);

  const totalExpenses = useMemo(() => {
    return (kitty?.transactions || [])
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [kitty?.transactions]);

  const totalGigPay = useMemo(() => {
    return (kitty?.transactions || [])
      .filter(t => t.type === 'GIG_PAY')
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

  // Convert Decimal/string to number and format
  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({length: 3}).map((_, i) => <Skeleton.Card key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-bg-primary)] min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
              <span>💰</span> Band Kitty
            </h2>
            <div className={`text-3xl font-bold mt-2 ${(kitty?.currentBalance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {currencySymbol}{fmt(kitty?.currentBalance || 0)}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">
              Starting balance: {currencySymbol}{Number(kitty?.startingBalance || 0).toFixed(2)} as of {kitty?.balanceAsOfDate ? format(new Date(kitty.balanceAsOfDate), 'dd-MMM-yyyy') : '-'}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="px-3 py-1.5 text-sm bg-[var(--color-bg-tertiary)] hover:brightness-110 text-[var(--color-text-secondary)] rounded transition-colors"
            >
              Settings
            </button>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
            >
              + Add Transaction
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3">
            <div className="text-xs text-[var(--color-text-muted)]">Total Income</div>
            <div className="text-lg font-semibold text-green-400">
              {currencySymbol}{fmt(totalIncome)}
            </div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3">
            <div className="text-xs text-[var(--color-text-muted)]">Total Expenses</div>
            <div className="text-lg font-semibold text-red-400">
              {currencySymbol}{fmt(totalExpenses)}
            </div>
          </div>
          <div className="bg-[var(--color-bg-secondary)] rounded-lg p-3">
            <div className="text-xs text-[var(--color-text-muted)]">Gig Payments</div>
            <div className="text-lg font-semibold text-blue-400">
              {currencySymbol}{fmt(totalGigPay)}
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {['all', 'income', 'expense'].map(filter => (
            <button
              key={filter}
              onClick={() => setFilterType(filter)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                filterType === filter
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:brightness-110'
              }`}
            >
              {filter === 'all' ? 'All' : filter === 'income' ? 'Income' : 'Expenses'}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && <ErrorMessage message={error} onRetry={loadKitty} />}

        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">💰</div>
            <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
              No transactions yet
            </h3>
            <p className="text-[var(--color-text-muted)] max-w-sm mb-4">
              Track shared band expenses, gig payments, and income to keep everyone in the loop.
            </p>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="btn bg-green-600 hover:bg-green-700 text-white"
            >
              + Add Transaction
            </button>
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([month, transactions]) => (
            <div key={month} className="mb-6">
              <h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">{month}</h3>
              <div className="space-y-2">
                {transactions.map(t => {
                  const typeInfo = getTypeInfo(t.type);
                  return (
                    <div
                      key={t.id}
                      className="bg-[var(--color-bg-secondary)] rounded-lg p-3 flex items-center gap-3"
                    >
                      <div className="text-2xl">{typeInfo.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[var(--color-text-primary)] truncate">{t.description}</div>
                        <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-2">
                          <span>{format(new Date(t.date), 'dd-MMM-yyyy')}</span>
                          <span>•</span>
                          <span>{typeInfo.label}</span>
                          {t.category && (
                            <>
                              <span>•</span>
                              <span className="capitalize">{t.category}</span>
                            </>
                          )}
                          {t.gig && (
                            <>
                              <span>•</span>
                              <span className="text-blue-400">Linked to gig</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${typeInfo.positive ? 'text-green-400' : 'text-red-400'}`}>
                          {typeInfo.positive ? '+' : '-'}{currencySymbol}{fmt(t.amount)}
                        </div>
                        {runningBalanceMap[t.id] !== undefined && (
                          <div className={`text-xs ${runningBalanceMap[t.id] >= 0 ? 'text-[var(--color-text-muted)]' : 'text-red-400'}`}>
                            Bal: {currencySymbol}{fmt(runningBalanceMap[t.id])}
                          </div>
                        )}
                      </div>
                      {!t.gigId && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditForm(t)}
                            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
                            title="Edit"
                            aria-label="Edit transaction"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(t)}
                            className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[var(--color-bg-tertiary)] rounded transition-colors"
                            title="Delete"
                            aria-label="Delete transaction"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Transaction Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
      >
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-type">Type</label>
                <select
                  id="kitty-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="modal-input w-full"
                >
                  {TRANSACTION_TYPES.map(type => (
                    <option key={type.id} value={type.id}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {formType === 'EXPENSE' && (
                <div>
                  <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-category">Category</label>
                  <select
                    id="kitty-category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="modal-input w-full"
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-amount">Amount ({currencySymbol})</label>
                <input
                  id="kitty-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="modal-input w-full"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-description">Description (optional)</label>
                <input
                  id="kitty-description"
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="modal-input w-full"
                  placeholder="e.g., New guitar strings"
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-date">Date</label>
                <input
                  id="kitty-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="modal-input w-full"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 bg-[var(--color-bg-tertiary)] hover:brightness-110 text-[var(--color-text-primary)] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
                >
                  {formLoading ? 'Saving...' : editingTransaction ? 'Save Changes' : 'Add Transaction'}
                </button>
              </div>
            </form>
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Kitty Settings"
      >
            <form onSubmit={handleSaveSettings} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-currency">Currency</label>
                <select
                  id="kitty-currency"
                  value={settingsCurrency}
                  onChange={(e) => setSettingsCurrency(e.target.value)}
                  className="modal-input w-full"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} - {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-starting-balance">Starting Balance ({currencySymbol})</label>
                <input
                  id="kitty-starting-balance"
                  type="number"
                  step="0.01"
                  value={settingsBalance}
                  onChange={(e) => setSettingsBalance(e.target.value)}
                  className="modal-input w-full"
                  placeholder="0.00"
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  The band's balance before any tracked transactions
                </p>
              </div>

              <div>
                <label className="block text-sm text-[var(--color-text-muted)] mb-1" htmlFor="kitty-balance-date">Balance As Of Date</label>
                <input
                  id="kitty-balance-date"
                  type="date"
                  value={settingsDate}
                  onChange={(e) => setSettingsDate(e.target.value)}
                  className="modal-input w-full"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-2 bg-[var(--color-bg-tertiary)] hover:brightness-110 text-[var(--color-text-primary)] rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsLoading}
                  className="flex-1 px-4 py-2 bg-[var(--color-primary)] hover:brightness-110 text-white rounded transition-colors disabled:opacity-50"
                >
                  {settingsLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Transaction"
        message={`Are you sure you want to delete "${deleteConfirm?.description}"?`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

export default BandKitty;
