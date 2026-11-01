import { beforeEach, describe, expect, it, vi } from 'vitest'

const firebaseMocks = vi.hoisted(() => ({
  db: { type: 'db' },
}))

const firestoreMocks = vi.hoisted(() => {
  let generatedId = 0
  const batch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  }
  const transaction = {
    get: vi.fn(reference => {
      if (reference?.type === 'query') {
        return Promise.reject(new Error('transaction.get only accepts document references'))
      }
      return Promise.resolve()
    }),
    set: vi.fn(),
    update: vi.fn(),
  }

  return {
    addDoc: vi.fn().mockResolvedValue({ id: 'created-id' }),
    batch,
    collection: vi.fn((db, name) => ({ type: 'collection', name })),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    doc: vi.fn((...args) => {
      if (args.length === 1) {
        generatedId += 1
        return { type: 'doc', collection: args[0].name, id: `generated-${generatedId}` }
      }
      return { type: 'doc', collection: args[1], id: args[2] }
    }),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    query: vi.fn((...args) => ({ type: 'query', args })),
    runTransaction: vi.fn(async (db, callback) => callback(transaction)),
    serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
    setDoc: vi.fn().mockResolvedValue(undefined),
    transaction,
    updateDoc: vi.fn().mockResolvedValue(undefined),
    where: vi.fn((...args) => ({ type: 'where', args })),
    writeBatch: vi.fn(() => batch),
  }
})

vi.mock('../../firebase', () => firebaseMocks)
vi.mock('firebase/firestore', () => firestoreMocks)

import {
  archiveCard,
  createCardWithOpeningCashout,
  createCashout,
  createDueDate,
  createPayment,
  deleteEmptyCard,
  loadCashoutData,
  saveCashoutSettings,
  saveLimitChange,
  updateCard,
} from '../cashoutRepository.js'

const USER_ID = 'user-1'

const card = {
  name: 'Primary card',
  issuer: 'Bank',
  totalCreditLimit: 50000,
  monthlyBorrowLimit: 20000,
  nextStatementDate: '2026-10-15',
  nextBorrowDate: '2026-11-20',
}

const openingCashout = {
  amount: 5000,
  borrowedOn: '2026-10-01',
  statementDate: '2026-10-15',
  expectedPaymentOn: '2026-11-01',
  expectedPaymentAmount: 5000,
}

const cashout = {
  cardId: 'card-1',
  amount: 5000,
  borrowedOn: '2026-10-01',
  statementDate: '2026-10-15',
  expectedPaymentOn: '2026-11-01',
  expectedPaymentAmount: 5000,
}

const payment = {
  cashoutId: 'cashout-1',
  amount: 2500,
  paidOn: '2026-10-20',
}

const limitChange = {
  cardId: 'card-1',
  effectiveOn: '2026-11-01',
  monthlyBorrowLimit: 15000,
}

const dueDate = {
  cardId: 'card-1',
  dueOn: '2026-11-03',
}

const snapshot = (id, data) => ({ id, data: () => data })

function expectNoFirestoreCalls() {
  expect(firestoreMocks.addDoc).not.toHaveBeenCalled()
  expect(firestoreMocks.collection).not.toHaveBeenCalled()
  expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled()
  expect(firestoreMocks.doc).not.toHaveBeenCalled()
  expect(firestoreMocks.getDoc).not.toHaveBeenCalled()
  expect(firestoreMocks.getDocs).not.toHaveBeenCalled()
  expect(firestoreMocks.query).not.toHaveBeenCalled()
  expect(firestoreMocks.runTransaction).not.toHaveBeenCalled()
  expect(firestoreMocks.setDoc).not.toHaveBeenCalled()
  expect(firestoreMocks.updateDoc).not.toHaveBeenCalled()
  expect(firestoreMocks.where).not.toHaveBeenCalled()
  expect(firestoreMocks.writeBatch).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  firestoreMocks.getDocs.mockReset()
  firestoreMocks.transaction.get
    .mockReset()
    .mockImplementation(reference => {
      if (reference?.type === 'query') {
        return Promise.reject(new Error('transaction.get only accepts document references'))
      }
      return Promise.resolve()
    })
})

