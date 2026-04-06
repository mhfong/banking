import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMask } from '../contexts/MaskContext'
import MaskToggle from '../components/MaskToggle'
import { db } from '../firebase'
import {
  collection, query, onSnapshot,
  addDoc, deleteDoc, doc, Timestamp
} from 'firebase/firestore'
import '../styles/transactions.css'

const CATEGORY_ICONS = {
  Food: 'fa-utensils',
  Transport: 'fa-bus',
  Bills: 'fa-receipt',
  Shopping: 'fa-shopping-bag',
  Gambling: 'fa-dice',
  'Home': 'fa-home',
  'Rent': 'fa-home',
  'Home/Rent': 'fa-home',
  Travel: 'fa-plane',
  Drinks: 'fa-glass-martini',
  'Card Collecting': 'fa-clone',
  Salary: 'fa-briefcase',
  Investment: 'fa-chart-line',
  ATM: 'fa-money-bill',
  Subscriptions: 'fa-tags',
  Personal: 'fa-user',
  Tax: 'fa-file-invoice-dollar',
  Entertainment: 'fa-star',
  Health: 'fa-heartbeat',
  Freelance: 'fa-laptop',
  'Other Income': 'fa-star',
  Other: 'fa-star',
}

const PERIOD_OPTIONS = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: '1 Year', days: 365 },
  { label: 'All', days: null },
]

const SORT_OPTIONS = [
  { label: 'Recent', value: 'recent' },
  { label: 'Oldest', value: 'oldest' },
]

const PAGE_SIZE = 10

const FORM_CATEGORIES = {
  income: ['Salary', 'Freelance', 'Investment', 'Other Income'],
  expense: ['Food', 'Transport', 'Housing', 'Entertainment', 'Shopping', 'Bills', 'Health', 'Drinks', 'Gambling', 'Card Collecting', 'Travel', 'Subscriptions', 'Personal', 'Tax', 'Other']
}

const PAYMENT_METHODS = ['HSBC Red', 'SC Mastercard', 'Cash', 'PayMe', 'Octopus', 'FPS', 'Bank Transfer', 'Other']

function parseDate(d) {
  if (!d) return new Date()
  if (d.toDate) return d.toDate()
  if (typeof d === 'string') return new Date(d + 'T00:00:00')
  return new Date()
}

function toDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function fmtAmount(v) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Transactions() {
  const { user } = useAuth()
  const { mask } = useMask()
  const [transactions, setTransactions] = useState([])

  // Controls
  const [period, setPeriod] = useState(PERIOD_OPTIONS[4]) // All
  const [sort, setSort] = useState(SORT_OPTIONS[0]) // Recent
  const [showPeriod, setShowPeriod] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [page, setPage] = useState(0)

  // Filters
  const [typeFilter, setTypeFilter] = useState({ income: true, expense: true })
  const [categoryFilter, setCategoryFilter] = useState({})
  const [paymentFilter, setPaymentFilter] = useState({})

  // Add form
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState('expense')
  const [formAmount, setFormAmount] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formCategory, setFormCategory] = useState(FORM_CATEGORIES.expense[0])
  const [formDate, setFormDate] = useState(toDateStr(new Date()))
  const [formPayment, setFormPayment] = useState(PAYMENT_METHODS[0])
  const [formLoading, setFormLoading] = useState(false)

  const periodRef = useRef(null)
  const sortRef = useRef(null)

  // Fetch transactions
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'transactions'))
    const unsub = onSnapshot(q, (snap) => {
      const txns = snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, _date: parseDate(data.date), _dateStr: toDateStr(parseDate(data.date)) }
      })
      setTransactions(txns)
    })
    return unsub
  }, [user])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (periodRef.current && !periodRef.current.contains(e.target)) setShowPeriod(false)
      if (sortRef.current && !sortRef.current.contains(e.target)) setShowSort(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Extract unique categories and payment methods from data
  const allCategories = useMemo(() => {
    const s = new Set()
    transactions.forEach(t => t.category && s.add(t.category))
    return Array.from(s).sort()
  }, [transactions])

  const allPaymentMethods = useMemo(() => {
    const s = new Set()
    transactions.forEach(t => t.paymentMethod && s.add(t.paymentMethod))
    return Array.from(s).sort()
  }, [transactions])

  // Init filters when data loads
  useEffect(() => {
    if (allCategories.length > 0 && Object.keys(categoryFilter).length === 0) {
      const init = {}
      allCategories.forEach(c => { init[c] = true })
      setCategoryFilter(init)
    }
  }, [allCategories])

  useEffect(() => {
    if (allPaymentMethods.length > 0 && Object.keys(paymentFilter).length === 0) {
      const init = {}
      allPaymentMethods.forEach(p => { init[p] = true })
      setPaymentFilter(init)
    }
  }, [allPaymentMethods])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (!typeFilter.income || !typeFilter.expense) count++
    const selCat = Object.values(categoryFilter).filter(Boolean).length
    if (selCat > 0 && selCat < allCategories.length) count++
    const selPay = Object.values(paymentFilter).filter(Boolean).length
    if (selPay > 0 && selPay < allPaymentMethods.length) count++
    return count
  }, [typeFilter, categoryFilter, paymentFilter, allCategories, allPaymentMethods])

  // Date cutoff
  const dateCutoff = useMemo(() => {
    if (!period.days) return null
    const d = new Date()
    d.setDate(d.getDate() - period.days)
    return toDateStr(d)
  }, [period])

  // Grouped and filtered
  const groupedTransactions = useMemo(() => {
    let filtered = transactions

    // Period filter
    if (dateCutoff) filtered = filtered.filter(t => t._dateStr >= dateCutoff)

    // Type filter
    if (!typeFilter.income) filtered = filtered.filter(t => t.type !== 'income')
    if (!typeFilter.expense) filtered = filtered.filter(t => t.type !== 'expense')

    // Category filter
    const selCats = Object.entries(categoryFilter).filter(([, v]) => v).map(([k]) => k)
    if (selCats.length > 0 && selCats.length < allCategories.length) {
      filtered = filtered.filter(t => categoryFilter[t.category])
    }

    // Payment filter
    const selPays = Object.entries(paymentFilter).filter(([, v]) => v).map(([k]) => k)
    if (selPays.length > 0 && selPays.length < allPaymentMethods.length) {
      filtered = filtered.filter(t => paymentFilter[t.paymentMethod])
    }

    // Group by date
    const byDate = {}
    for (const t of filtered) {
      const key = t._dateStr
      if (!byDate[key]) byDate[key] = []
      byDate[key].push(t)
    }

    const entries = Object.entries(byDate)
    entries.sort((a, b) => sort.value === 'recent' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]))

    return entries.map(([date, txns]) => {
      const dailyTotal = txns.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0)
      return { date, txns, dailyTotal }
    })
  }, [transactions, dateCutoff, typeFilter, categoryFilter, paymentFilter, allCategories, allPaymentMethods, sort])

  const totalCount = groupedTransactions.reduce((s, g) => s + g.txns.length, 0)
  const totalIncome = groupedTransactions.reduce((s, g) => s + g.txns.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0), 0)
  const totalExpense = groupedTransactions.reduce((s, g) => s + g.txns.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0), 0)
  const netTotal = totalIncome - totalExpense

  const totalPages = Math.max(1, Math.ceil(groupedTransactions.length / PAGE_SIZE))
  const pagedGroups = groupedTransactions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const dateRangeText = useMemo(() => {
    if (groupedTransactions.length === 0) return 'No transactions'
    const dates = groupedTransactions.map(g => g.date).sort()
    return `${formatDateShort(dates[0])} - ${formatDateShort(dates[dates.length - 1])}`
  }, [groupedTransactions])

  useEffect(() => { setFormCategory(FORM_CATEGORIES[formType][0]) }, [formType])

  async function handleAdd(e) {
    e.preventDefault()
    if (!formAmount || !formDesc) return
    setFormLoading(true)
    try {
      await addDoc(collection(db, 'transactions'), {
        userId: user.uid || 'global',
        type: formType,
        amount: parseFloat(formAmount),
        description: formDesc,
        category: formCategory,
        paymentMethod: formPayment,
        date: Timestamp.fromDate(new Date(formDate + 'T12:00:00')),
        createdAt: Timestamp.now()
      })
      setFormAmount('')
      setFormDesc('')
      setShowForm(false)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setFormLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this transaction?')) return
    try {
      await deleteDoc(doc(db, 'transactions', id))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  function getCategoryIcon(cat) {
    return CATEGORY_ICONS[cat] || 'fa-star'
  }

  return (
    <div className="txn-page">
      {/* Top bar */}
      <div className="txn-top-bar">
        <h1>Transactions</h1>
        <div className="txn-top-right">
          <MaskToggle />
        </div>
      </div>

      {/* Controls */}
      <div className="txn-controls">
        <div className="dropdown-wrapper" ref={periodRef}>
          <button className="pill-btn" onClick={() => { setShowPeriod(!showPeriod); setShowSort(false) }}>
            {period.label} <i className="fas fa-caret-down"></i>
          </button>
          {showPeriod && (
            <div className="dropdown-menu">
              {PERIOD_OPTIONS.map(p => (
                <button key={p.label} className={`dropdown-item ${p.label === period.label ? 'active' : ''}`}
                  onClick={() => { setPeriod(p); setShowPeriod(false); setPage(0) }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dropdown-wrapper" ref={sortRef}>
          <button className="pill-btn" onClick={() => { setShowSort(!showSort); setShowPeriod(false) }}>
            {sort.label} <i className="fas fa-caret-down"></i>
          </button>
          {showSort && (
            <div className="dropdown-menu">
              {SORT_OPTIONS.map(s => (
                <button key={s.value} className={`dropdown-item ${s.value === sort.value ? 'active' : ''}`}
                  onClick={() => { setSort(s); setShowSort(false); setPage(0) }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`pill-btn filter-trigger ${activeFilterCount > 0 ? 'has-filters' : ''}`}
          onClick={() => setShowFilter(true)}>
          <i className="fas fa-filter"></i> Filter
          {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Summary bar */}
      <div className="txn-summary-bar">
        <div className="txn-summary-left">
          <div className="txn-date-range">{dateRangeText}</div>
          <div className="txn-count">{totalCount.toLocaleString()} Transaction(s)</div>
        </div>
        <div className="txn-summary-right">
          <div className="txn-total-label">NET TOTAL</div>
          <div className={`txn-total-badge ${netTotal >= 0 ? 'positive' : 'negative'}`}>
            {mask((netTotal >= 0 ? '+' : '-') + fmtAmount(Math.abs(netTotal)))}
          </div>
        </div>
      </div>

      {/* Transaction list */}
      <div className="txn-list">
        {pagedGroups.length === 0 && (
          <div className="txn-empty">
            <i className="fas fa-search"></i>
            <p>No transactions found</p>
          </div>
        )}
        {pagedGroups.map(group => (
          <div key={group.date} className="txn-day-group">
            <div className="txn-day-header">
              <span className="txn-day-date">{formatDateLong(group.date)}</span>
              <span className={`txn-day-total ${group.dailyTotal >= 0 ? 'positive' : 'negative'}`}>
                {mask((group.dailyTotal >= 0 ? '+' : '-') + fmtAmount(Math.abs(group.dailyTotal)))}
              </span>
            </div>
            {group.txns.map(t => (
              <div key={t.id} className="txn-item">
                <div className="txn-item-left">
                  <div className={`txn-icon ${t.type}`}>
                    <i className={`fas ${getCategoryIcon(t.category)}`}></i>
                  </div>
                  <div className="txn-item-info">
                    <div className="txn-item-desc">
                      {t.category}
                    </div>
                    <div className="txn-item-remark">{t.description}</div>
                    <div className="txn-item-payment">{t.paymentMethod || ''}</div>
                  </div>
                </div>
                <div className="txn-item-right">
                  <div className={`txn-item-amount ${t.type}`}>
                    {mask((t.type === 'expense' ? '-' : '+') + fmtAmount(t.amount))}
                  </div>
                  <button className="txn-delete-btn" onClick={() => handleDelete(t.id)}>
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page === 0} onClick={() => setPage(0)}>
            <i className="fas fa-angle-double-left"></i>
          </button>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <i className="fas fa-angle-left"></i>
          </button>
          <span className="page-info">Page {page + 1} of {totalPages}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            <i className="fas fa-angle-right"></i>
          </button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
            <i className="fas fa-angle-double-right"></i>
          </button>
        </div>
      )}

      {/* FAB */}
      <button className="txn-fab" onClick={() => setShowForm(true)}>
        <i className="fas fa-plus"></i>
      </button>

      {/* Add form modal */}
      {showForm && (
        <>
          <div className="filter-overlay" onClick={() => setShowForm(false)} />
          <div className="filter-panel txn-add-panel">
            <div className="filter-panel-header">
              <h2>Add Transaction</h2>
              <button className="filter-done-btn" onClick={() => setShowForm(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="txn-form-type-toggle">
                <button type="button" className={`txn-form-toggle-btn ${formType === 'expense' ? 'active-expense' : ''}`}
                  onClick={() => setFormType('expense')}>Expense</button>
                <button type="button" className={`txn-form-toggle-btn ${formType === 'income' ? 'active-income' : ''}`}
                  onClick={() => setFormType('income')}>Income</button>
              </div>
              <div className="txn-form-group">
                <label>Amount ($)</label>
                <input type="number" step="0.01" min="0" value={formAmount}
                  onChange={e => setFormAmount(e.target.value)} placeholder="0.00" required />
              </div>
              <div className="txn-form-group">
                <label>Description</label>
                <input type="text" value={formDesc}
                  onChange={e => setFormDesc(e.target.value)} placeholder="What was this for?" required />
              </div>
              <div className="txn-form-row">
                <div className="txn-form-group">
                  <label>Category</label>
                  <select value={formCategory} onChange={e => setFormCategory(e.target.value)}>
                    {FORM_CATEGORIES[formType].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="txn-form-group">
                  <label>Payment</label>
                  <select value={formPayment} onChange={e => setFormPayment(e.target.value)}>
                    {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="txn-form-group">
                <label>Date</label>
                <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required />
              </div>
              <button type="submit" className="txn-form-submit" disabled={formLoading}>
                {formLoading ? 'Adding...' : `Add ${formType === 'income' ? 'Income' : 'Expense'}`}
              </button>
            </form>
          </div>
        </>
      )}

      {/* Filter panel */}
      {showFilter && (
        <>
          <div className="filter-overlay" onClick={() => setShowFilter(false)} />
          <div className="filter-panel">
            <div className="filter-panel-header">
              <h2>Filter</h2>
              <button className="filter-done-btn" onClick={() => { setShowFilter(false); setPage(0) }}>Done</button>
            </div>

            <div className="filter-section">
              <div className="filter-section-title">Type</div>
              <div className="filter-chips">
                <button className={`filter-chip ${typeFilter.income ? 'active' : ''}`}
                  onClick={() => setTypeFilter(p => ({ ...p, income: !p.income }))}>Income</button>
                <button className={`filter-chip ${typeFilter.expense ? 'active' : ''}`}
                  onClick={() => setTypeFilter(p => ({ ...p, expense: !p.expense }))}>Expense</button>
              </div>
            </div>

            <div className="filter-section">
              <div className="filter-section-title">Category</div>
              <div className="filter-chips">
                {allCategories.map(c => (
                  <button key={c} className={`filter-chip ${categoryFilter[c] ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(p => ({ ...p, [c]: !p[c] }))}>{c}</button>
                ))}
              </div>
            </div>

            <div className="filter-section">
              <div className="filter-section-title">Payment Method</div>
              <div className="filter-chips">
                {allPaymentMethods.map(p => (
                  <button key={p} className={`filter-chip ${paymentFilter[p] ? 'active' : ''}`}
                    onClick={() => setPaymentFilter(prev => ({ ...prev, [p]: !prev[p] }))}>{p}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
