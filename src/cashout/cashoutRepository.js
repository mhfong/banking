import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { compareDateOnly, parseDateOnly } from './hongKongWorkingDays.js'

const COLLECTIONS = {
  cards: 'cashoutCards',
  cashouts: 'cashouts',
  dueDates: 'cashoutDueDates',
  payments: 'cashoutPayments',
  limitChanges: 'cashoutLimitChanges',
  settings: 'cashoutSettings',
}

const DEFAULT_CASHOUT_SETTINGS = Object.freeze({
  salaryAmount: 0,
  salaryDay: 28,
  salaryAdjustment: 'previousWorkingDay',
  protectedMonthlyBudget: 0,
  startingCashReserve: 0,
  reminderDaysBefore: 3,
  browserNotificationsEnabled: false,
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new TypeError('A userId is required')
  }
  return userId
}

function requireId(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} is required`)
  }
  return value
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} is required`)
  }
  return value
}

function requireOptionalText(value, label) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`)
  }
  return value
}

function requireNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative number`)
  }
  return value
}

function requireIntegerInRange(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean`)
  }
  return value
}

function requireDateOnly(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} is required`)
  }
  parseDateOnly(value)
  return value
}

function normalizeSettings(settings = {}) {
  if (!isRecord(settings)) {
    throw new TypeError('settings must be an object')
  }

  const merged = { ...DEFAULT_CASHOUT_SETTINGS, ...settings }
  return {
    salaryAmount: requireNonNegativeNumber(merged.salaryAmount, 'salaryAmount'),
    salaryDay: requireIntegerInRange(merged.salaryDay, 'salaryDay', 1, 31),
    salaryAdjustment: merged.salaryAdjustment === 'previousWorkingDay'
      ? merged.salaryAdjustment
      : (() => { throw new RangeError('salaryAdjustment must be previousWorkingDay') })(),
    protectedMonthlyBudget: requireNonNegativeNumber(
      merged.protectedMonthlyBudget,
      'protectedMonthlyBudget',
    ),
    startingCashReserve: requireNonNegativeNumber(merged.startingCashReserve, 'startingCashReserve'),
    reminderDaysBefore: requireNonNegativeNumber(merged.reminderDaysBefore, 'reminderDaysBefore'),
    browserNotificationsEnabled: requireBoolean(
      merged.browserNotificationsEnabled,
      'browserNotificationsEnabled',
    ),
  }
}

function normalizeCard(card) {
  if (!isRecord(card)) throw new TypeError('card must be an object')

  return {
    name: requireText(card.name, 'Card name'),
    issuer: requireOptionalText(card.issuer, 'Card issuer'),
    totalCreditLimit: requireNonNegativeNumber(card.totalCreditLimit, 'Total credit limit'),
    monthlyBorrowLimit: requireNonNegativeNumber(card.monthlyBorrowLimit, 'Monthly borrow limit'),
    nextStatementDate: requireDateOnly(card.nextStatementDate, 'Next statement date'),
    nextBorrowDate: requireDateOnly(card.nextBorrowDate, 'Next borrow date'),
    active: card.active === undefined ? true : requireBoolean(card.active, 'Card active state'),
    archivedAt: card.archivedAt === undefined ? null : card.archivedAt,
  }
}

function normalizeCashout(cashout, cardId) {
  if (!isRecord(cashout)) throw new TypeError('cashout must be an object')

  const status = cashout.status ?? 'open'
  if (status !== 'open' && status !== 'paid') {
    throw new TypeError('Cashout status must be open or paid')
  }

  const borrowedOn = requireDateOnly(cashout.borrowedOn, 'Cashout borrowedOn')
  const statementDate = requireDateOnly(cashout.statementDate, 'Cashout statement date')
  if (compareDateOnly(statementDate, borrowedOn) < 0) {
    throw new RangeError('Cashout statement date cannot be before borrowedOn')
  }

  return {
    cardId: requireId(cardId ?? cashout.cardId, 'Cashout cardId'),
    amount: requireNonNegativeNumber(cashout.amount, 'Cashout amount'),
    borrowedOn,
    statementDate,
    expectedPaymentOn: requireDateOnly(cashout.expectedPaymentOn, 'Cashout expectedPaymentOn'),
    expectedPaymentAmount: requireNonNegativeNumber(
      cashout.expectedPaymentAmount,
      'Cashout expectedPaymentAmount',
    ),
    status,
  }
}

function normalizePayment(payment) {
  if (!isRecord(payment)) throw new TypeError('payment must be an object')

  return {
    cashoutId: requireId(payment.cashoutId, 'Payment cashoutId'),
    amount: requireNonNegativeNumber(payment.amount, 'Payment amount'),
    paidOn: requireDateOnly(payment.paidOn, 'Payment paidOn'),
    note: requireOptionalText(payment.note, 'Payment note'),
  }
}

