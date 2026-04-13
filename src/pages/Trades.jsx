import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useIBKRData } from '../contexts/IBKRDataContext'
import { useMask } from '../contexts/MaskContext'
import MaskToggle from '../components/MaskToggle'
import '../styles/trades.css'

const fmt = (v) => {
  const abs = Math.abs(Math.round(v * 100) / 100)
  const str = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v > 0.005) return `+${str}`
  if (v < -0.005) return `-${str}`
  return str
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

export default function Trades() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { mask } = useMask()
  const { data, loading } = useIBKRData()

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  const { trades, fifoDailyPnL } = data

  // Build FIFO PNL lookup
  const fifoMap = useMemo(() => {
    const m = {}
    ;(fifoDailyPnL || []).forEach(d => { m[d.date] = d.pnl })
    return m
  }, [fifoDailyPnL])

  const dateParam = searchParams.get('date')

  // Dropdowns
  const [period, setPeriod] = useState(dateParam ? { label: 'All', days: null } : PERIOD_OPTIONS[1])
  const [sort, setSort] = useState(SORT_OPTIONS[0])
  const [showPeriod, setShowPeriod] = useState(false)
  const [showSort, setShowSort] = useState(false)

  // Filter panel
  const [showFilter, setShowFilter] = useState(false)
  const [sideFilter, setSideFilter] = useState({ Buy: true, Sell: true })
  const [symbolFilter, setSymbolFilter] = useState({}) // empty = all selected

  const [page, setPage] = useState(0)

  const periodRef = useRef(null)
  const sortRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (periodRef.current && !periodRef.current.contains(e.target)) setShowPeriod(false)
      if (sortRef.current && !sortRef.current.contains(e.target)) setShowSort(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const symbols = useMemo(() => {
    const s = new Set()
    trades.forEach(t => s.add(t.symbol))
    return Array.from(s).sort()
  }, [trades])

  // Initialize symbol filter with all selected
  useEffect(() => {
    if (Object.keys(symbolFilter).length === 0) {
      const init = {}
      symbols.forEach(s => { init[s] = true })
      setSymbolFilter(init)
    }
  }, [symbols])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (!sideFilter.Buy || !sideFilter.Sell) count++
    const selectedSymbols = Object.values(symbolFilter).filter(Boolean).length
    if (selectedSymbols < symbols.length && selectedSymbols > 0) count++
    return count
  }, [sideFilter, symbolFilter, symbols])

  // Compute date cutoff from period
  const dateCutoff = useMemo(() => {
    if (dateParam) return dateParam // single date mode
    if (!period.days) return null
    const d = new Date()
    d.setDate(d.getDate() - period.days)
    return d.toISOString().slice(0, 10)
  }, [period, dateParam])

  const dateCutoffEnd = dateParam || null

  const groupedTrades = useMemo(() => {
    let filtered = trades
    if (dateCutoff && !dateParam) filtered = filtered.filter(t => t.date >= dateCutoff)
    if (dateParam) filtered = filtered.filter(t => t.date === dateParam)
    if (!sideFilter.Buy) filtered = filtered.filter(t => t.type !== 'Buy')
    if (!sideFilter.Sell) filtered = filtered.filter(t => t.type !== 'Sell')
    const selectedSymbols = Object.entries(symbolFilter).filter(([, v]) => v).map(([k]) => k)
    if (selectedSymbols.length > 0 && selectedSymbols.length < symbols.length) {
      filtered = filtered.filter(t => symbolFilter[t.symbol])
    }

    const byDate = {}
    for (const t of filtered) {
      if (!byDate[t.date]) byDate[t.date] = []
      byDate[t.date].push(t)
    }
    const entries = Object.entries(byDate)
    entries.sort((a, b) => sort.value === 'recent' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]))
    return entries.map(([date, trades]) => ({
      date,
      trades,
      dailyPnL: fifoMap[date] ?? trades.reduce((s, t) => s + t.netHKD, 0),
    }))
  }, [trades, dateCutoff, dateParam, sideFilter, symbolFilter, symbols, sort])

  const totalTrades = groupedTrades.reduce((s, g) => s + g.trades.length, 0)
  const totalPnL = groupedTrades.reduce((s, g) => s + g.dailyPnL, 0)
  const totalPages = Math.max(1, Math.ceil(groupedTrades.length / PAGE_SIZE))
  const pagedGroups = groupedTrades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const dateRangeText = useMemo(() => {
    if (groupedTrades.length === 0) return 'No trades'
    const dates = groupedTrades.map(g => g.date)
    const sorted = [...dates].sort()
    const f = (d) => {
      const dt = new Date(d + 'T00:00:00')
      return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    }
    return `${f(sorted[0])} - ${f(sorted[sorted.length - 1])}`
  }, [groupedTrades])

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function toggleSymbol(s) {
    setSymbolFilter(prev => ({ ...prev, [s]: !prev[s] }))
  }

  function toggleSide(side) {
    setSideFilter(prev => ({ ...prev, [side]: !prev[side] }))
  }

  return (
    <div className="trades-page">
      {/* Top bar */}
      <div className="trades-top-bar">
        <button className="back-btn" onClick={() => {
          if (dateParam) {
            navigate(`/investment?month=${dateParam.substring(0, 7)}`)
          } else {
            navigate('/investment')
          }
        }}>
          <i className="fas fa-arrow-left"></i>
        </button>
        <h1>Trades</h1>
        <div className="trades-top-right">
          <MaskToggle />
        </div>
      </div>

      {/* Controls row: Period + Sort + Filter */}
      <div className="trades-controls">
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

      {/* Summary header */}
      <div className="trades-summary-bar">
        <div className="trades-summary-left">
          <div className="trades-date-range">{dateRangeText}</div>
          <div className="trades-count">{totalTrades} Trade(s)</div>
        </div>
        <div className="trades-summary-right">
          <div className="trades-realized-label">REALIZED PNL</div>
          <div className={`trades-realized-badge ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {mask(fmt(totalPnL) + ' HKD')}
          </div>
        </div>
      </div>

      {/* Trade list */}
      <div className="trades-list">
        {pagedGroups.length === 0 && (
          <div className="trades-empty">
            <i className="fas fa-search"></i>
            <p>No trades found</p>
          </div>
        )}
        {pagedGroups.map(group => (
          <div key={group.date} className="trade-day-group">
            <div className="trade-day-header">
              <span className="trade-day-date">{formatDate(group.date)}</span>
              <span className={`trade-day-pnl ${group.dailyPnL >= 0 ? 'positive' : 'negative'}`}>
                {mask(fmt(group.dailyPnL) + ' HKD')}
              </span>
            </div>
            {group.trades.map((t, i) => {
              const isBuy = t.type === 'Buy'
              const amt = Math.abs(t.grossHKD ?? 0)
              const comm = Math.abs(t.commission || 0)
              return (
                <div key={i} className="trade-item">
                  <div className="trade-left">
                    <div className="trade-symbol-row">
                      <span className="trade-symbol">{t.symbol}</span>
                      <span className="trade-exchange">ARCA</span>
                      {!isBuy && <span className="trade-tag close">C</span>}
                      {isBuy && <span className="trade-tag open">O</span>}
                    </div>
                    <div className={`trade-action ${isBuy ? 'buy' : 'sell'}`}>
                      {isBuy ? 'Bought' : 'Sold'} {Math.abs(t.quantity)}
                    </div>
                    <div className="trade-fill-price">
                      {t.price.toFixed(2)} Limit
                    </div>
                  </div>
                  <div className="trade-middle">
                    <div className="trade-price">{mask('$' + t.price.toFixed(2))}</div>
                    <div className="trade-amount">{mask('$' + amt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }))}</div>
                    <div className="trade-comm">{mask(comm.toFixed(2) + ' HKD')}</div>
                  </div>
                  <div className="trade-right">
                    <div className="trade-time">
                      {/* No time in data, show date-based placeholder */}
                    </div>
                  </div>
                </div>
              )
            })}
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

      {/* Filter panel overlay */}
      {showFilter && (
        <>
          <div className="filter-overlay" onClick={() => setShowFilter(false)} />
          <div className="filter-panel">
            <div className="filter-panel-header">
              <h2>Filter</h2>
              <button className="filter-done-btn" onClick={() => { setShowFilter(false); setPage(0) }}>Done</button>
            </div>

            <div className="filter-section">
              <div className="filter-section-title">Asset Class</div>
              <div className="filter-chips">
                <span className="filter-chip active">Stock</span>
              </div>
            </div>

            <div className="filter-section">
              <div className="filter-section-title">Order Side</div>
              <div className="filter-chips">
                <button className={`filter-chip ${sideFilter.Buy ? 'active' : ''}`}
                  onClick={() => toggleSide('Buy')}>Buys</button>
                <button className={`filter-chip ${sideFilter.Sell ? 'active' : ''}`}
                  onClick={() => toggleSide('Sell')}>Sells</button>
              </div>
            </div>

            <div className="filter-section">
              <div className="filter-section-title">Symbol</div>
              <div className="filter-chips">
                {symbols.map(s => (
                  <button key={s} className={`filter-chip ${symbolFilter[s] ? 'active' : ''}`}
                    onClick={() => toggleSymbol(s)}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
