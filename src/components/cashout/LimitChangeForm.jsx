import { useState } from 'react'
import { parseDateOnly } from '../../cashout/hongKongWorkingDays.js'

function parseNumber(value) {
  const text = String(value ?? '').trim()
  const number = Number(text)
  if (!text || !Number.isFinite(number) || number < 0) {
    return { error: 'Monthly borrowing limit must be a finite non-negative number.' }
  }
  return { value: number }
}

function getResultError(result, fallback) {
  return result?.message || fallback
}

export default function LimitChangeForm({
  cards = [],
  limitChanges = [],
  today,
  onSaveLimitChange,
  onSuccess,
  onCancel,
}) {
  const firstCard = cards[0]
  const [values, setValues] = useState({
    cardId: firstCard?.id ?? '',
    effectiveOn: today,
    monthlyBorrowLimit: firstCard ? String(firstCard.monthlyBorrowLimit ?? '') : '',
    note: '',
  })
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  function updateValue(event) {
    const { name, value } = event.target
    setValues(current => ({ ...current, [name]: value }))
    setError(null)
  }

  function updateCard(event) {
    const cardId = event.target.value
    const card = cards.find(candidate => candidate.id === cardId)
    setValues(current => ({
      ...current,
      cardId,
      monthlyBorrowLimit: String(card?.monthlyBorrowLimit ?? ''),
    }))
    setError(null)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!values.cardId) {
      setError('Select a card.')
      return
    }
    try {
      parseDateOnly(values.effectiveOn)
    } catch {
      setError('Effective date must be a valid date.')
      return
    }
    const limitResult = parseNumber(values.monthlyBorrowLimit)
    if (limitResult.error) {
      setError(limitResult.error)
      return
    }
    const duplicate = limitChanges.some(change => (
      change.cardId === values.cardId && change.effectiveOn === values.effectiveOn
    ))
    if (duplicate) {
      setError('A limit change for this card on this effective date already exists.')
      return
    }

    setPending(true)
    setError(null)
    try {
      const result = await onSaveLimitChange({
        cardId: values.cardId,
        effectiveOn: values.effectiveOn,
        monthlyBorrowLimit: limitResult.value,
        note: values.note.trim() || null,
      })
      if (result?.ok !== true) {
        setError(getResultError(result, 'The limit change could not be saved.'))
        return
      }
      onSuccess?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The limit change could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="cashout-cycle-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="cashout-cycle-form-error" role="alert">{error}</p>}
      {cards.length === 0 ? (
        <p className="cashout-cycle-form-help">Add a card before recording a bank limit change.</p>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="cashout-limit-card">Card</label>
            <select id="cashout-limit-card" name="cardId" value={values.cardId} onChange={updateCard} disabled={pending}>
              {cards.map(card => <option key={card.id} value={card.id}>{card.name}{card.active === false ? ' (archived)' : ''}</option>)}
            </select>
          </div>
          <div className="cashout-cycle-form-grid">
            <div className="form-group">
              <label htmlFor="cashout-limit-effective-on">Effective date</label>
              <input id="cashout-limit-effective-on" name="effectiveOn" type="date" value={values.effectiveOn} onChange={updateValue} disabled={pending} required />
            </div>
            <div className="form-group">
              <label htmlFor="cashout-limit-monthly">Monthly borrowing limit</label>
              <input id="cashout-limit-monthly" name="monthlyBorrowLimit" type="number" min="0" step="0.01" value={values.monthlyBorrowLimit} onChange={updateValue} disabled={pending} required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="cashout-limit-note">Note (optional)</label>
            <textarea id="cashout-limit-note" name="note" rows="3" value={values.note} onChange={updateValue} disabled={pending} />
          </div>
          <div className="cashout-cycle-form-actions">
            <button type="button" className="cashout-cycle-secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
            <button type="submit" className="cashout-cycle-primary-button" disabled={pending}>
              {pending ? 'Saving...' : 'Save limit change'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}