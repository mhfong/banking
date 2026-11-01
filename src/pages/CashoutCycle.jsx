import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  createCardWithOpeningCashout,
  createCashout,
  createDueDate,
  createPayment,
  loadCashoutData,
  saveCashoutSettings,
  saveLimitChange,
  updateCard,
} from '../cashout/cashoutRepository.js'
import {
  buildCashflowForecast,
  calculateLoopSummary,
  getSafeBorrowDate,
  getLoopStatus,
} from '../cashout/cashoutCalculations.js'
import { getHongKongHolidayCalendar } from '../cashout/hongKongWorkingDays.js'
import { getDueDatePrompts } from '../cashout/dueDates.js'
import {
  getUpcomingPaymentReminders,
  notifyUpcomingPayments,
  requestBrowserNotificationPermission,
} from '../cashout/reminders.js'
import CashoutCardForm from '../components/cashout/CashoutCardForm.jsx'
import CashoutDueDatePrompt from '../components/cashout/CashoutDueDatePrompt.jsx'
import CashoutForm from '../components/cashout/CashoutForm.jsx'
import CashoutPaymentForm from '../components/cashout/CashoutPaymentForm.jsx'
import CashflowSettingsForm from '../components/cashout/CashflowSettingsForm.jsx'
import LimitChangeForm from '../components/cashout/LimitChangeForm.jsx'
import CardCapacityGrid from '../components/cashout/CardCapacityGrid.jsx'
import CashflowForecast from '../components/cashout/CashflowForecast.jsx'
import CashoutStatusBanner from '../components/cashout/CashoutStatusBanner.jsx'
import CashoutTimeline from '../components/cashout/CashoutTimeline.jsx'
import '../styles/cashout-cycle.css'

function getErrorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback
}

