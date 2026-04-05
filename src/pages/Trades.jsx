import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import data from '../data/ibkr_parsed.json'
import '../styles/trades.css'

const fmt = (v) => {
  const abs = Math.abs(Math.round(v * 100) / 100)
  const str = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (v > 0.005) return `+${str}`
  if (v < -0.005) return `-${str}`
  return str
}

const PAGE_SIZE = 10

export default function Trades() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { trades } = data

  const [filter, setFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState(searchParams.get('date') || '')
  const [dateTo, setDateTo] = useState(searchParams.get('date') || '')
  const [page, setPage] = useState(0)

  // If navigated from calendar with ?date=, set both from/to to that date
  useState(() => {
    const d = searchParams.get('date')
    if (d) {
      setDateFrom(d)
      setDateTo(d)
    }
  })

  const symbols = useMemo(() => {
    const s = new Set()
    trades.forEach(t => s.add(t.symbol))
    return ['all', ...Array.from(s).sort()]
  }, [trades])

  // Group trades by date, apply filters
  const groupedTrades = useMemo(() => {
    let filtered = filter === 'all' ? trades : trades.filter(t => t.symbol === filter)
    if (dateFrom) filtered = filtered.filter(t => t.date >= dateFrom)
    if (dateTo) filtered = filtered.filter(t => t.date <= dateTo)

    const byDate = {}
    for (const t of filtered) {
      if (!byDate[t.date]) byDate[t.date] = []
      byDate[t.date].push(t)
    }
    return Object.entries(byDate)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, trades]) => ({
        date,
        trades,
        dailyPnL: trades.reduce((s, t) => s + t.netHKD, 0)
      }))
  }, [trades, filter, dateFrom, dateTo])

  const totalTrades = groupedTrades.reduce((s, g) => s + g.trades.length, 0)
  const totalPnL = groupedTrades.reduce((s, g) => s + g.dailyPnL, 0)
  const totalPages = Math.max(1, Math.ceil(groupedTrades.length / PAGE_SIZE))
  const pagedGroups = groupedTrades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const dateRange = groupedTrades.length > 0
    ? `${groupedTrades[groupedTrades.length - 1].date} — ${groupedTrades[0].date}`
    : 'No trades'

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setFilter('all')
    setPage(0)
    setSearchParams({})
  }

  const hasDateFilter = dateFrom || dateTo

  return (
    <div className="trades-page">
      <div className="trades-top-bar">
        <button className="back-btn" onClick={() => navigate('/investment')}>
          <i className="fas fa-arrow-left"></i> Back
        </button>
        <h1>Trades</h1>
      </div>

      {/* Symbol Filter */}
      <div className="trades-filter">
        {symbols.map(s => (
          <button
            key={s}
            className={`filter-btn ${filter === s ? 'active' : ''}`}
            onClick={() => { setFilter(s); setPage(0) }}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Date Filter */}
      <div className="date-filter">
        <div className="date-filter-row">
          <div className="date-input-group">
            <label>From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0) }} />
          </div>
          <div className="date-input-group">
            <label>To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0) }} />
          </div>
          {hasDateFilter && (
            <button className="clear-date-btn" onClick={clearFilters}>
              <i className="fas fa-times"></i> Clear
            </button>
          )}
        </div>
      </div>

      {/* Summary header */}
      <div className="trades-summary-bar">
        <div className="trades-summary-left">
          <div className="trades-date-range">{dateRange}</div>
          <div className="trades-count">{totalTrades} Trade(s) · {groupedTrades.length} Day(s)</div>
        </div>
        <div className="trades-summary-right">
          <div className="trades-realized-label">REALIZED P&L</div>
          <div className={`trades-realized-badge ${totalPnL >= 0 ? 'positive' : 'negative'}`}>
            {fmt(totalPnL)} HKD
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="trades-col-header">
        <span>TRADE</span>
        <span>FILL PRICE / AMT / COMM</span>
        <span>P&L</span>
      </div>

      {/* Grouped by date - paginated */}
      <div className="trades-list">
        {pagedGroups.length === 0 && (
          <div className="trades-empty">
            <i className="fas fa-search"></i>
            <p>No trades found for the selected filters</p>
          </div>
        )}
        {pagedGroups.map(group => (
          <div key={group.date} className="trade-day-group">
            <div className="trade-day-header">
              <span className="trade-day-date">{formatDate(group.date)}</span>
              <span className={`trade-day-pnl ${group.dailyPnL >= 0 ? 'positive' : 'negative'}`}>
                {fmt(group.dailyPnL)} HKD
              </span>
            </div>
            {group.trades.map((t, i) => {
              const isBuy = t.type === 'Buy'
              const amt = Math.abs(t.grossHKD)
              const comm = Math.abs(t.commission)
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
                    <div className="trade-price">${t.price.toFixed(2)}</div>
                    <div className="trade-amount">${amt.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                    <div className="trade-comm">{comm.toFixed(2)} HKD</div>
                  </div>
                  <div className="trade-right">
                    <div className={`trade-pnl ${t.netHKD >= 0 ? 'positive' : 'negative'}`}>
                      {isBuy ? '' : fmt(t.netHKD + amt)}
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
    </div>
  )
}
