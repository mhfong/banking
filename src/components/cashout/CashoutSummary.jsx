function formatAmount(value) {
  const amount = Number(value)
  return `HK$${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`
}

const metricDefinitions = [
  ['grossBorrowed', 'Gross borrowed'],
  ['paidBack', 'Paid back'],
  ['outstanding', 'Outstanding'],
  ['availableCredit', 'Available credit'],
  ['monthlyRoom', 'Monthly room'],
  ['dueSoonTotal', 'Due soon'],
]

export default function CashoutSummary({ summary, status, onAddCashout }) {
  const bestNextBorrow = summary?.bestNextBorrow
  const bestCard = bestNextBorrow?.cardName ?? bestNextBorrow?.cardId

  return (
    <section
      className="cashout-cycle-panel cashout-cycle-summary"
      aria-labelledby="cashout-cycle-summary-title"
      data-status={status?.state ?? 'pending'}
    >
      <div className="cashout-cycle-panel-header">
        <div className="cashout-cycle-slot-title">
          <i className="fas fa-chart-pie" aria-hidden="true"></i>
          <h2 id="cashout-cycle-summary-title">Loop summary</h2>
        </div>
        {onAddCashout && (
          <button type="button" className="cashout-cycle-text-button" onClick={onAddCashout}>
            <i className="fas fa-plus" aria-hidden="true"></i>
            New cashout
          </button>
        )}
      </div>

      <div className="cashout-cycle-summary-metrics">
        {metricDefinitions.map(([key, label]) => (
          <div className="cashout-cycle-summary-metric" key={key}>
            <span>{label}</span>
            <strong>{formatAmount(summary?.[key])}</strong>
          </div>
        ))}
      </div>

      <div className="cashout-cycle-next-borrow" aria-live="polite">
        <div>
          <span className="cashout-cycle-summary-eyebrow">Best next borrow</span>
          {bestNextBorrow ? (
            <>
              <h3>{bestCard ?? 'Eligible card'}</h3>
              <p>
                Safe from <strong>{bestNextBorrow.date}</strong>
                {bestNextBorrow.reason ? ` · ${bestNextBorrow.reason}` : ''}
              </p>
            </>
          ) : (
            <>
              <h3>No safe borrow available</h3>
              <p>All active cards are currently blocked by credit, monthly room, or repayment timing.</p>
            </>
          )}
        </div>
        <strong className="cashout-cycle-next-borrow-amount">
          {bestNextBorrow ? formatAmount(bestNextBorrow.amount) : 'Unavailable'}
        </strong>
      </div>
    </section>
  )
}