describe('cashout repository writes', () => {
  it('writes settings at the uid path and normalizes missing settings values', async () => {
    await saveCashoutSettings(USER_ID, { salaryAmount: 12000 })

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashoutSettings', id: USER_ID },
      expect.objectContaining({
        salaryAmount: 12000,
        salaryDay: 28,
        salaryAdjustment: 'previousWorkingDay',
        protectedMonthlyBudget: 0,
        startingCashReserve: 0,
        reminderDaysBefore: 3,
        browserNotificationsEnabled: false,
        updatedAt: 'SERVER_TIMESTAMP',
      }),
      { merge: true },
    )
  })

  it('attaches the authenticated user id to standalone create payloads', async () => {
    await createCashout(USER_ID, cashout)
    await saveLimitChange(USER_ID, limitChange)

    expect(firestoreMocks.addDoc).toHaveBeenNthCalledWith(
      1,
      { type: 'collection', name: 'cashouts' },
      expect.objectContaining({ userId: USER_ID, ...cashout }),
    )
    expect(firestoreMocks.addDoc).toHaveBeenNthCalledWith(
      2,
      { type: 'collection', name: 'cashoutLimitChanges' },
      expect.objectContaining({ userId: USER_ID, ...limitChange }),
    )
  })

  it('writes an owned monthly due date without changing cashouts', async () => {
    firestoreMocks.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: USER_ID }),
    })

    await createDueDate(USER_ID, dueDate)

    expect(firestoreMocks.addDoc).toHaveBeenCalledWith(
      { type: 'collection', name: 'cashoutDueDates' },
      expect.objectContaining({ userId: USER_ID, ...dueDate }),
    )
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled()
  })

  it('keeps a cashout open after a partial payment and writes both records in one transaction', async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [snapshot('existing-payment', {
        userId: USER_ID,
        cashoutId: payment.cashoutId,
        amount: 1000,
      })],
    })
    firestoreMocks.transaction.get
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ userId: USER_ID, amount: 5000, status: 'open' }),
      })

    await createPayment(USER_ID, payment)

    expect(firestoreMocks.getDocs).toHaveBeenCalledWith({
      type: 'query',
      args: [
        { type: 'collection', name: 'cashoutPayments' },
        { type: 'where', args: ['userId', '==', USER_ID] },
        { type: 'where', args: ['cashoutId', '==', payment.cashoutId] },
      ],
    })
    expect(firestoreMocks.transaction.get).toHaveBeenCalledTimes(1)
    expect(firestoreMocks.transaction.get).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashouts', id: payment.cashoutId },
    )
    expect(firestoreMocks.transaction.get).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'query' }),
    )
    expect(firestoreMocks.runTransaction).toHaveBeenCalledWith(firebaseMocks.db, expect.any(Function))
    expect(firestoreMocks.transaction.set).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'doc', collection: 'cashoutPayments' }),
      expect.objectContaining({ userId: USER_ID, ...payment, note: null, createdAt: 'SERVER_TIMESTAMP' }),
    )
    expect(firestoreMocks.transaction.update).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashouts', id: payment.cashoutId },
      { status: 'open', updatedAt: 'SERVER_TIMESTAMP' },
    )
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled()
  })

  it('marks a cashout paid when the accumulated payments reach its amount', async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({
      docs: [snapshot('existing-payment', {
        userId: USER_ID,
        cashoutId: payment.cashoutId,
        amount: 2500,
      })],
    })
    firestoreMocks.transaction.get
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ userId: USER_ID, amount: 5000, status: 'open' }),
      })

    await createPayment(USER_ID, payment)

    expect(firestoreMocks.transaction.update).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashouts', id: payment.cashoutId },
      { status: 'paid', updatedAt: 'SERVER_TIMESTAMP' },
    )
  })

  it('rejects a payment for a cashout owned by another user before writing', async () => {
    firestoreMocks.getDocs.mockResolvedValueOnce({ docs: [] })
    firestoreMocks.transaction.get.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ userId: 'other-user', amount: 5000, status: 'open' }),
    })

    await expect(createPayment(USER_ID, payment)).rejects.toThrow(/owned|owner/i)
    expect(firestoreMocks.transaction.get).toHaveBeenCalledTimes(1)
    expect(firestoreMocks.transaction.set).not.toHaveBeenCalled()
    expect(firestoreMocks.transaction.update).not.toHaveBeenCalled()
    expect(firestoreMocks.addDoc).not.toHaveBeenCalled()
  })

  it('writes a card and a non-zero opening cashout in one batch', async () => {
    await createCardWithOpeningCashout(USER_ID, card, openingCashout)

    expect(firestoreMocks.writeBatch).toHaveBeenCalledTimes(1)
    expect(firestoreMocks.writeBatch).toHaveBeenCalledWith(firebaseMocks.db)
    expect(firestoreMocks.batch.set).toHaveBeenCalledTimes(2)
    expect(firestoreMocks.batch.commit).toHaveBeenCalledTimes(1)

    const [cardRef, cardPayload] = firestoreMocks.batch.set.mock.calls[0]
    const [cashoutRef, cashoutPayload] = firestoreMocks.batch.set.mock.calls[1]
    expect(cardRef).toMatchObject({ type: 'doc', collection: 'cashoutCards' })
    expect(cardPayload).toMatchObject({
      userId: USER_ID,
      name: card.name,
      totalCreditLimit: card.totalCreditLimit,
      monthlyBorrowLimit: card.monthlyBorrowLimit,
      nextStatementDate: card.nextStatementDate,
      nextBorrowDate: card.nextBorrowDate,
      active: true,
      archivedAt: null,
    })
    expect(cashoutRef).toMatchObject({ type: 'doc', collection: 'cashouts' })
    expect(cashoutPayload).toMatchObject({
      userId: USER_ID,
      cardId: cardRef.id,
      amount: openingCashout.amount,
      borrowedOn: openingCashout.borrowedOn,
      statementDate: openingCashout.statementDate,
      expectedPaymentOn: openingCashout.expectedPaymentOn,
      expectedPaymentAmount: openingCashout.expectedPaymentAmount,
      status: 'open',
    })
  })

  it('omits a zero opening cashout while still creating the card in one batch', async () => {
    await createCardWithOpeningCashout(USER_ID, card, { amount: 0 })

    expect(firestoreMocks.writeBatch).toHaveBeenCalledTimes(1)
    expect(firestoreMocks.batch.set).toHaveBeenCalledTimes(1)
    expect(firestoreMocks.batch.commit).toHaveBeenCalledTimes(1)
  })

  it('requires explicit statement and next borrow dates for cards', async () => {
    await expect(createCardWithOpeningCashout(
      USER_ID,
      { ...card, nextStatementDate: undefined },
      { amount: 0 },
    )).rejects.toThrow(/statement/i)
    expectNoFirestoreCalls()

    await expect(createCardWithOpeningCashout(
      USER_ID,
      { ...card, nextBorrowDate: undefined },
      { amount: 0 },
    )).rejects.toThrow(/borrow/i)
    expectNoFirestoreCalls()

    await expect(createCashout(USER_ID, { ...cashout, statementDate: undefined })).rejects.toThrow(/statement/i)
    expectNoFirestoreCalls()
  })

  it('rejects a cashout statement date before its borrow date', async () => {
    await expect(createCashout(USER_ID, {
      ...cashout,
      statementDate: '2026-09-30',
    })).rejects.toThrow(/statement date.*borrowedOn|statement date.*borrow date/i)
    expectNoFirestoreCalls()
  })

  it('rejects invalid writes before touching Firestore', async () => {
    await expect(createCashout(USER_ID, { ...cashout, amount: -1 })).rejects.toThrow(/amount/i)
    expectNoFirestoreCalls()

    await expect(createPayment(USER_ID, { ...payment, amount: -1 })).rejects.toThrow(/amount/i)
    expectNoFirestoreCalls()

    await expect(saveLimitChange(USER_ID, { ...limitChange, cardId: '' })).rejects.toThrow(/card/i)
    expectNoFirestoreCalls()

    await expect(createCardWithOpeningCashout(
      USER_ID,
      { ...card, totalCreditLimit: -1 },
      { amount: 0 },
    )).rejects.toThrow(/credit/i)
    expectNoFirestoreCalls()

    await expect(saveCashoutSettings(USER_ID, { protectedMonthlyBudget: -1 })).rejects.toThrow(/budget/i)
    expectNoFirestoreCalls()
  })

  it('rejects missing required values before touching Firestore', async () => {
    await expect(createCashout(USER_ID, { ...cashout, cardId: '' })).rejects.toThrow(/card/i)
    expectNoFirestoreCalls()

    await expect(createPayment(USER_ID, { ...payment, paidOn: undefined })).rejects.toThrow(/paid/i)
    expectNoFirestoreCalls()

    await expect(saveLimitChange(USER_ID, { ...limitChange, effectiveOn: undefined })).rejects.toThrow(/effective/i)
    expectNoFirestoreCalls()
  })

  it('rejects an incomplete non-zero opening cashout before touching Firestore', async () => {
    await expect(createCardWithOpeningCashout(USER_ID, card, {
      amount: 5000,
      statementDate: openingCashout.statementDate,
    })).rejects.toThrow(/borrowed/i)
    expectNoFirestoreCalls()
  })
})

