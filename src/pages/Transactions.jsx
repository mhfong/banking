import { useState, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useMask } from '../contexts/MaskContext'
import { useHotkeys } from '../hooks/useHotkeys'
import { useHotkeysConfig } from '../contexts/HotkeysContext'
import MaskToggle from '../components/MaskToggle'
import { db } from '../firebase'
import {
  collection, query, onSnapshot,
  addDoc, deleteDoc, updateDoc, doc, Timestamp, getDoc, setDoc
} from 'firebase/firestore'
import '../styles/transactions.css'

const CATEGORY_ICONS = {
  Food: 'fa-utensils',
  Transport: 'fa-bus',
  Bills: 'fa-receipt',
  Gambling: 'fa-dice',
  Home: 'fa-home',
  Travel: 'fa-plane',
  'Card Collecting': 'fa-clone',
  Income: 'fa-briefcase',
  Investment: 'fa-chart-line',
  Tax: 'fa-file-invoice-dollar',
  Other: 'fa-ellipsis-h',
}

const CATEGORY_COLORS = {
  Food: '#e5534b',
  Transport: '#6cb6ff',
  Bills: '#c69026',
  Gambling: '#986ee2',
  Home: '#57ab5a',
  Travel: '#e0823d',
  'Card Collecting': '#dcbdfb',
  Income: '#57ab5a',
  Investment: '#539bf5',
  Tax: '#f69d50',
  Other: '#768390',
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
  income: ['Bills', 'Food', 'Gambling', 'Other', 'Card Collecting', 'Home', 'Income', 'Transport', 'Tax', 'Travel', 'Investment'],
  expense: ['Bills', 'Food', 'Gambling', 'Other', 'Card Collecting', 'Home', 'Income', 'Transport', 'Tax', 'Travel', 'Investment']
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
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
}

