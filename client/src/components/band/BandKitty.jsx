import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import api from '../../services/api';
import ConfirmDialog from '../common/ConfirmDialog';

const TRANSACTION_TYPES = [
  { id: 'GIG_PAY', label: 'Gig Pay', icon: '🎤', color: 'text-green-400', positive: true },
  { id: 'FEE', label: 'Fee', icon: '💵', color: 'text-green-400', positive: true },
  { id: 'EXPENSE', label: 'Expense', icon: '💸', color: 'text-red-400', positive: false },
  { id: 'OTHER_INCOME', label: 'Other Income', icon: '💰', color: 'text-green-400', positive: true }
];

const EXPENSE_CATEGORIES = [
  { id: 'equipment', label: 'Equipment' },
  { id: 'travel', label: 'Travel' },
  { id: 'rehearsal', label: 'Rehearsal Space' },
  { id: 'promo', label: 'Promotion' },
  { id: 'other', label: 'Other' }
];

const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' }
];

function BandKitty({ workspaceId, isAdmin }) {
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
  const [formCategory, setFormCategory] = useState('other');
  const [formLoading, setFormLoading] = useState(false);

  // Settings state
  const [settingsBalance, setSettingsBalance] = useState('');
  const [settingsDate, setSettingsDate] = useState('');
  const [settingsCurrency, setSettingsCurrency] = useState('USD');
  const [settingsLoading, setSettingsLoading] = useState(false);

  const getCurrencySymbol = () => {
    const curr = CURRENCIES.find(c => c.code === (kitty?.currency || 'USD'));
    return curr?.symbol || '$';
  };

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
    if (!formAmount || !formDescription) return;

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
    setFormCategory('other');
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

  const filteredTransactions = kitty?.transactions?.filter(t => {
    if (filterType === 'all') return true;
    if (filterType === 'income') return ['GIG_PAY', 'FEE', 'OTHER_INCOME'].includes(t.type);
    if (filterType === 'expense') return t.type === 'EXPENSE';
    return true;
  }) || [];

  // Group transactions by month
  const groupedTransactions = filteredTransactions.reduce((groups, t) => {
    const month = format(new Date(t.date), 'MMMM yyyy');
    if (!groups[month]) groups[month] = [];
    groups[month].push(t);
    return groups;
  }, {});

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-900 min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>💰</span> Band Kitty
            </h2>
            <div className={`text-3xl font-bold mt-2 ${(kitty?.currentBalance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {getCurrencySymbol()}{(kitty?.currentBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Starting balance: {getCurrencySymbol()}{kitty?.startingBalance?.toFixed(2) || '0.00'} as of {kitty?.balanceAsOfDate ? format(new Date(kitty.balanceAsOfDate), 'MMM d, yyyy') : '-'}
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Settings
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 rounded transition-colors"
              >
                + Add Transaction
              </button>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400">Total Income</div>
            <div className="text-lg font-semibold text-green-400">
              {getCurrencySymbol()}{(kitty?.transactions?.filter(t => ['GIG_PAY', 'FEE', 'OTHER_INCOME'].includes(t.type)).reduce((sum, t) => sum + t.amount, 0) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400">Total Expenses</div>
            <div className="text-lg font-semibold text-red-400">
              {getCurrencySymbol()}{(kitty?.transactions?.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + t.amount, 0) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400">Gig Payments</div>
            <div className="text-lg font-semibold text-blue-400">
              {getCurrencySymbol()}{(kitty?.transactions?.filter(t => t.type === 'GIG_PAY').reduce((sum, t) => sum + t.amount, 0) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {filter === 'all' ? 'All' : filter === 'income' ? 'Income' : 'Expenses'}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
            {error}
          </div>
        )}

        {Object.keys(groupedTransactions).length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No transactions yet.
            {isAdmin && ' Click "Add Transaction" to get started.'}
          </div>
        ) : (
          Object.entries(groupedTransactions).map(([month, transactions]) => (
            <div key={month} className="mb-6">
              <h3 className="text-sm font-medium text-gray-400 mb-2">{month}</h3>
              <div className="space-y-2">
                {transactions.map(t => {
                  const typeInfo = getTypeInfo(t.type);
                  return (
                    <div
                      key={t.id}
                      className="bg-gray-800 rounded-lg p-3 flex items-center gap-3"
                    >
                      <div className="text-2xl">{typeInfo.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{t.description}</div>
                        <div className="text-xs text-gray-400 flex items-center gap-2">
                          <span>{format(new Date(t.date), 'MMM d, yyyy')}</span>
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
                      <div className={`text-lg font-semibold ${typeInfo.color}`}>
                        {typeInfo.positive ? '+' : '-'}{getCurrencySymbol()}{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      {isAdmin && !t.gigId && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditForm(t)}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(t)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                            title="Delete"
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
      {showForm && isAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-modal overflow-y-auto">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">
                {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
              </h3>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
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
                  <label className="block text-sm text-gray-400 mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-400 mb-1">Amount ({getCurrencySymbol()})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                  placeholder="e.g., New guitar strings"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-50"
                >
                  {formLoading ? 'Saving...' : editingTransaction ? 'Save Changes' : 'Add Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && isAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg w-full max-w-md">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">Kitty Settings</h3>
            </div>
            <form onSubmit={handleSaveSettings} className="p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Currency</label>
                <select
                  value={settingsCurrency}
                  onChange={(e) => setSettingsCurrency(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} - {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Starting Balance ({getCurrencySymbol()})</label>
                <input
                  type="number"
                  step="0.01"
                  value={settingsBalance}
                  onChange={(e) => setSettingsBalance(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The band's balance before any tracked transactions
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Balance As Of Date</label>
                <input
                  type="date"
                  value={settingsDate}
                  onChange={(e) => setSettingsDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 text-white"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settingsLoading}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors disabled:opacity-50"
                >
                  {settingsLoading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Transaction"
          message={`Are you sure you want to delete "${deleteConfirm.description}"?`}
          confirmLabel="Delete"
          confirmStyle="danger"
          onConfirm={() => handleDelete(deleteConfirm.id)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

export default BandKitty;