describe('cashout repository reads and ownership checks', () => {
  it('loads user-owned collections with ids and explicit settings defaults', async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce({ docs: [snapshot('card-1', { userId: USER_ID, name: 'Card' })] })
      .mockResolvedValueOnce({ docs: [snapshot('cashout-1', { userId: USER_ID, borrowedOn: '2026-10-01' })] })
      .mockResolvedValueOnce({ docs: [snapshot('payment-1', { userId: USER_ID, paidOn: '2026-10-20' })] })
      .mockResolvedValueOnce({ docs: [snapshot('change-1', { userId: USER_ID, effectiveOn: '2026-11-01' })] })
      .mockResolvedValueOnce({ docs: [snapshot('due-1', { userId: USER_ID, cardId: 'card-1', dueOn: '2026-11-03' })] })
    firestoreMocks.getDoc.mockResolvedValue({ exists: () => false })

    const result = await loadCashoutData(USER_ID)

    expect(result).toEqual({
      cards: [{ id: 'card-1', userId: USER_ID, name: 'Card' }],
      cashouts: [{ id: 'cashout-1', userId: USER_ID, borrowedOn: '2026-10-01' }],
      payments: [{ id: 'payment-1', userId: USER_ID, paidOn: '2026-10-20' }],
      limitChanges: [{ id: 'change-1', userId: USER_ID, effectiveOn: '2026-11-01' }],
      dueDates: [{ id: 'due-1', userId: USER_ID, cardId: 'card-1', dueOn: '2026-11-03' }],
      settings: {
        salaryAmount: 0,
        salaryDay: 28,
        salaryAdjustment: 'previousWorkingDay',
        protectedMonthlyBudget: 0,
        startingCashReserve: 0,
        reminderDaysBefore: 3,
        browserNotificationsEnabled: false,
      },
    })
    expect(firestoreMocks.where).toHaveBeenCalledTimes(5)
    expect(firestoreMocks.where).toHaveBeenNthCalledWith(1, 'userId', '==', USER_ID)
    expect(firestoreMocks.where).toHaveBeenNthCalledWith(2, 'userId', '==', USER_ID)
    expect(firestoreMocks.where).toHaveBeenNthCalledWith(3, 'userId', '==', USER_ID)
    expect(firestoreMocks.where).toHaveBeenNthCalledWith(4, 'userId', '==', USER_ID)
    expect(firestoreMocks.where).toHaveBeenNthCalledWith(5, 'userId', '==', USER_ID)
    expect(firestoreMocks.getDoc).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashoutSettings', id: USER_ID },
    )
  })

  it('preserves stored settings and date-only strings when loading', async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ salaryAmount: 15000, reminderDaysBefore: 5 }),
    })

    const result = await loadCashoutData(USER_ID)

    expect(result.settings).toEqual({
      salaryAmount: 15000,
      salaryDay: 28,
      salaryAdjustment: 'previousWorkingDay',
      protectedMonthlyBudget: 0,
      startingCashReserve: 0,
      reminderDaysBefore: 5,
      browserNotificationsEnabled: false,
    })
  })

  it('keeps existing data loadable when the new Due Date collection is not deployed yet', async () => {
    firestoreMocks.getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      }))
    firestoreMocks.getDoc.mockResolvedValue({ exists: () => false })

    const result = await loadCashoutData(USER_ID)

    expect(result.dueDates).toEqual([])
    expect(result.cards).toEqual([])
  })

  it('verifies card ownership before updating it', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ userId: USER_ID }),
    })

    await updateCard(USER_ID, 'card-1', {
      monthlyBorrowLimit: 18000,
      nextBorrowDate: '2026-11-21',
    })

    expect(firestoreMocks.getDoc).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashoutCards', id: 'card-1' },
    )
    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashoutCards', id: 'card-1' },
      expect.objectContaining({
        monthlyBorrowLimit: 18000,
        nextBorrowDate: '2026-11-21',
        updatedAt: 'SERVER_TIMESTAMP',
      }),
    )
  })

  it('does not update a card owned by another user', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ userId: 'other-user' }),
    })

    await expect(updateCard(USER_ID, 'card-1', { monthlyBorrowLimit: 18000 })).rejects.toThrow(/owned|owner/i)
    expect(firestoreMocks.updateDoc).not.toHaveBeenCalled()
  })

  it('archives an owned card without deleting its history', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ userId: USER_ID }),
    })

    await archiveCard(USER_ID, 'card-1')

    expect(firestoreMocks.updateDoc).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashoutCards', id: 'card-1' },
      expect.objectContaining({ active: false, archivedAt: 'SERVER_TIMESTAMP' }),
    )
    expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled()
  })

  it('deletes an owned card only after confirming it has no cashout history', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ userId: USER_ID }),
    })
    firestoreMocks.getDocs.mockResolvedValue({ empty: true, docs: [] })

    await deleteEmptyCard(USER_ID, 'card-1')

    expect(firestoreMocks.deleteDoc).toHaveBeenCalledWith(
      { type: 'doc', collection: 'cashoutCards', id: 'card-1' },
    )
    expect(firestoreMocks.where).toHaveBeenCalledWith('userId', '==', USER_ID)
    expect(firestoreMocks.where).toHaveBeenCalledWith('cardId', '==', 'card-1')
  })

  it('refuses to delete an owned card with cashout history', async () => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ userId: USER_ID }),
    })
    firestoreMocks.getDocs.mockResolvedValue({
      empty: false,
      docs: [snapshot('cashout-1', { userId: USER_ID, cardId: 'card-1' })],
    })

    await expect(deleteEmptyCard(USER_ID, 'card-1')).rejects.toThrow(/history/i)
    expect(firestoreMocks.deleteDoc).not.toHaveBeenCalled()
  })
})
