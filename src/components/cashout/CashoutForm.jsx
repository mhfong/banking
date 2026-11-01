import { useMemo, useState } from 'react'
import {
  calculateCardCapacity,
  getSafeBorrowDate,
} from '../../cashout/cashoutCalculations.js'
import { compareDateOnly, parseDateOnly } from '../../cashout/hongKongWorkingDays.js'

function parseNumber(value, label, { positive = false } = {}) {
  const text = String(value ?? '').trim()
  if (!text) return { error: `${label} is required.` }

  const number = Number(text)
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) {
    return {
      error: positive
        ? `${label} must be a positive finite number.`
        : `${label} must be a finite non-negative number.`,
    }
  }
  return { value: number }
}

function validateDate(value, label) {
  try {
    parseDateOnly(value)
    return null
  } catch {
    return `${label} must be a valid date.`
  }
}

function getResultError(result, fallback) {
  return result?.message || fallback
}

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function validateCashoutValues({
  values,
  cards = [],
  cashouts = [],
  payments = [],
  limitChanges = [],
  today,
}) {
  const card = cards.find(candidate => candidate.id === values.cardId && candidate.active !== false)
  if (!card) return 'Select an active card.'

  const amountResult = parseNumber(values.amount, 'Cashout amount', { positive: true })
  if (amountResult.error) return amountResult.error

  const expectedAmountResult = parseNumber(values.expectedPaymentAmount, 'Expected payment amount')
  if (expectedAmountResult.error) return expectedAmountResult.error

  const borrowedDateError = validateDate(values.borrowedOn, 'Borrow date')
  if (borrowedDateError) return borrowedDateError
  const statementDateError = validateDate(values.statementDate, 'Statement date')
  if (statementDateError) return statementDateError
  const paymentDateError = validateDate(values.expectedPaymentOn, 'Due date')
  if (paymentDateError) return paymentDateError
  const todayError = validateDate(today, 'Today')
  if (todayError) return todayError

  if (compareDateOnly(values.expectedPaymentOn, values.borrowedOn) < 0) {
    return 'Due date cannot be before the borrow date.'
  }
  if (compareDateOnly(values.statementDate, values.borrowedOn) < 0) {
    return 'Statement date cannot be before the borrow date.'
  }

  let capacity
  try {
    capacity = calculateCardCapacity({
      card,
      cashouts,
      payments,
      limitChanges,
      asOf: values.borrowedOn,
    })
  } catch (error) {
    return error instanceof Error ? error.message : 'Card capacity could not be calculated.'
  }

  if (amountResult.value > capacity.maxNewBorrow) {
    return `Cashout amount cannot exceed the maximum new borrow of ${capacity.maxNewBorrow}.`
  }

  let safeBorrow
  try {
    safeBorrow = getSafeBorrowDate({
      asOf: today,
      card,
      cashouts,
      payments,
      limitChanges,
    })
  } catch (error) {
    return error instanceof Error ? error.message : 'Borrow eligibility could not be calculated.'
  }

  if (!safeBorrow.date || compareDateOnly(values.borrowedOn, safeBorrow.date) < 0) {
    return safeBorrow.reason
  }

  return null
}

function getInitialValues(cards, today) {
  const firstActiveCard = cards.find(card => card.active !== false)
  return {
    cardId: firstActiveCard?.id ?? '',
    amount: '',
    borrowedOn: today,
    statementDate: firstActiveCard?.nextStatementDate ?? '',
    expectedPaymentOn: today,
    expectedPaymentAmount: '',
  }
}

function formatAmount(value) {
  return `HK$${Number(value ?? 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}`
}

