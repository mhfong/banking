import { describe, expect, it } from 'vitest'
import { getDueDatePrompts, getMonthlyDueDate } from '../dueDates.js'

const card = { id: 'card-1', name: 'Primary card', active: true }

describe('due date rules', () => {
  it('suggests the next due date two days after the latest due date', () => {
    const result = getDueDatePrompts({
      cards: [card],
      cashouts: [{ id: 'cashout-1', cardId: 'card-1', expectedPaymentOn: '2026-11-01' }],
      dueDates: [],
      today: '2026-11-01',
    })

    expect(result).toEqual([{
      cardId: 'card-1',
      cardName: 'Primary card',
      currentDueOn: '2026-11-01',
      suggestedDueOn: '2026-11-03',
    }])
  })

  it('does not prompt while a future manual due date exists', () => {
    const result = getDueDatePrompts({
      cards: [card],
      cashouts: [{ id: 'cashout-1', cardId: 'card-1', expectedPaymentOn: '2026-11-01' }],
      dueDates: [{ id: 'due-1', cardId: 'card-1', dueOn: '2026-11-03' }],
      today: '2026-11-01',
    })

    expect(result).toEqual([])
  })

  it('prefers the manual date for the selected month in the card editor', () => {
    const result = getMonthlyDueDate({
      cardId: 'card-1',
      month: '2026-11',
      cashouts: [{ id: 'cashout-1', cardId: 'card-1', expectedPaymentOn: '2026-11-01' }],
      dueDates: [{ id: 'due-1', cardId: 'card-1', dueOn: '2026-11-03' }],
    })

    expect(result).toEqual({ id: 'due-1', dueOn: '2026-11-03' })
  })

  it('returns no prompt or editor date when a card has no due date', () => {
    expect(getDueDatePrompts({ cards: [card], cashouts: [], dueDates: [], today: '2026-11-01' })).toEqual([])
    expect(getMonthlyDueDate({
      cardId: 'card-1',
      month: '2026-11',
      cashouts: [],
      dueDates: [],
    })).toEqual({ id: null, dueOn: '' })
  })
})
