function formatAmount(value) {
  const amount = Number(value)
  return `HK$${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`
}

function formatAmountOrUnavailable(value) {
  return value == null ? 'Unavailable' : formatAmount(value)
}

function FutureLimitFailureDetails({ failure, className = '' }) {
  if (!failure) return null

  return (
    <div className={`cashout-cycle-forecast-future-limit-failure ${className}`.trim()}>
      <strong>Future limit failure</strong>
      <dl>
        <div>
          <dt>Date</dt>
          <dd>{failure.date ?? 'Date unavailable'}</dd>
        </div>
        <div>
          <dt>Card</dt>
          <dd>{failure.cardName ?? failure.cardId ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Cashout</dt>
          <dd>{failure.cashoutId ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Borrow</dt>
          <dd>{formatAmountOrUnavailable(failure.borrowAmount)}</dd>
        </div>
        <div>
          <dt>Allowed borrow</dt>
          <dd>{formatAmountOrUnavailable(failure.availableBorrow)}</dd>
        </div>
        <div>
          <dt>Shortfall</dt>
          <dd>{formatAmountOrUnavailable(failure.shortfall)}</dd>
        </div>
      </dl>
    </div>
  )
}

function renderDetails(details, emptyLabel = 'None') {
  if (!Array.isArray(details) || details.length === 0) {
    return <span className="cashout-cycle-forecast-none">{emptyLabel}</span>
  }

  return (
    <ul className="cashout-cycle-forecast-detail-list">
      {details.map((detail, index) => (
        <li key={`${detail.cashoutId ?? detail.paymentId ?? 'detail'}-${index}`}>
          {formatAmount(detail.amount)}
          {detail.cashoutId ? <small>{detail.cashoutId}</small> : null}
        </li>
      ))}
    </ul>
  )
}

export default function CashflowForecast({ rows = [], status }) {
  const orderedRows = Array.isArray(rows) ? rows : []
  const failure = status?.firstFailure
  const rowFutureLimitFailure = orderedRows
    .map(row => row.futureLimitFailure)
    .find(Boolean)
  const futureLimitFailure = rowFutureLimitFailure ?? status?.futureLimitFailure ?? null
  const failureRow = orderedRows.find(row => row.risk === 'will-fail')
  const firstUnsafeDate = failure?.date ?? failureRow?.date ?? null
  const shortfall = failure?.shortfall ?? status?.shortfall ?? 0
  const finalProjectedCash = orderedRows.at(-1)?.projectedCash ?? 0
  const contingentTotal = orderedRows.reduce((total, row) => total + Number(row.contingentBorrowing || 0), 0)
  const forecastState = firstUnsafeDate || status?.state === 'at-risk' ? 'at-risk' : 'normal'

  return (
    <div className="cashout-cycle-forecast-view">
      <div className={`cashout-cycle-forecast-risk ${forecastState}`} role="status">
        <div>
          <span>First unsafe date</span>
          <strong>{firstUnsafeDate ?? 'None in forecast horizon'}</strong>
        </div>
        <div>
          <span>Shortfall</span>
          <strong>{firstUnsafeDate ? formatAmount(shortfall) : 'HK$0'}</strong>
        </div>
        <FutureLimitFailureDetails failure={futureLimitFailure} className="cashout-cycle-forecast-risk-detail" />
        <p>{status?.message ?? 'Projected cash covers the current forecast horizon.'}</p>
      </div>

      <div className="cashout-cycle-forecast-snapshot" aria-label="Forecast totals">
        <div>
          <span>Cash-only projected cash</span>
          <strong>{formatAmount(finalProjectedCash)}</strong>
        </div>
        <div>
          <span>Contingent borrowing</span>
          <strong>{formatAmount(contingentTotal)}</strong>
          <small>Shown separately and excluded from projected cash.</small>
        </div>
      </div>

      {orderedRows.length === 0 ? (
        <div className="cashout-cycle-forecast-empty" role="status">
          No salary, payment, borrowing, or limit events are in the forecast horizon.
        </div>
      ) : (
        <div className="cashout-cycle-forecast-table-wrap">
          <table className="cashout-cycle-forecast-table">
            <caption className="cashout-cycle-sr-only">Cash-flow forecast by adjusted event date</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Salary</th>
                <th scope="col">Protected budget</th>
                <th scope="col">Actual payments</th>
                <th scope="col">Planned payments</th>
                <th scope="col">Contingent borrowing</th>
                <th scope="col">Cash-only projected cash</th>
              </tr>
            </thead>
            <tbody>
              {orderedRows.map(row => {
                const isFailure = firstUnsafeDate === row.date && (row.risk === 'will-fail' || failure)
                const rowFailure = row.futureLimitFailure
                  ?? (futureLimitFailure?.date === row.date ? futureLimitFailure : null)
                return (
                  <tr className={isFailure ? 'will-fail' : row.risk ?? 'safe'} key={row.date}>
                    <th scope="row" data-label="Date">
                      <strong>{row.date}</strong>
                      {Number(row.salary || 0) > 0 && <small>Adjusted salary date</small>}
                    </th>
                    <td data-label="Salary">{formatAmount(row.salary)}</td>
                    <td data-label="Protected budget">{formatAmount(row.reservedBudget)}</td>
                    <td data-label="Actual payments">{renderDetails(row.actualPaymentDetails)}</td>
                    <td data-label="Planned payments">{renderDetails(row.paymentObligations)}</td>
                    <td data-label="Contingent borrowing">
                      <strong>{formatAmount(row.contingentBorrowing)}</strong>
                      {renderDetails(row.contingentDetails, 'None planned')}
                    </td>
                    <td data-label="Cash-only projected cash">
                      <strong>{formatAmount(row.projectedCash)}</strong>
                      {isFailure && <small className="cashout-cycle-forecast-failure-label">First failure row</small>}
                      {rowFailure && (
                        <div className="cashout-cycle-forecast-row-future-limit">
                          <strong>Future limit failure</strong>
                          <span>{rowFailure.cardName ?? rowFailure.cardId ?? 'Card unavailable'}; Cashout {rowFailure.cashoutId ?? 'unavailable'}</span>
                          <span>{formatAmountOrUnavailable(rowFailure.borrowAmount)} borrow; {formatAmountOrUnavailable(rowFailure.availableBorrow)} allowed; {formatAmountOrUnavailable(rowFailure.shortfall)} shortfall.</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}