export default function CashoutForm({
  cards = [],
  cashouts = [],
  payments = [],
  limitChanges = [],
  today,
  onCreateCashout,
  onSuccess,
  onCancel,
}) {
  const [values, setValues] = useState(() => getInitialValues(cards, today))
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const activeCards = cards.filter(card => card.active !== false)
  const selectedCard = activeCards.find(card => card.id === values.cardId)
  const capacityState = useMemo(() => {
    if (!selectedCard) return { value: null, error: null }
    try {
      return {
        value: calculateCardCapacity({
          card: selectedCard,
          cashouts,
          payments,
          limitChanges,
          asOf: today,
        }),
        error: null,
      }
    } catch (calculationError) {
      return {
        value: null,
        error: getErrorMessage(calculationError, 'Card capacity could not be calculated.'),
      }
    }
  }, [cashouts, limitChanges, payments, selectedCard, today])
  const capacity = capacityState.value
  const safeBorrowState = useMemo(() => {
    if (!selectedCard) return { value: null, error: null }
    try {
      return {
        value: getSafeBorrowDate({
          asOf: today,
          card: selectedCard,
          cashouts,
          payments,
          limitChanges,
        }),
        error: null,
      }
    } catch (eligibilityError) {
      return {
        value: null,
        error: getErrorMessage(eligibilityError, 'Borrow eligibility could not be calculated.'),
      }
    }
  }, [cashouts, limitChanges, payments, selectedCard, today])
  const safeBorrow = safeBorrowState.value

  function updateValue(event) {
    const { name, value } = event.target
    if (name === 'cardId') {
      const nextCard = activeCards.find(card => card.id === value)
      setValues(current => ({
        ...current,
        cardId: value,
        statementDate: nextCard?.nextStatementDate ?? '',
      }))
    } else {
      setValues(current => ({ ...current, [name]: value }))
    }
    setError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateCashoutValues({
      values,
      cards,
      cashouts,
      payments,
      limitChanges,
      today,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    setPending(true)
    setError(null)
    try {
      const result = await onCreateCashout({
        cardId: values.cardId,
        amount: Number(values.amount),
        borrowedOn: values.borrowedOn,
        statementDate: values.statementDate,
        expectedPaymentOn: values.expectedPaymentOn,
        expectedPaymentAmount: Number(values.expectedPaymentAmount),
      })
      if (result?.ok !== true) {
        setError(getResultError(result, 'The cashout could not be saved.'))
        return
      }
      onSuccess?.()
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'The cashout could not be saved.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="cashout-cycle-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="cashout-cycle-form-error" role="alert">{error}</p>}

      {activeCards.length === 0 ? (
        <p className="cashout-cycle-form-help">Add an active card before creating a cashout.</p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="cashout-card">Card</label>
            <select id="cashout-card" name="cardId" value={values.cardId} onChange={updateValue} disabled={pending}>
              {activeCards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
            </select>
          </div>

          <div className="cashout-cycle-capacity-grid" aria-live="polite">
            <div className="cashout-cycle-capacity-item">
              <span>Available credit</span>
              <strong>{formatAmount(capacity?.availableCredit)}</strong>
            </div>
            <div className="cashout-cycle-capacity-item">
              <span>Monthly room</span>
              <strong>{formatAmount(capacity?.monthlyRoom)}</strong>
            </div>
            <div className="cashout-cycle-capacity-item">
              <span>Maximum new borrow</span>
              <strong>{formatAmount(capacity?.maxNewBorrow)}</strong>
            </div>
          </div>

          {(capacityState.error || safeBorrowState.error) && (
            <p className="cashout-cycle-form-error" role="alert">
              {capacityState.error || safeBorrowState.error}
            </p>
          )}

          {safeBorrow?.date ? (
            <p className="cashout-cycle-form-help">{safeBorrow.reason}</p>
          ) : safeBorrow?.reason ? (
            <p className="cashout-cycle-form-warning" role="status">{safeBorrow.reason}</p>
          ) : null}

          <div className="cashout-cycle-form-grid">
            <div className="form-group">
              <label htmlFor="cashout-amount">Amount</label>
              <input id="cashout-amount" name="amount" type="number" min="0" step="0.01" value={values.amount} onChange={updateValue} disabled={pending} required />
            </div>
            <div className="form-group">
              <label htmlFor="cashout-expected-payment-amount">Expected payment amount</label>
              <input id="cashout-expected-payment-amount" name="expectedPaymentAmount" type="number" min="0" step="0.01" value={values.expectedPaymentAmount} onChange={updateValue} disabled={pending} required />
            </div>
          </div>

          <div className="cashout-cycle-form-grid">
            <div className="form-group">
              <label htmlFor="cashout-borrowed-on">Borrow date</label>
              <input id="cashout-borrowed-on" name="borrowedOn" type="date" value={values.borrowedOn} onChange={updateValue} disabled={pending} required />
            </div>
            <div className="form-group">
              <label htmlFor="cashout-statement-date">Statement date</label>
              <input id="cashout-statement-date" name="statementDate" type="date" value={values.statementDate} onChange={updateValue} disabled={pending} required />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="cashout-expected-payment-on">Due date</label>
            <input id="cashout-expected-payment-on" name="expectedPaymentOn" type="date" value={values.expectedPaymentOn} onChange={updateValue} disabled={pending} required />
          </div>

          <div className="cashout-cycle-form-actions">
            <button type="button" className="cashout-cycle-secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
            <button type="submit" className="cashout-cycle-primary-button" disabled={pending}>
              {pending ? 'Saving...' : 'Create cashout'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}