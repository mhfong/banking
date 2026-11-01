import { useState } from 'react'
import { compareDateOnly, parseDateOnly } from '../../cashout/hongKongWorkingDays.js'
import { getMonthlyDueDate } from '../../cashout/dueDates.js'

function parseNumber(value, label, { integer = false, optional = false } = {}) {
  const text = String(value ?? '').trim()
  if (!text && optional) return { value: 0 }
  if (!text) return { error: `${label} is required.` }

  const number = Number(text)
  if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
    return {
      error: integer
        ? `${label} must be a finite non-negative whole number.`
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

export function validateCardValues(values) {
  if (!values.name.trim()) return 'Card name is required.'

  const totalLimit = parseNumber(values.totalCreditLimit, 'Total credit limit')
  if (totalLimit.error) return totalLimit.error
  const monthlyLimit = parseNumber(values.monthlyBorrowLimit, 'Monthly borrowing limit')
  if (monthlyLimit.error) return monthlyLimit.error
  const statementDateError = validateDate(values.nextStatementDate, 'Next statement date')
  if (statementDateError) return statementDateError
  const borrowDateError = validateDate(values.nextBorrowDate, 'Next borrow date')
  if (borrowDateError) return borrowDateError
  if (values.dueDate) {
    const dueDateError = validateDate(values.dueDate, 'Monthly due date')
    if (dueDateError) return dueDateError
  }

  const usedAmount = parseNumber(values.usedAmount, 'Existing used amount', { optional: true })
  if (usedAmount.error) return usedAmount.error
  if (usedAmount.value > totalLimit.value) {
    return 'Existing used amount cannot exceed the total credit limit.'
  }

  if (usedAmount.value > 0) {
    const borrowedDateError = validateDate(values.usedBorrowedOn, 'Existing borrow date')
    if (borrowedDateError) return borrowedDateError
    const statementDateError = validateDate(values.usedStatementDate, 'Existing statement date')
    if (statementDateError) return statementDateError
    const paymentDateError = validateDate(values.usedExpectedPaymentOn, 'Existing due date')
    if (paymentDateError) return paymentDateError
    if (compareDateOnly(values.usedExpectedPaymentOn, values.usedBorrowedOn) < 0) {
      return 'Existing due date cannot be before the borrow date.'
    }
    if (compareDateOnly(values.usedStatementDate, values.usedBorrowedOn) < 0) {
      return 'Existing statement date cannot be before the borrow date.'
    }
  }

  return null
}

function getInitialValues(card, today, { cashouts = [], dueDates = [] } = {}) {
  const monthlyDueDate = card
    ? getMonthlyDueDate({
      cardId: card.id,
      month: today.slice(0, 7),
      cashouts,
      dueDates,
    })
    : { id: null, dueOn: '' }

  return {
    name: card?.name ?? '',
    issuer: card?.issuer ?? '',
    totalCreditLimit: card ? String(card.totalCreditLimit ?? '') : '',
    monthlyBorrowLimit: card ? String(card.monthlyBorrowLimit ?? '') : '',
    nextStatementDate: card?.nextStatementDate ?? '',
    nextBorrowDate: card?.nextBorrowDate ?? '',
    dueDate: monthlyDueDate.dueOn,
    usedAmount: '',
    usedBorrowedOn: today,
    usedStatementDate: '',
    usedExpectedPaymentOn: today,
  }
}

export default function CashoutCardForm({
  cards = [],
  cashouts = [],
  dueDates = [],
  today,
  initialCardId = null,
  onCreateCard,
  onUpdateCard,
  onCreateDueDate,
  onSuccess,
  onCancel,
}) {
  const initialCard = cards.find(card => card.id === initialCardId) ?? null
  const [editingCardId, setEditingCardId] = useState(() => initialCard?.id ?? null)
  const initialMonthlyDueDate = initialCard
    ? getMonthlyDueDate({
      cardId: initialCard.id,
      month: today.slice(0, 7),
      cashouts,
      dueDates,
    })
    : { id: null, dueOn: '' }
  const [values, setValues] = useState(() => getInitialValues(initialCard, today, { cashouts, dueDates }))
  const [error, setError] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const editing = editingCardId ? cards.find(card => card.id === editingCardId) : null
  const pending = Boolean(pendingAction)

  function updateValue(event) {
    const { name, value } = event.target
    setValues(current => ({ ...current, [name]: value }))
    setError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateCardValues(values)
    if (validationError) {
      setError(validationError)
      return
    }

    const cardValues = {
      name: values.name.trim(),
      issuer: values.issuer.trim() || null,
      totalCreditLimit: Number(values.totalCreditLimit),
      monthlyBorrowLimit: Number(values.monthlyBorrowLimit),
      nextStatementDate: values.nextStatementDate,
      nextBorrowDate: values.nextBorrowDate,
    }
    const usedAmount = Number(values.usedAmount || 0)
    setPendingAction('save')
    setError(null)
    try {
      const result = editing
        ? await onUpdateCard(editing.id, cardValues)
        : await onCreateCard(
          cardValues,
          usedAmount > 0
            ? {
              amount: usedAmount,
              borrowedOn: values.usedBorrowedOn,
              statementDate: values.usedStatementDate,
              expectedPaymentOn: values.usedExpectedPaymentOn,
              expectedPaymentAmount: usedAmount,
            }
            : { amount: 0 },
        )
      if (result?.ok !== true) {
        setError(getResultError(result, 'The card could not be saved.'))
        return
      }
      if (editing && values.dueDate && values.dueDate !== initialMonthlyDueDate.dueOn) {
        const dueDateResult = await onCreateDueDate({ cardId: editing.id, dueOn: values.dueDate })
        if (dueDateResult?.ok !== true) {
          setError(getResultError(dueDateResult, 'The monthly due date could not be saved.'))
          return
        }
      }
      onSuccess?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The card could not be saved.')
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="cashout-cycle-form cashout-cycle-card-form">
      {error && <p className="cashout-cycle-form-error" role="alert">{error}</p>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="cashout-cycle-form-grid">
          <div className="form-group">
            <label htmlFor="cashout-card-name">Name</label>
            <input id="cashout-card-name" name="name" type="text" value={values.name} onChange={updateValue} disabled={pending} required />
          </div>
          <div className="form-group">
            <label htmlFor="cashout-card-issuer">Issuer</label>
            <input id="cashout-card-issuer" name="issuer" type="text" value={values.issuer} onChange={updateValue} disabled={pending} />
          </div>
        </div>

        <div className="cashout-cycle-form-grid">
          <div className="form-group">
            <label htmlFor="cashout-card-total-limit">Total credit limit</label>
            <input id="cashout-card-total-limit" name="totalCreditLimit" type="number" min="0" step="0.01" value={values.totalCreditLimit} onChange={updateValue} disabled={pending} required />
          </div>
          <div className="form-group">
            <label htmlFor="cashout-card-monthly-limit">Monthly borrowing limit</label>
            <input id="cashout-card-monthly-limit" name="monthlyBorrowLimit" type="number" min="0" step="0.01" value={values.monthlyBorrowLimit} onChange={updateValue} disabled={pending} required />
          </div>
        </div>

        <div className="cashout-cycle-form-grid">
          <div className="form-group">
            <label htmlFor="cashout-card-next-statement-date">Next statement date</label>
            <input id="cashout-card-next-statement-date" name="nextStatementDate" type="date" value={values.nextStatementDate} onChange={updateValue} disabled={pending} required />
          </div>
          <div className="form-group">
            <label htmlFor="cashout-card-next-borrow-date">Next borrow date</label>
            <input id="cashout-card-next-borrow-date" name="nextBorrowDate" type="date" value={values.nextBorrowDate} onChange={updateValue} disabled={pending} required />
          </div>
        </div>

        {editing && (
          <fieldset className="cashout-cycle-form-section">
            <legend>Monthly Due Date</legend>
            <p className="cashout-cycle-form-help">Add or edit the Due Date for this month. Existing cashout history remains unchanged.</p>
            <div className="form-group">
              <label htmlFor="cashout-card-due-date">Due date for this month</label>
              <input id="cashout-card-due-date" name="dueDate" type="date" value={values.dueDate} onChange={updateValue} disabled={pending} />
            </div>
          </fieldset>
        )}

        {!editing && (
          <fieldset className="cashout-cycle-form-section">
            <legend>Existing used amount (optional)</legend>
            <div className="form-group">
              <label htmlFor="cashout-card-used-amount">Used amount</label>
              <input id="cashout-card-used-amount" name="usedAmount" type="number" min="0" step="0.01" value={values.usedAmount} onChange={updateValue} disabled={pending} />
            </div>
            <div className="form-group">
              <label htmlFor="cashout-card-used-statement-date">Statement date</label>
              <input id="cashout-card-used-statement-date" name="usedStatementDate" type="date" value={values.usedStatementDate} onChange={updateValue} disabled={pending} />
            </div>
            <div className="cashout-cycle-form-grid">
              <div className="form-group">
                <label htmlFor="cashout-card-used-borrowed-on">Borrow date</label>
                <input id="cashout-card-used-borrowed-on" name="usedBorrowedOn" type="date" value={values.usedBorrowedOn} onChange={updateValue} disabled={pending} />
              </div>
              <div className="form-group">
                <label htmlFor="cashout-card-used-payment-on">Due date</label>
                <input id="cashout-card-used-payment-on" name="usedExpectedPaymentOn" type="date" value={values.usedExpectedPaymentOn} onChange={updateValue} disabled={pending} />
              </div>
            </div>
          </fieldset>
        )}

        <div className="cashout-cycle-form-actions">
          <button type="button" className="cashout-cycle-secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
          <button type="submit" className="cashout-cycle-primary-button" disabled={pending}>
            {pending ? 'Saving...' : editing ? 'Save card' : 'Add card'}
          </button>
        </div>
      </form>
    </div>
  )
}