import { useState } from 'react'
import { compareDateOnly, parseDateOnly } from '../../cashout/hongKongWorkingDays.js'

function validateDueDate(value, currentDueOn) {
  if (!value) return 'Next due date is required.'
  try {
    parseDateOnly(value)
  } catch {
    return 'Next due date must be a valid date.'
  }
  if (compareDateOnly(value, currentDueOn) <= 0) {
    return 'Next due date must be after the current due date.'
  }
  return null
}

function getResultError(result, fallback) {
  return result?.message || fallback
}

export default function CashoutDueDatePrompt({
  prompt,
  onCreateDueDate,
  onDismiss,
}) {
  const [dueOn, setDueOn] = useState(() => prompt?.suggestedDueOn ?? '')
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  if (!prompt) return null

  async function handleSubmit(event) {
    event.preventDefault()
    const validationError = validateDueDate(dueOn, prompt.currentDueOn)
    if (validationError) {
      setError(validationError)
      return
    }

    setPending(true)
    setError(null)
    try {
      const result = await onCreateDueDate({ cardId: prompt.cardId, dueOn })
      if (result?.ok !== true) {
        setError(getResultError(result, 'The next due date could not be saved.'))
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The next due date could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="cashout-cycle-modal-backdrop" role="presentation" onMouseDown={onDismiss}>
      <section
        className="cashout-cycle-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashout-cycle-due-date-prompt-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="cashout-cycle-panel-header">
          <div>
            <p className="cashout-cycle-kicker">Monthly Due Date</p>
            <h2 id="cashout-cycle-due-date-prompt-title">Next Due Date</h2>
          </div>
          <button type="button" className="cashout-cycle-icon-button" onClick={onDismiss} aria-label="Close dialog" title="Close" disabled={pending}>
            <i className="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <p className="cashout-cycle-form-help">
          The current Due Date for <strong>{prompt.cardName}</strong> is {prompt.currentDueOn}. Add the next Due Date?
        </p>
        {error && <p className="cashout-cycle-form-error" role="alert">{error}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="cashout-next-due-date">Next Due Date</label>
            <input
              id="cashout-next-due-date"
              name="dueOn"
              type="date"
              value={dueOn}
              onChange={event => {
                setDueOn(event.target.value)
                setError(null)
              }}
              disabled={pending}
              required
            />
          </div>
          <div className="cashout-cycle-form-actions">
            <button type="button" className="cashout-cycle-secondary-button" onClick={onDismiss} disabled={pending}>Later</button>
            <button type="submit" className="cashout-cycle-primary-button" disabled={pending}>
              {pending ? 'Saving...' : 'Save Due Date'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}