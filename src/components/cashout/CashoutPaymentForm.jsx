import { useState } from 'react'
import { parseDateOnly } from '../../cashout/hongKongWorkingDays.js'

function parsePositiveNumber(value, label) {
  const text = String(value ?? '').trim()
  const number = Number(text)
  if (!text || !Number.isFinite(number) || number <= 0) {
    return { error: `${label} must be a positive finite number.` }
  }
  return { value: number }
}

function getResultError(result, fallback) {
  return result?.message || fallback
}

function getPaymentTotal(cashoutId, payments) {
  return payments
    .filter(payment => payment.cashoutId === cashoutId)
    .reduce((total, payment) => {
      const amount = Number(payment.amount)
      return Number.isFinite(amount) ? total + amount : total
    }, 0)
}

export default function CashoutPaymentForm({
  cashout,
  payments = [],
  today,
  onCreatePayment,
  onSuccess,
  onCancel,
}) {
  const [values, setValues] = useState({ amount: '', paidOn: today, note: '' })
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const paidAmount = cashout ? getPaymentTotal(cashout.id, payments) : 0
  const remaining = cashout ? Math.max(0, Number(cashout.amount) - paidAmount) : 0

  function updateValue(event) {
    const { name, value } = event.target
    setValues(current => ({ ...current, [name]: value }))
    setError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!cashout) {
      setError('Select a cashout before recording a payment.')
      return
    }

    const amountResult = parsePositiveNumber(values.amount, 'Payment amount')
    if (amountResult.error) {
      setError(amountResult.error)
      return
    }
    if (amountResult.value > remaining) {
      setError('Payment amount cannot exceed the remaining balance.')
      return
    }
    try {
      parseDateOnly(values.paidOn)
    } catch {
      setError('Paid date must be a valid date.')
      return
    }

    setPending(true)
    setError(null)
    try {
      const result = await onCreatePayment({
        cashoutId: cashout.id,
        amount: amountResult.value,
        paidOn: values.paidOn,
        note: values.note.trim() || null,
      })
      if (result?.ok !== true) {
        setError(getResultError(result, 'The payment could not be saved.'))
        return
      }
      onSuccess?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The payment could not be saved.')
    } finally {
      setPending(false)
    }
  }

  if (!cashout) {
    return (
      <div className="cashout-cycle-form">
        <p className="cashout-cycle-form-error" role="alert">Select a cashout before recording a payment.</p>
        <div className="cashout-cycle-form-actions">
          <button type="button" className="cashout-cycle-secondary-button" onClick={onCancel}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <form className="cashout-cycle-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="cashout-cycle-form-error" role="alert">{error}</p>}
      <div className="cashout-cycle-capacity-grid">
        <div className="cashout-cycle-capacity-item">
          <span>Original amount</span>
          <strong>HK${Number(cashout.amount).toLocaleString('en-US')}</strong>
        </div>
        <div className="cashout-cycle-capacity-item">
          <span>Already paid</span>
          <strong>HK${paidAmount.toLocaleString('en-US')}</strong>
        </div>
        <div className="cashout-cycle-capacity-item">
          <span>Remaining balance</span>
          <strong>HK${remaining.toLocaleString('en-US')}</strong>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="cashout-payment-amount">Payment amount</label>
        <input id="cashout-payment-amount" name="amount" type="number" min="0" step="0.01" value={values.amount} onChange={updateValue} disabled={pending || remaining <= 0} required />
      </div>
      <div className="form-group">
        <label htmlFor="cashout-payment-paid-on">Paid date</label>
        <input id="cashout-payment-paid-on" name="paidOn" type="date" value={values.paidOn} onChange={updateValue} disabled={pending} required />
      </div>
      <div className="form-group">
        <label htmlFor="cashout-payment-note">Note (optional)</label>
        <textarea id="cashout-payment-note" name="note" rows="2" value={values.note} onChange={updateValue} disabled={pending} />
      </div>

      {remaining <= 0 && <p className="cashout-cycle-form-help">This cashout is fully paid.</p>}
      <div className="cashout-cycle-form-actions">
        <button type="button" className="cashout-cycle-secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
        <button type="submit" className="cashout-cycle-primary-button" disabled={pending || remaining <= 0}>
          {pending ? 'Saving...' : 'Record payment'}
        </button>
      </div>
    </form>
  )
}