function normalizeDueDate(dueDate) {
  if (!isRecord(dueDate)) throw new TypeError('dueDate must be an object')

  return {
    cardId: requireId(dueDate.cardId, 'Due date cardId'),
    dueOn: requireDateOnly(dueDate.dueOn, 'Due date dueOn'),
  }
}

function normalizeLimitChange(change) {
  if (!isRecord(change)) throw new TypeError('change must be an object')

  return {
    cardId: requireId(change.cardId, 'Limit change cardId'),
    effectiveOn: requireDateOnly(change.effectiveOn, 'Limit change effectiveOn'),
    monthlyBorrowLimit: requireNonNegativeNumber(
      change.monthlyBorrowLimit,
      'Limit change monthlyBorrowLimit',
    ),
    note: requireOptionalText(change.note, 'Limit change note'),
  }
}

function normalizeCardPatch(patch) {
  if (!isRecord(patch) || Object.keys(patch).length === 0) {
    throw new TypeError('A card patch is required')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'userId')) {
    throw new TypeError('Card userId cannot be changed')
  }

  const normalized = {}
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    normalized.name = requireText(patch.name, 'Card name')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'issuer')) {
    normalized.issuer = requireOptionalText(patch.issuer, 'Card issuer')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'totalCreditLimit')) {
    normalized.totalCreditLimit = requireNonNegativeNumber(
      patch.totalCreditLimit,
      'Total credit limit',
    )
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'monthlyBorrowLimit')) {
    normalized.monthlyBorrowLimit = requireNonNegativeNumber(
      patch.monthlyBorrowLimit,
      'Monthly borrow limit',
    )
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nextStatementDate')) {
    normalized.nextStatementDate = requireDateOnly(patch.nextStatementDate, 'Next statement date')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'nextBorrowDate')) {
    normalized.nextBorrowDate = requireDateOnly(patch.nextBorrowDate, 'Next borrow date')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'active')) {
    normalized.active = requireBoolean(patch.active, 'Card active state')
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'archivedAt')) {
    normalized.archivedAt = patch.archivedAt
  }

  if (Object.keys(normalized).length === 0) {
    throw new TypeError('A card patch has no editable fields')
  }
  return normalized
}

function isPermissionDeniedError(error) {
  return error?.code === 'permission-denied'
    || /missing or insufficient permissions/i.test(error?.message ?? '')
}

function mapDocuments(snapshot) {
  return snapshot.docs.map(document => ({ ...document.data(), id: document.id }))
}

async function getOwnedCardReference(userId, cardId) {
  const cardReference = doc(db, COLLECTIONS.cards, cardId)
  const cardSnapshot = await getDoc(cardReference)
  if (!cardSnapshot.exists()) {
    throw new Error('Card not found')
  }
  if (cardSnapshot.data()?.userId !== userId) {
    throw new Error('Card is not owned by this user')
  }
  return cardReference
}

export async function loadCashoutData(userId) {
  requireUserId(userId)

  const [cardsSnapshot, cashoutsSnapshot, paymentsSnapshot, limitChangesSnapshot, dueDatesSnapshot, settingsSnapshot] = await Promise.all([
    getDocs(query(
      collection(db, COLLECTIONS.cards),
      where('userId', '==', userId),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.cashouts),
      where('userId', '==', userId),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.payments),
      where('userId', '==', userId),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.limitChanges),
      where('userId', '==', userId),
    )),
    getDocs(query(
      collection(db, COLLECTIONS.dueDates),
      where('userId', '==', userId),
    )).catch(error => {
      if (isPermissionDeniedError(error)) return { docs: [] }
      throw error
    }),
    getDoc(doc(db, COLLECTIONS.settings, userId)),
  ])

  const storedSettings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
  return {
    cards: mapDocuments(cardsSnapshot),
    cashouts: mapDocuments(cashoutsSnapshot),
    payments: mapDocuments(paymentsSnapshot),
    limitChanges: mapDocuments(limitChangesSnapshot),
    dueDates: mapDocuments(dueDatesSnapshot),
    settings: normalizeSettings(storedSettings),
  }
}