function fmtAmount(v) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Transactions() {
  const { user } = useAuth()
  const { mask } = useMask()
  const [searchParams] = useSearchParams()
  const [transactions, setTransactions] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  // Controls
  const [period, setPeriod] = useState(() => searchParams.get('from') ? PERIOD_OPTIONS[4] : PERIOD_OPTIONS[1]) // All if URL params, else 30 Days
  const [showPeriod, setShowPeriod] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [sortBy, setSortBy] = useState('date') // date | expense
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')
  const [dateFrom, setDateFrom] = useState(() => searchParams.get('from') || (() => { const d = new Date(); d.setDate(d.getDate() - 6); return toDateStr(d) })())
  const [dateTo, setDateTo] = useState(() => searchParams.get('to') || toDateStr(new Date()))

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
  const [formExcludeChart, setFormExcludeChart] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const periodRef = useRef(null)

  // Fetch transactions
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'transactions'))
    const unsub = onSnapshot(q, (snap) => {
      const txns = snap.docs.map(d => {
        const data = d.data()
        return { id: d.id, ...data, _date: parseDate(data.date), _dateStr: toDateStr(parseDate(data.date)) }
      }).filter(t => t.userId === user.uid || t.userId === 'global')
      setTransactions(txns)
    })
    return unsub
  }, [user])

  // Load last updated timestamp from Firestore
  useEffect(() => {
    if (!user) return
    async function loadLastUpdated() {
      const snap = await getDoc(doc(db, 'userSettings', user.uid))
      if (snap.exists() && snap.data().transactionsLastUpdated) {
        setLastUpdated(new Date(snap.data().transactionsLastUpdated))
      }
    }
    loadLastUpdated()
  }, [user])

  async function saveLastUpdated() {
    const now = new Date()
    setLastUpdated(now)
    await setDoc(doc(db, 'userSettings', user.uid), { transactionsLastUpdated: now.toISOString() }, { merge: true })
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (periodRef.current && !periodRef.current.contains(e.target)) setShowPeriod(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Hotkeys for adding transactions
  const { hotkeys } = useHotkeysConfig()
  useHotkeys([
    {
      ...hotkeys.addTransaction,
      callback: (e) => {
        setShowForm(true)
        setEditingId(null)
        setFormType('expense')
        setFormAmount('')
        setFormDesc('')
        setFormCategory(FORM_CATEGORIES.expense[0])
        setFormDate(toDateStr(new Date()))
        setFormPayment(PAYMENT_METHODS[0])
      }
    },
    {
      ...hotkeys.closeForm,
      callback: (e) => {
        if (showForm) {
          setShowForm(false)
          e.preventDefault()
        }
      }
    }
  ])

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
    if (period.days === 'custom') return null
    if (!period.days) return null
    const d = new Date()
    d.setDate(d.getDate() - period.days)
    return toDateStr(d)
  }, [period])

  // Grouped and filtered
  const groupedTransactions = useMemo(() => {
    let filtered = transactions

    // Period filter
    if (dateFrom) filtered = filtered.filter(t => t._dateStr >= dateFrom)
    if (dateTo) filtered = filtered.filter(t => t._dateStr <= dateTo)

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

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(t =>
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.paymentMethod && t.paymentMethod.toLowerCase().includes(q)) ||
        (t.amount && String(t.amount).includes(q))
      )
    }

    // Group by date
    const byDate = {}
    for (const t of filtered) {
      const key = t._dateStr
      if (!byDate[key]) byDate[key] = []
      byDate[key].push(t)
    }

    const entries = Object.entries(byDate)
    entries.sort((a, b) => b[0].localeCompare(a[0]))

    const groups = entries.map(([date, txns]) => {
      const dailyTotal = txns.reduce((s, t) => s + (t.type === 'expense' ? -t.amount : t.amount), 0)
      const dailyExpense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      return { date, txns, dailyTotal, dailyExpense }
    })

    if (sortBy === 'expense') groups.sort((a, b) => b.dailyExpense - a.dailyExpense)

    return groups
  }, [transactions, dateCutoff, typeFilter, categoryFilter, paymentFilter, allCategories, allPaymentMethods, period, customDateFrom, customDateTo, dateFrom, dateTo, sortBy, searchQuery])

  const totalCount = groupedTransactions.reduce((s, g) => s + g.txns.length, 0)
  const totalIncome = groupedTransactions.reduce((s, g) => s + g.txns.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0), 0)
  const totalExpense = groupedTransactions.reduce((s, g) => s + g.txns.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0), 0)
  const netTotal = totalIncome - totalExpense

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const visibleGroups = groupedTransactions.slice(0, visibleCount)
  const hasMore = visibleCount < groupedTransactions.length

  const dateRange = useMemo(() => {
    if (groupedTransactions.length === 0) return { from: '', to: '' }
    const dates = groupedTransactions.map(g => g.date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [groupedTransactions])

  const fromRef = useRef(null)
  const toRef = useRef(null)

  useEffect(() => {
    if (formType === 'income') {
      setFormCategory('Income')
      setFormPayment('FPS')
    } else {
      setFormCategory('Food')
      setFormPayment(PAYMENT_METHODS[0])
    }
  }, [formType])

  async function handleAdd(e) {
    e.preventDefault()
    if (!formAmount || !formDesc) return
    setFormLoading(true)
    try {
      const txnData = {
        userId: user.uid || 'global',
        type: formType,
        amount: parseFloat(formAmount),
        description: formDesc,
        category: formCategory,
        paymentMethod: formPayment,
        date: Timestamp.fromDate(new Date(formDate + 'T12:00:00')),
        excludeFromChart: formExcludeChart
      }
      if (editingId) {
        await updateDoc(doc(db, 'transactions', editingId), txnData)
        setEditingId(null)
      } else {
        txnData.createdAt = Timestamp.now()
        await addDoc(collection(db, 'transactions'), txnData)
      }
      setFormAmount('')
      setFormDesc('')
      setFormExcludeChart(false)
      setShowForm(false)
      saveLastUpdated()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setFormLoading(false)
  }

  function handleEdit(t) {
    setEditingId(t.id)
    setFormType(t.type)
    setFormAmount(String(t.amount))
    setFormDesc(t.description || '')
    setFormCategory(t.category)
    setFormPayment(t.paymentMethod || PAYMENT_METHODS[0])
    setFormDate(t._dateStr || toDateStr(new Date()))
    setFormExcludeChart(t.excludeFromChart || false)
    setShowForm(true)
  }

  const [deleteId, setDeleteId] = useState(null)

  async function handleDelete(id) {
    setDeleteId(id)
  }

  async function confirmDelete() {
    if (!deleteId) return
    try {
      await deleteDoc(doc(db, 'transactions', deleteId))
      saveLastUpdated()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setDeleteId(null)
  }

  function getCategoryIcon(cat) {
    return CATEGORY_ICONS[cat] || 'fa-star'
  }

  function getCategoryColor(cat) {
    return CATEGORY_COLORS[cat] || '#768390'
  }

  return (
    <div className="txn-page">
      {/* Top bar */}
      <div className="txn-top-bar">
        <h1><i className="fas fa-exchange-alt"></i> Transactions</h1>
        <MaskToggle />
      </div>
      {lastUpdated && <div className="txn-last-updated">Last Updated: {lastUpdated.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</div>}

      {/* Controls */}
      <div className="txn-controls">
        <div className="dropdown-wrapper" ref={periodRef}>
          <button className="pill-btn" onClick={() => { setShowPeriod(!showPeriod) }}>
            {period.label} <i className="fas fa-caret-down"></i>
          </button>
          {showPeriod && (
            <div className="dropdown-menu">
              {PERIOD_OPTIONS.map(p => (
                <button key={p.label} className={`dropdown-item ${p.label === period.label ? 'active' : ''}`}
                  onClick={() => {
                    setPeriod(p); setShowPeriod(false); setVisibleCount(PAGE_SIZE)
                    const to = toDateStr(new Date())
                    if (p.days) {
                      const f = new Date(); f.setDate(f.getDate() - p.days + 1)
                      setDateFrom(toDateStr(f)); setDateTo(to)
                    } else {
                      setDateFrom(''); setDateTo('')
                    }
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`pill-btn ${sortBy === 'expense' ? 'active-sort' : ''}`}
          onClick={() => setSortBy(s => s === 'date' ? 'expense' : 'date')}>
          <i className="fas fa-sort-amount-down"></i> {sortBy === 'expense' ? 'Top Expense' : 'Recent'}
        </button>
        <button className={`pill-btn filter-trigger ${activeFilterCount > 0 ? 'has-filters' : ''}`}
          onClick={() => setShowFilter(true)}>
          <i className="fas fa-filter"></i> Filter
          {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Summary bar */}
      <div className="txn-summary-bar">
        <div className="txn-summary-top">
          <div className="txn-date-buttons">
            <input type="date" className="date-picker-btn" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setVisibleCount(PAGE_SIZE) }} />
            <span className="date-separator">-</span>
            <input type="date" className="date-picker-btn" value={dateTo} onChange={e => { setDateTo(e.target.value); setVisibleCount(PAGE_SIZE) }} />
            <button className="date-clear" onClick={() => { const t = toDateStr(new Date()); const f = new Date(); f.setDate(f.getDate() - 29); setDateFrom(toDateStr(f)); setDateTo(t); setPeriod(PERIOD_OPTIONS[1]); setCategoryFilter({}); setPaymentFilter({}); setTypeFilter({ income: true, expense: true }); setSearchQuery(''); setVisibleCount(PAGE_SIZE) }}>
                <i className="fas fa-undo"></i>
              </button>
          </div>
        </div>
        <div className="txn-search">
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE) }}
          />
          {searchQuery && <button className="txn-search-clear" onClick={() => setSearchQuery('')}><i className="fas fa-times"></i></button>}
        </div>
      </div>

      {/* Transaction list */}
      <div className="txn-list">
        {visibleGroups.length === 0 && (
          <div className="txn-empty">
            <i className="fas fa-search"></i>
            <p>No transactions found</p>
          </div>
        )}
        {visibleGroups.map(group => (
          <div key={group.date} className="txn-day-group">
            <div className="txn-day-header">
              <span className="txn-day-date">{formatDateLong(group.date)}</span>
              <span className={`txn-day-total ${sortBy === 'expense' ? 'negative' : group.dailyTotal >= 0 ? 'positive' : 'negative'}`}>
                {sortBy === 'expense' ? mask('-' + fmtAmount(group.dailyExpense)) : mask((group.dailyTotal >= 0 ? '+' : '-') + fmtAmount(Math.abs(group.dailyTotal)))}
              </span>
            </div>
            {group.txns.map(t => (
              <div key={t.id} className="txn-item" onClick={() => handleEdit(t)}>
                <div className="txn-item-left">
                  <div className="txn-icon" style={{ background: getCategoryColor(t.category) + '20', color: getCategoryColor(t.category) }}>
                    <i className={`fas ${getCategoryIcon(t.category)}`}></i>
                  </div>
                  <div className="txn-item-info">
                    <div className="txn-item-desc">{t.category}</div>
                    {t.description && <div className="txn-item-remark">{t.description}</div>}
                  </div>
                </div>
                <div className="txn-item-right">
                  <div className={`txn-item-amount ${t.type}`}>
                    {mask((t.type === 'expense' ? '-' : '+') + fmtAmount(t.amount))}
                  </div>
                  <div className="txn-item-meta">{t.paymentMethod || ''}</div>
                </div>
                <button className="txn-delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(t.id) }}>
                  <i className="fas fa-trash-alt"></i>
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Infinite Scroll */}
      {hasMore && (
        <div className="load-more" ref={el => {
          if (!el) return
          const obs = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) setVisibleCount(c => c + PAGE_SIZE)
          }, { threshold: 0.1 })
          obs.observe(el)
          return () => obs.disconnect()
        }}>
          <div className="load-more-spinner"><i className="fas fa-spinner fa-spin"></i></div>
        </div>
      )}

      {/* FAB */}
      <button className="txn-back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <i className="fas fa-chevron-up"></i>
      </button>

      <button className="txn-fab" onClick={() => { setEditingId(null); setFormAmount(''); setFormDesc(''); setFormExcludeChart(false); setShowForm(true) }}>
        <i className="fas fa-plus"></i>
      </button>

      {/* Add form modal */}
      {showForm && (
        <>
          <div className="filter-overlay" onClick={() => setShowForm(false)} />
          <div className="filter-panel txn-add-panel">
            <div className="filter-panel-header">
              <h2>{editingId ? 'Edit Transaction' : 'Add Transaction'}</h2>
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
              <div className="txn-form-toggle">
                <label className="toggle-label">
                  <span>Exclude from chart</span>
                  <div className={`toggle-switch ${formExcludeChart ? 'active' : ''}`} onClick={() => setFormExcludeChart(!formExcludeChart)}>
                    <div className="toggle-knob" />
                  </div>
                </label>
              </div>
              <button type="submit" className="txn-form-submit" disabled={formLoading}>
                {formLoading ? 'Saving...' : editingId ? 'Update' : `Add ${formType === 'income' ? 'Income' : 'Expense'}`}
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
              <button className="filter-done-btn" onClick={() => { setShowFilter(false); setVisibleCount(PAGE_SIZE) }}>Done</button>
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
              <div className="filter-section-header">
                <div className="filter-section-title">Category</div>
                <button className="filter-clear-btn" onClick={() => setCategoryFilter({})}>Clear All</button>
              </div>
              <div className="filter-chips">
                {allCategories.map(c => (
                  <button key={c} className={`filter-chip ${categoryFilter[c] ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(p => ({ ...p, [c]: !p[c] }))}>{c}</button>
                ))}
              </div>
            </div>

            <div className="filter-section">
              <div className="filter-section-header">
                <div className="filter-section-title">Payment Method</div>
                <button className="filter-clear-btn" onClick={() => setPaymentFilter({})}>Clear All</button>
              </div>
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

      {/* Delete confirm modal */}
      {deleteId && (
        <>
          <div className="filter-overlay" onClick={() => setDeleteId(null)} />
          <div className="confirm-modal">
            <div className="confirm-icon"><i className="fas fa-trash-alt"></i></div>
            <h3>Delete Transaction</h3>
            <p>Are you sure? This cannot be undone.</p>
            <div className="confirm-buttons">
              <button className="btn-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-confirm-delete" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
