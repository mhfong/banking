import { useState } from 'react'

const DEFAULT_SETTINGS = {
  salaryAmount: 0,
  protectedMonthlyBudget: 0,
  startingCashReserve: 0,
  reminderDaysBefore: 3,
  browserNotificationsEnabled: false,
}

function parseNumber(value, label) {
  const text = String(value ?? '').trim()
  const number = Number(text)
  if (!text || !Number.isFinite(number) || number < 0) {
    return { error: `${label} must be a finite non-negative number.` }
  }
  return { value: number }
}

function getResultError(result, fallback) {
  return result?.message || fallback
}

export default function CashflowSettingsForm({
  settings = {},
  notificationPermission = 'unsupported',
  onRequestNotificationPermission,
  onSaveSettings,
  onSuccess,
  onCancel,
}) {
  const [values, setValues] = useState(() => ({
    salaryAmount: String(settings.salaryAmount ?? DEFAULT_SETTINGS.salaryAmount),
    protectedMonthlyBudget: String(settings.protectedMonthlyBudget ?? DEFAULT_SETTINGS.protectedMonthlyBudget),
    startingCashReserve: String(settings.startingCashReserve ?? DEFAULT_SETTINGS.startingCashReserve),
    reminderDaysBefore: String(settings.reminderDaysBefore ?? DEFAULT_SETTINGS.reminderDaysBefore),
    browserNotificationsEnabled: Boolean(settings.browserNotificationsEnabled),
  }))
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)
  const [permissionPending, setPermissionPending] = useState(false)
  const [permissionMessage, setPermissionMessage] = useState(null)

  function updateValue(event) {
    const { name, type, value, checked } = event.target
    setValues(current => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
    setError(null)
  }

  async function handleRequestNotificationPermission() {
    if (typeof onRequestNotificationPermission !== 'function') return

    setPermissionPending(true)
    setPermissionMessage(null)
    try {
      const permission = await onRequestNotificationPermission()
      if (permission === 'granted') {
        setValues(current => ({ ...current, browserNotificationsEnabled: true }))
        setPermissionMessage('Browser payment reminders are permitted. Save settings to keep them enabled.')
      } else if (permission === 'denied') {
        setPermissionMessage('Browser permission was denied. In-page reminders remain available.')
      } else if (permission === 'unsupported') {
        setPermissionMessage('This browser does not support notifications. In-page reminders remain available.')
      } else {
        setPermissionMessage('Browser permission was not granted. In-page reminders remain available.')
      }
    } catch {
      setPermissionMessage('Browser permission could not be requested. In-page reminders remain available.')
    } finally {
      setPermissionPending(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const fields = [
      ['salaryAmount', 'Salary amount'],
      ['protectedMonthlyBudget', 'Protected monthly budget'],
      ['startingCashReserve', 'Starting cash reserve'],
      ['reminderDaysBefore', 'Reminder days before'],
    ]
    const numbers = {}
    for (const [field, label] of fields) {
      const result = parseNumber(values[field], label)
      if (result.error) {
        setError(result.error)
        return
      }
      numbers[field] = result.value
    }

    setPending(true)
    setError(null)
    try {
      const result = await onSaveSettings({
        ...numbers,
        salaryDay: 28,
        salaryAdjustment: 'previousWorkingDay',
        browserNotificationsEnabled: values.browserNotificationsEnabled,
      })
      if (result?.ok !== true) {
        setError(getResultError(result, 'Cash-flow settings could not be saved.'))
        return
      }
      onSuccess?.()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Cash-flow settings could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="cashout-cycle-form" onSubmit={handleSubmit} noValidate>
      {error && <p className="cashout-cycle-form-error" role="alert">{error}</p>}
      <div className="cashout-cycle-form-grid">
        <div className="form-group">
          <label htmlFor="cashout-settings-salary">Salary amount</label>
          <input id="cashout-settings-salary" name="salaryAmount" type="number" min="0" step="0.01" value={values.salaryAmount} onChange={updateValue} disabled={pending} required />
        </div>
        <div className="form-group">
          <label htmlFor="cashout-settings-budget">Protected monthly budget</label>
          <input id="cashout-settings-budget" name="protectedMonthlyBudget" type="number" min="0" step="0.01" value={values.protectedMonthlyBudget} onChange={updateValue} disabled={pending} required />
        </div>
      </div>
      <div className="cashout-cycle-form-grid">
        <div className="form-group">
          <label htmlFor="cashout-settings-reserve">Starting cash reserve</label>
          <input id="cashout-settings-reserve" name="startingCashReserve" type="number" min="0" step="0.01" value={values.startingCashReserve} onChange={updateValue} disabled={pending} required />
        </div>
        <div className="form-group">
          <label htmlFor="cashout-settings-reminder">Reminder days before</label>
          <input id="cashout-settings-reminder" name="reminderDaysBefore" type="number" min="0" step="1" value={values.reminderDaysBefore} onChange={updateValue} disabled={pending} required />
        </div>
      </div>
      <p className="cashout-cycle-form-help">Salary is kept on day 28 and moves to the previous working day when needed.</p>
      <label className="cashout-cycle-checkbox">
        <input name="browserNotificationsEnabled" type="checkbox" checked={values.browserNotificationsEnabled} onChange={updateValue} disabled={pending} />
        <span>Allow browser payment reminders</span>
      </label>
      <div className="cashout-cycle-notification-action">
        <button
          type="button"
          className="cashout-cycle-secondary-button"
          onClick={handleRequestNotificationPermission}
          disabled={pending || permissionPending || typeof onRequestNotificationPermission !== 'function'}
        >
          <i className="fas fa-bell" aria-hidden="true"></i>
          {permissionPending
            ? 'Requesting...'
            : notificationPermission === 'granted'
              ? 'Browser permission granted'
              : 'Request browser permission'}
        </button>
        {permissionMessage && <p className="cashout-cycle-form-help" role="status">{permissionMessage}</p>}
      </div>
      <div className="cashout-cycle-form-actions">
        <button type="button" className="cashout-cycle-secondary-button" onClick={onCancel} disabled={pending}>Cancel</button>
        <button type="submit" className="cashout-cycle-primary-button" disabled={pending}>
          {pending ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </form>
  )
}