export async function saveCashoutSettings(userId, settings) {
  requireUserId(userId)
  const normalizedSettings = normalizeSettings(settings)
  await setDoc(
    doc(db, COLLECTIONS.settings, userId),
    { ...normalizedSettings, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

export async function createCardWithOpeningCashout(userId, card, openingCashout = { amount: 0 }) {
  requireUserId(userId)
  const normalizedCard = normalizeCard(card)
  const requestedCardId = card.id === undefined ? null : requireId(card.id, 'Card id')
  const openingAmount = openingCashout?.amount
  if (openingCashout != null && openingAmount !== 0) {
    requireNonNegativeNumber(openingAmount, 'Opening cashout amount')
  }
  const normalizedOpeningCashout = openingCashout != null && openingAmount !== 0
    ? normalizeCashout(openingCashout, requestedCardId ?? 'pending-card-id')
    : null

  const cardReference = requestedCardId
    ? doc(db, COLLECTIONS.cards, requestedCardId)
    : doc(collection(db, COLLECTIONS.cards))
  const batch = writeBatch(db)
  const cardPayload = {
    ...normalizedCard,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  batch.set(cardReference, cardPayload)

  let cashoutReference = null
  if (normalizedOpeningCashout) {
    cashoutReference = doc(collection(db, COLLECTIONS.cashouts))
    batch.set(cashoutReference, {
      ...normalizedOpeningCashout,
      cardId: cardReference.id,
      userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  await batch.commit()
  return {
    cardId: cardReference.id,
    cashoutId: cashoutReference?.id ?? null,
  }
}

export async function updateCard(userId, cardId, patch) {
  requireUserId(userId)
  requireId(cardId, 'Card id')
  const normalizedPatch = normalizeCardPatch(patch)
  const cardReference = await getOwnedCardReference(userId, cardId)
  await updateDoc(cardReference, {
    ...normalizedPatch,
    updatedAt: serverTimestamp(),
  })
}

export async function archiveCard(userId, cardId) {
  requireUserId(userId)
  requireId(cardId, 'Card id')
  const cardReference = await getOwnedCardReference(userId, cardId)
  await updateDoc(cardReference, {
    active: false,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteEmptyCard(userId, cardId) {
  requireUserId(userId)
  requireId(cardId, 'Card id')
  const cardReference = await getOwnedCardReference(userId, cardId)
  const historySnapshot = await getDocs(query(
    collection(db, COLLECTIONS.cashouts),
    where('userId', '==', userId),
    where('cardId', '==', cardId),
  ))

  if (!historySnapshot.empty) {
    throw new Error('Card has cashout history and cannot be deleted')
  }

  await deleteDoc(cardReference)
  return true
}

export async function createCashout(userId, cashout) {
  requireUserId(userId)
  const normalizedCashout = normalizeCashout(cashout)
  return addDoc(collection(db, COLLECTIONS.cashouts), {
    ...normalizedCashout,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function createPayment(userId, payment) {
  requireUserId(userId)
  const normalizedPayment = normalizePayment(payment)
  const cashoutReference = doc(db, COLLECTIONS.cashouts, normalizedPayment.cashoutId)
  const paymentCollection = collection(db, COLLECTIONS.payments)
  const paymentQuery = query(
    paymentCollection,
    where('userId', '==', userId),
    where('cashoutId', '==', normalizedPayment.cashoutId),
  )
  // Query reads are outside the transaction because Transaction.get only accepts document references.
  const paymentsSnapshot = await getDocs(paymentQuery)

  return runTransaction(db, async transaction => {
    const cashoutSnapshot = await transaction.get(cashoutReference)
    if (!cashoutSnapshot.exists()) {
      throw new Error('Cashout not found')
    }

    const cashoutData = cashoutSnapshot.data()
    if (cashoutData?.userId !== userId) {
      throw new Error('Cashout is not owned by this user')
    }

    const paidAmount = paymentsSnapshot.docs.reduce((total, document) => {
      const amount = document.data()?.amount
      return total + (typeof amount === 'number' && Number.isFinite(amount) ? amount : 0)
    }, 0)
    const status = paidAmount + normalizedPayment.amount >= cashoutData.amount
      ? 'paid'
      : 'open'
    const paymentReference = doc(paymentCollection)

    transaction.set(paymentReference, {
      ...normalizedPayment,
      userId,
      createdAt: serverTimestamp(),
    })
    transaction.update(cashoutReference, {
      status,
      updatedAt: serverTimestamp(),
    })

    return { id: paymentReference.id }
  })
}

export async function createDueDate(userId, dueDate) {
  requireUserId(userId)
  const normalizedDueDate = normalizeDueDate(dueDate)
  await getOwnedCardReference(userId, normalizedDueDate.cardId)
  return addDoc(collection(db, COLLECTIONS.dueDates), {
    ...normalizedDueDate,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function saveLimitChange(userId, change) {
  requireUserId(userId)
  const normalizedChange = normalizeLimitChange(change)
  return addDoc(collection(db, COLLECTIONS.limitChanges), {
    ...normalizedChange,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
