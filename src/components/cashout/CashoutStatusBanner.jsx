function formatAmount(value) {
  const amount = Number(value)
  return `HK$${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`
}

function getStatusState(status) {
  if (status?.state === 'will-fail' || status?.state === 'at-risk') return 'at-risk'
  if (status?.state === 'normal' || status?.state === 'safe') return 'normal'
  return 'pending'
}

function formatAmountOrUnavailable(value) {
  return value == null ? 'Unavailable' : formatAmount(value)
}

function FailureDetails({ failure, heading }) {
  if (!failure) return null

  const isFutureLimitFailure = failure.kind === 'future-limit'

  return (
    <div className={heading ? 'cashout-cycle-status-secondary-failure' : undefined}>
      {heading && <h3>{heading}</h3>}
      <dl className="cashout-cycle-status-failure">
        <div>
          <dt>{heading ? 'Date' : 'First failure'}</dt>
          <dd>{failure.date ?? 'Date unavailable'}</dd>
        </div>
        <div>
          <dt>{isFutureLimitFailure ? 'Borrow' : 'Payment'}</dt>
          <dd>{isFutureLimitFailure
            ? formatAmountOrUnavailable(failure.borrowAmount)
            : failure.paymentAmount == null ? 'Cash buffer' : formatAmount(failure.paymentAmount)}</dd>
        </div>
        <div>
          <dt>Card</dt>
          <dd>{failure.cardName ?? failure.cardId ?? 'Cash buffer'}</dd>
        </div>
        {isFutureLimitFailure && (
          <>
            <div>
              <dt>Cashout</dt>
              <dd>{failure.cashoutId ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Allowed borrow</dt>
              <dd>{formatAmountOrUnavailable(failure.availableBorrow)}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Shortfall</dt>
          <dd>{formatAmountOrUnavailable(failure.shortfall)}</dd>
        </div>
      </dl>
    </div>
  )
}

export default function CashoutStatusBanner({ status, onReview }) {
  const state = getStatusState(status)
  const title = state === 'at-risk'
    ? 'At Risk'
    : state === 'normal'
      ? 'Normal'
      : status?.title ?? 'Pending'
  const failure = status?.firstFailure
  const futureLimitFailure = failure?.kind === 'future-limit'
    ? null
    : status?.futureLimitFailure
  const icon = state === 'at-risk'
    ? 'fa-exclamation-triangle'
    : state === 'normal'
      ? 'fa-check-circle'
      : 'fa-question-circle'

  return (
    <section
      className={`cashout-cycle-status cashout-cycle-status-banner cashout-cycle-panel ${state}`}
      aria-labelledby="cashout-cycle-status-title"
      data-status={state}
    >
      <div className="cashout-cycle-status-copy">
        <span className="cashout-cycle-status-label">Loop status</span>
        <h2 id="cashout-cycle-status-title">{title}</h2>
        <p>{status?.message ?? 'Current cash-flow status is being calculated.'}</p>
        <FailureDetails failure={failure} />
        <FailureDetails failure={futureLimitFailure} heading="Future limit failure" />
      </div>
      <div className="cashout-cycle-status-actions">
        <div className="cashout-cycle-status-icon" aria-hidden="true">
          <i className={`fas ${icon}`}></i>
        </div>
        {onReview && (
          <button
            type="button"
            className="cashout-cycle-secondary-button cashout-cycle-status-review"
            onClick={onReview}
          >
            <i className="fas fa-search" aria-hidden="true"></i>
            Review forecast
          </button>
        )}
      </div>
    </section>
  )
}