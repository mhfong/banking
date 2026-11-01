import { describe, expect, it } from 'vitest'
import { validateCardValues } from '../../components/cashout/CashoutCardForm.jsx'
import { validateCashoutValues } from '../../components/cashout/CashoutForm.jsx'

const card = {
  id: 'card-1',
  name: 'Primary card',
  totalCreditLimit: 5000,
  monthlyBorrowLimit: 1000,
  nextStatementDate: '2026-10-15',
  active: true,
}

describe('cashout form validation', () => {
  it('requires the next statement date for every card', () => {
    const error = validateCardValues({
      name: 'Primary card',
      totalCreditLimit: '5000',
      monthlyBorrowLimit: '1000',
      nextStatementDate: '',
      nextBorrowDate: '2026-11-20',
      usedAmount: '',
      usedBorrowedOn: '2026-10-19',
      usedStatementDate: '',
      usedExpectedPaymentOn: '2026-11-05',
    })

    expect(error).toMatch(/next statement date/i)
  })

  it('requires an opening statement date when a card has an existing balance', () => {
    const error = validateCardValues({
      name: 'Primary card',
      totalCreditLimit: '5000',
      monthlyBorrowLimit: '1000',
      nextStatementDate: '2026-10-20',
      nextBorrowDate: '2026-11-20',
      usedAmount: '500',
      usedBorrowedOn: '2026-10-19',
      usedStatementDate: '',
      usedExpectedPaymentOn: '2026-11-05',
    })

    expect(error).toMatch(/statement date/i)
  })

  it('rejects an amount above the calculated maximum new borrow', () => {
    const error = validateCashoutValues({
      values: {
        cardId: 'card-1',
        amount: '1001',
        borrowedOn: '2026-10-19',
        statementDate: '2026-10-20',
        expectedPaymentOn: '2026-11-05',
        expectedPaymentAmount: '1001',
      },
      cards: [card],
      cashouts: [],
      payments: [],
      limitChanges: [],
      today: '2026-10-19',
    })

    expect(error).toMatch(/maximum|monthly room|available credit/i)
  })

  it('requires a statement date for every new cashout', () => {
    const error = validateCashoutValues({
      values: {
        cardId: 'card-1',
        amount: '500',
        borrowedOn: '2026-10-19',
        statementDate: '',
        expectedPaymentOn: '2026-11-05',
        expectedPaymentAmount: '500',
      },
      cards: [card],
      cashouts: [],
      payments: [],
      limitChanges: [],
      today: '2026-10-19',
    })

    expect(error).toMatch(/statement date/i)
  })

  it('rejects a statement date before the borrow date', () => {
    const error = validateCashoutValues({
      values: {
        cardId: 'card-1',
        amount: '500',
        borrowedOn: '2026-10-19',
        statementDate: '2026-10-18',
        expectedPaymentOn: '2026-11-05',
        expectedPaymentAmount: '500',
      },
      cards: [card],
      cashouts: [],
      payments: [],
      limitChanges: [],
      today: '2026-10-19',
    })

    expect(error).toMatch(/statement date.*borrow date/i)
  })

  it('requires a next borrow date for every card', () => {
    const error = validateCardValues({
      name: 'Primary card',
      totalCreditLimit: '5000',
      monthlyBorrowLimit: '1000',
      nextStatementDate: '2026-10-20',
      nextBorrowDate: '',
      usedAmount: '',
      usedBorrowedOn: '2026-10-19',
      usedStatementDate: '',
      usedExpectedPaymentOn: '2026-11-05',
    })

    expect(error).toMatch(/next borrow date/i)
  })

  it('rejects an invalid next borrow date', () => {
    const error = validateCardValues({
      name: 'Primary card',
      totalCreditLimit: '5000',
      monthlyBorrowLimit: '1000',
      nextStatementDate: '2026-10-20',
      nextBorrowDate: 'not-a-date',
      usedAmount: '',
      usedBorrowedOn: '2026-10-19',
      usedStatementDate: '',
      usedExpectedPaymentOn: '2026-11-05',
    })

    expect(error).toMatch(/next borrow date/i)
  })

  it('rejects an invalid monthly due date when one is entered', () => {
    const error = validateCardValues({
      name: 'Primary card',
      totalCreditLimit: '5000',
      monthlyBorrowLimit: '1000',
      nextStatementDate: '2026-10-20',
      nextBorrowDate: '2026-11-20',
      dueDate: 'not-a-date',
      usedAmount: '',
      usedBorrowedOn: '2026-10-19',
      usedStatementDate: '',
      usedExpectedPaymentOn: '2026-11-05',
    })

    expect(error).toBeTruthy()
    expect(error).toMatch(/due date/i)
  })
})