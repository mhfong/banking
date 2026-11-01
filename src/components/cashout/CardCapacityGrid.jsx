function formatAmount(value) {
  const amount = Number(value)
  return `HK$${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`
}

function asAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function getMonthlyCapacity(card, capacity) {
  const monthlyBorrowLimit = asAmount(capacity.effectiveMonthlyBorrowLimit ?? card.monthlyBorrowLimit)
  const usedAmount = asAmount(capacity.outstanding)

  return {
    monthlyBorrowLimit,
    usedAmount,
    monthlyRoom: Math.max(0, monthlyBorrowLimit - usedAmount),
  }
}

function getCardState(card, capacity) {
  const { monthlyBorrowLimit, usedAmount, monthlyRoom } = getMonthlyCapacity(card, capacity)

  if (monthlyBorrowLimit <= 0 || monthlyRoom <= 0) {
    return { label: 'OVERLIMIT', className: 'no-credit' }
  }
  if (usedAmount > 0) {
    return { label: 'Partial', className: 'partial' }
  }
  return { label: 'Ready', className: 'ready' }
}

function getCapacityNote(state, capacity) {
  if (state.className === 'no-credit') return 'Monthly borrowing room is exhausted'
  if (state.className === 'partial') return `${formatAmount(capacity.outstanding)} currently used`
  return 'No cash-out recorded'
}

export default function CardCapacityGrid({ cards = [], onEditCard }) {
  const activeCards = cards.filter(card => card.active !== false)

  if (activeCards.length === 0) {
    return (
      <div className="cashout-cycle-capacity-empty" role="status">
        <i className="fas fa-credit-card" aria-hidden="true"></i>
        <span>No active card capacity to display.</span>
      </div>
    )
  }

  return (
    <div className="cashout-cycle-card-capacity-grid" role="list" aria-label="Active card capacity">
      {activeCards.map(card => {
        const capacity = card.capacity ?? {}
        const state = getCardState(card, capacity)
        const { monthlyBorrowLimit, usedAmount, monthlyRoom } = getMonthlyCapacity(card, capacity)
        const usedPercent = monthlyBorrowLimit > 0
          ? Math.min(100, Math.max(0, Math.round((usedAmount / monthlyBorrowLimit) * 100)))
          : 0

        return (
          <article className="cashout-cycle-card-capacity" key={card.id} role="listitem">
            <button
              type="button"
              className="cashout-cycle-card-capacity-trigger"
              onClick={() => onEditCard?.(card.id)}
              aria-label={`Edit ${card.name || 'card'} capacity`}
            >
              <div className="cashout-cycle-card-capacity-header">
                <h3>{card.name || 'Unnamed card'}</h3>
                <span className={`cashout-cycle-capacity-state ${state.className}`}>{state.label}</span>
              </div>

              <div className="cashout-cycle-card-capacity-hero">
                <div className="cashout-cycle-card-capacity-available-wrap" aria-label={`${formatAmount(monthlyRoom)} available`}>
                  <strong className="cashout-cycle-card-capacity-available">{formatAmount(monthlyRoom)}</strong>
                  <span>available</span>
                </div>
              </div>
              <div
                className={`cashout-cycle-card-capacity-progress ${state.className}`}
                role="progressbar"
                aria-label={`${card.name || 'Card'} monthly borrowing used`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={usedPercent}
              >
                <span style={{ width: `${usedPercent}%` }}></span>
              </div>
              <div className="cashout-cycle-card-capacity-limit">
                <span>Limit <strong>{formatAmount(monthlyBorrowLimit)}</strong></span>
                <span>{usedPercent}% used</span>
              </div>
              <p className={`cashout-cycle-card-capacity-note ${state.className}`}>{getCapacityNote(state, capacity)}</p>
            </button>
          </article>
        )
      })}
    </div>
  )
}