function getTodayDateOnly() {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function formatAmount(value) {
  const amount = Number(value)
  return `HK$${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })}`
}

function getNotificationPermissionState() {
  const permission = globalThis.Notification?.permission
  return ['granted', 'denied', 'default'].includes(permission) ? permission : 'unsupported'
}

function CashoutReminderList({ reminders = [], warning = null }) {
  return (
    <section className="cashout-cycle-panel cashout-cycle-reminders-panel" aria-labelledby="cashout-cycle-reminders-title" data-cashout-section="reminders">
      <div className="cashout-cycle-panel-header">
        <div className="cashout-cycle-slot-title">
          <i className="fas fa-bell" aria-hidden="true"></i>
          <h2 id="cashout-cycle-reminders-title">Payment reminders</h2>
        </div>
        <span className="cashout-cycle-reminder-count">{reminders.length} active</span>
      </div>
      {warning && <p className="cashout-cycle-reminder-warning" role="status">{warning}</p>}
      {reminders.length === 0 ? (
        <p className="cashout-cycle-reminders-empty">No payment reminders are active today.</p>
      ) : (
        <ul className="cashout-cycle-reminder-list">
          {reminders.map(reminder => (
            <li className="cashout-cycle-reminder-item" key={reminder.cashoutId}>
              <div>
                <strong>{reminder.cardName}</strong>
                <span>{reminder.status === 'due-today' ? 'Due today' : `Due ${reminder.expectedPaymentOn}`}</span>
              </div>
              <div>
                <strong>{formatAmount(reminder.amount)}</strong>
                <small>Reminder {reminder.reminderDate}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CashoutCycleModal({
  modal,
  onClose,
  selectedCashoutId,
  selectedCardId,
  data,
  settings,
  today,
  callbacks,
}) {
  const title = modal === 'card'
    ? selectedCardId ? 'Edit card' : 'Add card'
    : modal === 'cashout'
      ? 'New cashout'
      : modal === 'payment'
        ? 'Record payment'
        : modal === 'settings'
          ? 'Cash-flow settings'
          : 'Limit change'

  return (
    <div className="cashout-cycle-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="cashout-cycle-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cashout-cycle-modal-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="cashout-cycle-panel-header">
          <h2 id="cashout-cycle-modal-title">{title}</h2>
          <button type="button" className="cashout-cycle-icon-button" onClick={onClose} aria-label="Close dialog" title="Close">
            <i className="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
        {modal === 'card' && (
          <CashoutCardForm
            cards={data?.cards ?? []}
            cashouts={data?.cashouts ?? []}
            dueDates={data?.dueDates ?? []}
            today={today}
            initialCardId={selectedCardId}
            onCreateCard={callbacks.onCreateCard}
            onUpdateCard={callbacks.onUpdateCard}
            onCreateDueDate={callbacks.onCreateDueDate}
            onSuccess={onClose}
            onCancel={onClose}
          />
        )}
        {modal === 'cashout' && (
          <CashoutForm
            cards={data?.cards ?? []}
            cashouts={data?.cashouts ?? []}
            payments={data?.payments ?? []}
            limitChanges={data?.limitChanges ?? []}
            today={today}
            onCreateCashout={callbacks.onCreateCashout}
            onSuccess={onClose}
            onCancel={onClose}
          />
        )}
        {modal === 'payment' && (
          <CashoutPaymentForm
            cashout={(data?.cashouts ?? []).find(cashout => cashout.id === selectedCashoutId)}
            payments={data?.payments ?? []}
            today={today}
            onCreatePayment={callbacks.onCreatePayment}
            onSuccess={onClose}
            onCancel={onClose}
          />
        )}
        {modal === 'settings' && (
          <CashflowSettingsForm
            settings={settings}
            notificationPermission={callbacks.notificationPermission}
            onRequestNotificationPermission={callbacks.onRequestNotificationPermission}
            onSaveSettings={callbacks.onSaveSettings}
            onSuccess={onClose}
            onCancel={onClose}
          />
        )}
        {modal === 'limit-change' && (
          <LimitChangeForm
            cards={data?.cards ?? []}
            limitChanges={data?.limitChanges ?? []}
            today={today}
            onSaveLimitChange={callbacks.onSaveLimitChange}
            onSuccess={onClose}
            onCancel={onClose}
          />
        )}
      </section>
    </div>
  )
}

export default function CashoutCycle() {
  const { user } = useAuth()
  const userId = user?.uid
  const [data, setData] = useState(null)
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [selectedCashoutId, setSelectedCashoutId] = useState(null)
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [dismissedDueDatePromptIds, setDismissedDueDatePromptIds] = useState(() => new Set())
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermissionState)
  const today = useMemo(getTodayDateOnly, [])
  const forecastRef = useRef(null)
  const notifiedReminderKeysRef = useRef(new Set())
  const cards = Array.isArray(data?.cards) ? data.cards : []
  const cashouts = Array.isArray(data?.cashouts) ? data.cashouts : []
  const dueDates = Array.isArray(data?.dueDates) ? data.dueDates : []
  const payments = Array.isArray(data?.payments) ? data.payments : []
  const limitChanges = Array.isArray(data?.limitChanges) ? data.limitChanges : []
  const activeCards = cards.filter(card => card.active !== false)

  const loadData = useCallback(async () => {
    if (!userId) return null

    setLoading(true)
    setError(null)
    try {
      const loadedData = await loadCashoutData(userId)
      setData(loadedData)
      setSettings(loadedData.settings)
      return { ok: true, data: loadedData }
    } catch (loadError) {
      const message = getErrorMessage(loadError, 'Cashout Cycle could not be loaded.')
      setError(message)
      return { ok: false, error: loadError, message }
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setData(null)
    setSettings(null)
    setError(null)
    loadData()
  }, [loadData])

  const runMutation = useCallback(async mutation => {
    if (typeof mutation !== 'function') {
      const callbackError = new TypeError('A mutation callback is required')
      setError(callbackError.message)
      return { ok: false, error: callbackError, message: callbackError.message }
    }

    setError(null)
    try {
      const result = await mutation()
      const refreshResult = await loadData()
      if (!refreshResult?.ok) {
        const refreshError = refreshResult?.error ?? new Error('Cashout Cycle refresh failed.')
        const message = refreshResult?.message ?? getErrorMessage(
          refreshError,
          'Cashout Cycle could not be refreshed.',
        )
        setError(message)
        return { ok: false, error: refreshError, message, result }
      }
      return { ok: true, result }
    } catch (mutationError) {
      const message = getErrorMessage(mutationError, 'The Cashout Cycle change could not be saved.')
      setError(message)
      return { ok: false, error: mutationError, message }
    }
  }, [loadData])

  const runUserMutation = useCallback(operation => {
    if (!userId) {
      const authError = new Error('A signed-in user is required')
      setError(authError.message)
      return Promise.resolve({ ok: false, error: authError, message: authError.message })
    }
    return runMutation(() => operation(userId))
  }, [runMutation, userId])

  const onSaveSettings = useCallback(values => (
    runUserMutation(uid => saveCashoutSettings(uid, values))
  ), [runUserMutation])

  const onRequestNotificationPermission = useCallback(async () => {
    try {
      const permission = await requestBrowserNotificationPermission()
      setNotificationPermission(permission)
      return permission
    } catch {
      setNotificationPermission('unsupported')
      return 'unsupported'
    }
  }, [])

  const onCreateCard = useCallback((card, openingCashout) => (
    runUserMutation(uid => createCardWithOpeningCashout(uid, card, openingCashout))
  ), [runUserMutation])

  const onUpdateCard = useCallback((cardId, patch) => (
    runUserMutation(uid => updateCard(uid, cardId, patch))
  ), [runUserMutation])

  const onCreateDueDate = useCallback(dueDate => (
    runUserMutation(uid => createDueDate(uid, dueDate))
  ), [runUserMutation])

  const onCreateCashout = useCallback(cashout => (
    runUserMutation(uid => createCashout(uid, cashout))
  ), [runUserMutation])

  const onCreatePayment = useCallback(payment => (
    runUserMutation(uid => createPayment(uid, payment))
  ), [runUserMutation])

  const onSaveLimitChange = useCallback(change => (
    runUserMutation(uid => saveLimitChange(uid, change))
  ), [runUserMutation])

  const dueDatePrompts = useMemo(() => {
    try {
      return getDueDatePrompts({ cards, cashouts, dueDates, today })
    } catch {
      return []
    }
  }, [cards, cashouts, dueDates, today])
  const activeDueDatePrompt = dueDatePrompts.find(
    prompt => !dismissedDueDatePromptIds.has(prompt.cardId),
  ) ?? null
  const dismissDueDatePrompt = useCallback(cardId => {
    setDismissedDueDatePromptIds(current => new Set([...current, cardId]))
  }, [])

  const activeSettings = settings ?? data?.settings ?? {}
  const reminderState = useMemo(() => {
    const years = new Set([Number(today.slice(0, 4))])
    cashouts.forEach(cashout => {
      if (cashout.expectedPaymentOn) years.add(Number(cashout.expectedPaymentOn.slice(0, 4)))
    })
    const calendar = getHongKongHolidayCalendar([...years])
    const warning = calendar.missingYears.length > 0
      ? `Reminder dates are missing Hong Kong holiday data for ${calendar.missingYears.join(', ')}.`
      : null

    try {
      return {
        reminders: getUpcomingPaymentReminders({
          cards,
          cashouts,
          payments,
          today,
          daysBefore: activeSettings.reminderDaysBefore ?? 3,
          holidaySet: calendar.holidaySet,
        }),
        warning,
      }
    } catch (reminderError) {
      return {
        reminders: [],
        warning: getErrorMessage(reminderError, 'Payment reminders are temporarily unavailable.'),
      }
    }
  }, [activeSettings.reminderDaysBefore, cards, cashouts, payments, today])

  useEffect(() => {
    const checkForNotifications = () => {
      if (activeSettings.browserNotificationsEnabled !== true || notificationPermission !== 'granted') return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

      const remindersToNotify = reminderState.reminders.filter(reminder => {
        const key = `${reminder.cashoutId}:${reminder.expectedPaymentOn}:${reminder.amount}`
        return !notifiedReminderKeysRef.current.has(key)
      })
      if (remindersToNotify.length === 0) return

      const sentReminders = notifyUpcomingPayments(remindersToNotify, notificationPermission)
      sentReminders.forEach(reminder => {
        notifiedReminderKeysRef.current.add(`${reminder.cashoutId}:${reminder.expectedPaymentOn}:${reminder.amount}`)
      })
    }

    checkForNotifications()
    if (typeof document === 'undefined') return undefined

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForNotifications()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [activeSettings.browserNotificationsEnabled, notificationPermission, reminderState.reminders])

  const derived = useMemo(() => {
    if (!data) return null

    try {
      const calculationInput = { ...data, settings: activeSettings }
      const summary = calculateLoopSummary({ ...calculationInput, today })
      const forecast = buildCashflowForecast({ ...calculationInput, today })
      return { summary, forecast, status: getLoopStatus(forecast) }
    } catch (calculationError) {
      return { error: getErrorMessage(calculationError, 'Cashout Cycle calculations are unavailable.') }
    }
  }, [activeSettings, data, today])

  const viewCards = useMemo(() => {
    if (!derived?.summary) return []

    return activeCards.map((card, cardIndex) => {
      const capacity = derived.summary.capacities?.[cardIndex] ?? {}
      let safeBorrow = { date: null, reason: 'Safe borrow date is unavailable.' }

      try {
        safeBorrow = getSafeBorrowDate({
          asOf: today,
          card,
          cashouts,
          payments,
          limitChanges,
        })
      } catch (safeDateError) {
        safeBorrow = {
          date: null,
          reason: getErrorMessage(safeDateError, 'Safe borrow date is unavailable.'),
        }
      }

      return { ...card, capacity, safeBorrow }
    })
  }, [activeCards, cards, cashouts, derived, limitChanges, payments, today])

  const displayStatus = useMemo(() => {
    if (!derived?.status) return null
    const failure = derived.status.firstFailure
    if (!failure?.cardId) return derived.status

    const card = cards.find(candidate => candidate.id === failure.cardId)
    return {
      ...derived.status,
      firstFailure: { ...failure, cardName: card?.name ?? failure.cardName },
    }
  }, [cards, derived])

  const openModal = useCallback((nextModal, cashoutId = null) => {
    setSelectedCashoutId(cashoutId)
    setSelectedCardId(null)
    setModal(nextModal)
  }, [])

  const openCardEditor = useCallback(cardId => {
    setSelectedCashoutId(null)
    setSelectedCardId(cardId)
    setModal('card')
  }, [])

  const closeModal = useCallback(() => {
    setModal(null)
    setSelectedCashoutId(null)
    setSelectedCardId(null)
  }, [])

  const selectCashout = useCallback(cashoutId => {
    setSelectedCashoutId(cashoutId)
  }, [])

  const reviewForecast = useCallback(() => {
    const forecastElement = forecastRef.current
    forecastElement?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    forecastElement?.focus?.({ preventScroll: true })
  }, [])

  const childCallbacks = {
    onOpenModal: openModal,
    onCloseModal: closeModal,
    onSelectCashout: selectCashout,
    onRefresh: loadData,
    onSaveSettings,
    onRequestNotificationPermission,
    notificationPermission,
    onCreateCard,
    onUpdateCard,
    onCreateDueDate,
    onCreateCashout,
    onCreatePayment,
    onSaveLimitChange,
  }

  const hasCards = cards.length > 0
  const initialLoadError = !data && error

  if (loading && !data) {
    return (
      <div className="cashout-cycle-page">
        <div className="cashout-cycle-loading cashout-cycle-panel" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true"></span>
          <span>Loading Cashout Cycle</span>
        </div>
      </div>
    )
  }

  return (
    <div className="cashout-cycle-page">
      <header className="cashout-cycle-header">
        <div>
          <p className="cashout-cycle-kicker">Cash-out cycle</p>
          <h1>
            <i className="fas fa-money-bill-transfer" aria-hidden="true"></i>
            Cashout Cycle
          </h1>
          <p className="cashout-cycle-date">As of {today}</p>
        </div>
        <div className="cashout-cycle-actions">
          <button type="button" className="cashout-cycle-icon-button" onClick={loadData} disabled={loading} aria-label="Refresh Cashout Cycle" title="Refresh">
            <i className={`fas fa-sync-alt ${loading ? 'cashout-cycle-spin' : ''}`} aria-hidden="true"></i>
          </button>
          <button type="button" className="cashout-cycle-secondary-button" onClick={() => openModal('card')}>
            Add cards
          </button>
          <button type="button" className="cashout-cycle-primary-button" onClick={() => openModal('cashout')}>
            <i className="fas fa-plus" aria-hidden="true"></i>
            Add cash-out
          </button>
        </div>
      </header>

      {initialLoadError && (
        <section className="cashout-cycle-error cashout-cycle-panel" role="alert">
          <div>
            <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
            <div>
              <h2>Cashout Cycle unavailable</h2>
              <p>{error}</p>
            </div>
          </div>
          <button type="button" className="cashout-cycle-secondary-button" onClick={loadData} disabled={loading}>
            <i className="fas fa-redo" aria-hidden="true"></i>
            Retry
          </button>
        </section>
      )}

      {!initialLoadError && error && (
        <section className="cashout-cycle-inline-error" role="alert">
          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{error}</span>
          <button type="button" onClick={loadData} disabled={loading}>Retry</button>
        </section>
      )}

      {data && !hasCards ? (
        <section className="cashout-cycle-empty cashout-cycle-panel">
          <div className="cashout-cycle-empty-icon"><i className="fas fa-credit-card" aria-hidden="true"></i></div>
          <h2>No cashout cards yet</h2>
          <p>Add a card to begin tracking credit capacity and repayment dates.</p>
          <button type="button" className="cashout-cycle-primary-button" onClick={() => openModal('card')}>
            <i className="fas fa-plus" aria-hidden="true"></i>
            Add your first card
          </button>
        </section>
      ) : data ? (
        <>
          {derived?.error ? (
            <section className="cashout-cycle-error cashout-cycle-panel" role="alert">
              <div>
                <i className="fas fa-calculator" aria-hidden="true"></i>
                <div>
                  <h2>Summary unavailable</h2>
                  <p>{derived.error}</p>
                </div>
              </div>
              <div className="cashout-cycle-error-actions">
                <button type="button" className="cashout-cycle-secondary-button" onClick={() => openModal('card')}>
                  <i className="fas fa-edit" aria-hidden="true"></i>
                  Add cards
                </button>
                <button type="button" className="cashout-cycle-secondary-button" onClick={loadData}>
                  <i className="fas fa-redo" aria-hidden="true"></i>
                  Reload data
                </button>
              </div>
            </section>
          ) : (
            <>
              <div data-cashout-section="status">
                <CashoutStatusBanner status={displayStatus} onReview={reviewForecast} />
              </div>

              <section className="cashout-cycle-panel cashout-cycle-capacity-panel" aria-labelledby="cashout-cycle-capacity-title" data-cashout-section="capacity">
                <div className="cashout-cycle-panel-header">
                  <div>
                    <div className="cashout-cycle-slot-title">
                      <h2 id="cashout-cycle-capacity-title">Card capacity</h2>
                    </div>
                  </div>
                  <span className="cashout-cycle-panel-note">Credit returns when payments are recorded</span>
                </div>
                <CardCapacityGrid cards={viewCards} onEditCard={openCardEditor} />
              </section>

              <CashoutReminderList
                reminders={reminderState.reminders}
                warning={reminderState.warning}
              />

              <section className="cashout-cycle-panel cashout-cycle-calendar-panel" aria-labelledby="cashout-cycle-calendar-title" data-cashout-section="calendar">
                <div className="cashout-cycle-panel-header">
                  <div>
                    <div className="cashout-cycle-slot-title">
                      <i className="fas fa-calendar-alt" aria-hidden="true"></i>
                      <h2 id="cashout-cycle-calendar-title">Cashout calendar</h2>
                    </div>
                    <p className="cashout-cycle-panel-subtitle">Borrow, due, and payment dates by card</p>
                  </div>
                </div>
                <CashoutTimeline
                  cards={cards}
                  cashouts={cashouts}
                  dueDates={dueDates}
                  payments={payments}
                  today={today}
                />
              </section>

              <section className="cashout-cycle-panel cashout-cycle-settings-panel" aria-labelledby="cashout-cycle-settings-title">
                <div className="cashout-cycle-panel-header">
                  <div className="cashout-cycle-slot-title">
                    <i className="fas fa-sliders-h" aria-hidden="true"></i>
                    <h2 id="cashout-cycle-settings-title">Cash-flow settings</h2>
                  </div>
                  <button type="button" className="cashout-cycle-text-button" onClick={() => openModal('settings')}>
                    <i className="fas fa-edit" aria-hidden="true"></i>
                    Edit settings
                  </button>
                </div>
                <div className="cashout-cycle-settings-overview">
                  <div><span>Net salary</span><strong>{formatAmount(activeSettings.salaryAmount)}</strong></div>
                  <div><span>Protected budget</span><strong>{formatAmount(activeSettings.protectedMonthlyBudget)}</strong></div>
                  <div><span>Starting reserve</span><strong>{formatAmount(activeSettings.startingCashReserve)}</strong></div>
                  <div><span>Reminder lead</span><strong>{activeSettings.reminderDaysBefore ?? 3} days</strong></div>
                </div>
                <p className="cashout-cycle-settings-note">Salary is adjusted to the previous Hong Kong working day when the scheduled date is not a working day.</p>
              </section>

              <section
                ref={forecastRef}
                id="cashout-cycle-forecast-panel"
                className="cashout-cycle-panel cashout-cycle-forecast-panel"
                aria-labelledby="cashout-cycle-forecast-title"
                tabIndex="-1"
              >
                <div className="cashout-cycle-panel-header">
                  <div className="cashout-cycle-slot-title">
                    <i className="fas fa-chart-line" aria-hidden="true"></i>
                    <h2 id="cashout-cycle-forecast-title">Cash-flow forecast</h2>
                  </div>
                  <button type="button" className="cashout-cycle-text-button" onClick={() => openModal('limit-change')}>
                    <i className="fas fa-plus" aria-hidden="true"></i>
                    Add limit change
                  </button>
                </div>
                <CashflowForecast rows={derived.forecast.rows} status={displayStatus} />
              </section>
            </>
          )}
        </>
      ) : null}

      {modal && (
        <CashoutCycleModal
          modal={modal}
          onClose={closeModal}
          selectedCashoutId={selectedCashoutId}
          selectedCardId={selectedCardId}
          data={data}
          settings={activeSettings}
          today={today}
          callbacks={childCallbacks}
        />
      )}
      {!modal && activeDueDatePrompt && (
        <CashoutDueDatePrompt
          prompt={activeDueDatePrompt}
          onCreateDueDate={onCreateDueDate}
          onDismiss={() => dismissDueDatePrompt(activeDueDatePrompt.cardId)}
        />
      )}
    </div>
  )
}