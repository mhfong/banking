# Cashout Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cashout Cycle timeline lanes with a responsive shared month calendar that marks only Borrow, Due, and Payment dates for each card.

**Architecture:** Keep `CashoutTimeline.jsx` as the compatibility component name, but replace its timeline implementation with a pure calendar renderer. The component derives three marker types from persisted cashout/payment dates, keeps month navigation local to presentation state, and renders a single seven-column grid. `CashoutCycle.jsx` passes only cards, cashouts, payments, and today; all forecast, summary, preview, and payment-action inputs disappear from this view.

**Tech Stack:** React 18, JSX, Vitest, Vite, existing date-only helpers from `src/cashout/hongKongWorkingDays.js`, existing Cashout Cycle CSS variables and Font Awesome icons.

## Global Constraints

- Use `YYYY-MM-DD` date-only values and UTC date helpers; do not infer dates from forecasts or statement dates.
- Render only Borrow Date, Due Date, and Payment Date markers.
- Preserve archived card history in the shared calendar when matching records exist.
- Match the existing dark Cashout Cycle theme and use CSS variables already defined by the app.
- Keep seven readable calendar columns; on narrow screens use a horizontal calendar surface with stable cell sizing.
- Do not mutate Firestore data, change calculation logic, deploy, push, or commit changes.

---

### Task 1: Replace timeline behavior tests with calendar behavior tests

**Files:**
- Modify: `src/components/cashout/__tests__/cashoutViews.test.jsx`

**Interfaces:**
- Consumes: `CashoutTimeline` server-rendered markup and `cashout-cycle.css` source.
- Produces: regression coverage for the shared month grid, persisted date markers, card identity, navigation controls, removed timeline behavior, and responsive calendar CSS.

- [ ] **Step 1: Remove timeline-only imports and helpers**

Remove `getTimelinePreviewPosition` from the `CashoutTimeline` import, remove the `getAxisDates` helper, and remove `renderDateScale`. Keep the existing shared fixtures and unrelated forecast, status, capacity, reminder, and page-order tests.

- [ ] **Step 2: Write the failing calendar tests**

Add these assertions to the existing `Cashout Cycle views` suite:

```jsx
it('renders a shared month calendar around today', () => {
  const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
    cards: [card],
    cashouts: [cashout],
    payments: [],
    today: '2026-11-01',
  }))

  expect(markup).toContain('cashout-cycle-calendar-grid')
  expect(markup).toContain('data-month="2026-11"')
  expect(markup).toContain('November 2026')
  expect(markup.match(/class="cashout-cycle-calendar-day/g)).toHaveLength(42)
  expect(markup).toContain('Monday')
  expect(markup).toContain('Sunday')
  expect(markup).toContain('cashout-cycle-calendar-day-today')
})

it('marks only borrow, due, and payment dates for their cards', () => {
  const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
    cards: [card],
    cashouts: [cashout],
    payments: [{ id: 'payment-1', cashoutId: 'cashout-1', amount: 1000, paidOn: '2026-10-12' }],
    forecast,
    summary: { outstanding: 5000 },
    today: '2026-11-01',
    onSelectCashout: vi.fn(),
  }))

  expect(markup).toContain('Primary card Borrow Date on 2026-10-01')
  expect(markup).toContain('Primary card Due Date on 2026-10-20')
  expect(markup).toContain('Primary card Payment Date on 2026-10-12')
  expect(markup).toContain('>B</span>')
  expect(markup).toContain('>D</span>')
  expect(markup).toContain('>P</span>')
  expect(markup).not.toContain('Salary')
  expect(markup).not.toContain('Safe date')
  expect(markup).not.toContain('Failure')
  expect(markup).not.toContain('Record payment')
  expect(markup).not.toContain('cashout-cycle-timeline-lane')
})

it('keeps card identity when multiple cards share a calendar date', () => {
  const secondaryCard = { ...card, id: 'card-2', name: 'Secondary card' }
  const secondaryCashout = { ...cashout, id: 'cashout-2', cardId: 'card-2', borrowedOn: '2026-10-01' }
  const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
    cards: [card, secondaryCard],
    cashouts: [cashout, secondaryCashout],
    payments: [],
    today: '2026-11-01',
  }))

  expect(markup).toContain('Primary card Borrow Date on 2026-10-01')
  expect(markup).toContain('Secondary card Borrow Date on 2026-10-01')
  expect(markup).toContain('data-card-id="card-1"')
  expect(markup).toContain('data-card-id="card-2"')
})

it('renders accessible month navigation controls', () => {
  const markup = renderToStaticMarkup(createElement(CashoutTimeline, {
    cards: [card],
    cashouts: [],
    payments: [],
    today: '2026-11-01',
  }))

  expect(markup).toContain('aria-label="Previous month"')
  expect(markup).toContain('aria-label="Next month"')
  expect(markup).toContain('aria-label="Return calendar to today"')
})

it('styles the calendar as a flexible seven-column surface', () => {
  expect(timelineStyleSource).toContain('.cashout-cycle-calendar-grid')
  expect(timelineStyleSource).toContain('grid-template-columns: repeat(7, minmax(0, 1fr));')
  expect(timelineStyleSource).toContain('min-width: 728px;')
  expect(timelineStyleSource).toContain('.cashout-cycle-calendar-marker')
  expect(timelineStyleSource).toContain('@media (prefers-reduced-motion: reduce)')
})

it('does not retain timeline interaction and forecast props', () => {
  expect(timelineSource).not.toContain('getTimelinePreviewPosition')
  expect(timelineSource).not.toContain('onSelectCashout')
  expect(timelineSource).not.toContain('forecast')
  expect(timelineSource).not.toContain('summary')
  expect(timelineSource).not.toContain('timelineDragRef')
  expect(cashoutCycleSource).not.toContain('timelineCards')
  expect(cashoutCycleSource).not.toContain('onSelectCashout={cashoutId => openModal')
})
```

Replace old tests whose behavior is intentionally removed: adaptive daily range, compact timeline labels, reachable payment action, timeline zone button, future-limit timeline marker, scroll synchronization, pointer dragging, hidden timeline scrollbars, daily zone grid, preview positioning, dynamic preview layer, preview dismissal, timeline animation, preview repositioning, global cash-buffer failure, forecast obligation amounts, and future-dated due-balance calculations. Retain the unrelated `CashflowForecast`, reminders, status, capacity, and page-order tests.

- [ ] **Step 3: Run the focused suite and verify the new tests fail**

Run:

```bash
npm test -- src/components/cashout/__tests__/cashoutViews.test.jsx
```

Expected: the existing timeline implementation fails because it has no month grid or date-marker-only output.

---

### Task 2: Implement the presentation-only shared calendar

**Files:**
- Modify: `src/components/cashout/CashoutTimeline.jsx`

**Interfaces:**
- Consumes: `{ cards = [], cashouts = [], payments = [], today }`.
- Produces: a shared month grid with `data-month`, date cells, accessible Borrow/Due/Payment markers, and local month navigation.

- [ ] **Step 1: Replace the old event and preview implementation**

Remove forecast event metadata, amount calculations, global events, timeline range generation, preview positioning, event marker buttons, scroll refs, pointer-drag handlers, synchronized lane handlers, summary metrics, legends, and empty-event logic.

- [ ] **Step 2: Add UTC month-grid helpers**

Use the existing date-only helpers and keep the calendar Monday-first:

```jsx
function getMonthGridDates(monthStart) {
  const monthDate = parseDateOnly(monthStart)
  const mondayOffset = (monthDate.getUTCDay() + 6) % 7
  const daysInMonth = getDaysInMonth(monthDate.getUTCFullYear(), monthDate.getUTCMonth())
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  const firstGridDate = addDateDays(monthStart, -mondayOffset)

  return Array.from({ length: cellCount }, (_, index) => addDateDays(firstGridDate, index))
}
```

Use `getMonthStart` and `getNextMonthStart` for navigation. Derive the previous month start by subtracting one day from the current month start before calling `getMonthStart`.

- [ ] **Step 3: Derive only persisted date markers**

Create marker records with `{ id, date, type, cardId, cardName }`:

```jsx
function getCalendarMarkers(cards, cashouts, payments) {
  const cardsById = new Map(cards.map(card => [card.id, card]))
  const cashoutsById = new Map(cashouts.map(cashout => [cashout.id, cashout]))
  const markers = []

  cashouts.forEach(cashout => {
    const card = cardsById.get(cashout.cardId)
    if (!card) return
    if (cashout.borrowedOn) markers.push({ id: `borrow-${cashout.id}`, date: cashout.borrowedOn, type: 'borrow', cardId: card.id, cardName: card.name || 'Unnamed card' })
    if (cashout.expectedPaymentOn) markers.push({ id: `due-${cashout.id}`, date: cashout.expectedPaymentOn, type: 'due', cardId: card.id, cardName: card.name || 'Unnamed card' })
  })

  payments.forEach(payment => {
    const cashout = cashoutsById.get(payment.cashoutId)
    const card = cashout ? cardsById.get(cashout.cardId) : null
    if (card && payment.paidOn) markers.push({ id: `payment-${payment.id ?? payment.cashoutId}-${payment.paidOn}`, date: payment.paidOn, type: 'payment', cardId: card.id, cardName: card.name || 'Unnamed card' })
  })

  return markers
}
```

Group markers by date and assign each card a deterministic class from its array index. Do not include amounts, forecast rows, capacity state, safe-borrow dates, limit changes, failures, or payment callbacks.

- [ ] **Step 4: Render controls, headers, cells, and markers**

Render the requested date types as a compact key and use `<span role="img">` marker labels such as `Primary card Borrow Date on 2026-10-01`. Use `aria-label`, `title`, `data-date`, and `data-card-id` attributes so dates remain inspectable without event interactions.

The day grid should follow this shape:

```jsx
<div className="cashout-cycle-calendar" data-month={monthStart.slice(0, 7)}>
  <div className="cashout-cycle-calendar-toolbar">
    <div className="cashout-cycle-calendar-month">
      <span>Cashout dates</span>
      <strong>{monthLabel}</strong>
    </div>
    <div className="cashout-cycle-calendar-controls">
      <button type="button" aria-label="Previous month" onClick={goToPreviousMonth}>
        <i className="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <button type="button" aria-label="Return calendar to today" onClick={goToToday}>
        Today
      </button>
      <button type="button" aria-label="Next month" onClick={goToNextMonth}>
        <i className="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>
  <div className="cashout-cycle-calendar-key">
    <span><strong>B</strong> Borrow Date</span>
    <span><strong>D</strong> Due Date</span>
    <span><strong>P</strong> Payment Date</span>
  </div>
  <div className="cashout-cycle-calendar-scroll">
    <div className="cashout-cycle-calendar-grid" role="grid" aria-label={`${monthLabel} cashout dates`}>
      {weekdayLabels.map(label => <div role="columnheader" key={label}>{label}</div>)}
      {monthDates.map(date => (
        <div className="cashout-cycle-calendar-day" role="gridcell" data-date={date} key={date}>
          <time dateTime={date}>{Number(date.slice(8))}</time>
          <div className="cashout-cycle-calendar-day-markers">
            {(markersByDate.get(date) ?? []).map(marker => <CalendarMarker marker={marker} key={marker.id} />)}
          </div>
        </div>
      ))}
    </div>
  </div>
</div>
```

Use `type="button"` for previous, next, and Today controls. Month changes must update only local state; Today restores the month containing the supplied `today` value.

- [ ] **Step 5: Run the focused suite and verify it passes**

Run:

```bash
npm test -- src/components/cashout/__tests__/cashoutViews.test.jsx
```

Expected: the updated calendar tests and the retained Cashout Cycle view tests pass.

---

### Task 3: Wire the page to the calendar and replace timeline styles

**Files:**
- Modify: `src/pages/CashoutCycle.jsx`
- Modify: `src/styles/cashout-cycle.css`

**Interfaces:**
- Consumes: the new `CashoutTimeline` input contract.
- Produces: page-level calendar copy and responsive, theme-consistent styling with no obsolete timeline classes in rendered markup.

- [ ] **Step 1: Simplify page-level calendar props and copy**

Remove the `timelineCards` memo because the calendar receives the full `cards` collection. Replace the panel heading and icon, remove the right-aligned date range, and pass only the new inputs:

```jsx
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
  <CashoutTimeline cards={cards} cashouts={cashouts} payments={payments} today={today} />
</section>
```

- [ ] **Step 2: Replace obsolete timeline CSS with calendar CSS**

Remove timeline summary, legends, 61-day lane grid, event markers, preview layer, drag cursor, and synchronized-scroll selectors. Add CSS for the toolbar, three-item date key, horizontally scrollable calendar surface, seven-column grid, stable day cells, muted outside-month cells, Today accent, deterministic card accent classes, type badges, ellipsis-safe card names, and reduced-motion behavior.

The calendar grid must include `grid-template-columns: repeat(7, minmax(0, 1fr));` and `min-width: 728px;`. The narrow-screen rule must preserve this readable inner surface while allowing the viewport to scroll horizontally.

- [ ] **Step 3: Run focused tests and diagnostics**

Run:

```bash
npm test -- src/components/cashout/__tests__/cashoutViews.test.jsx
```

Then run diagnostics for `src/components/cashout/CashoutTimeline.jsx`, `src/pages/CashoutCycle.jsx`, `src/styles/cashout-cycle.css`, and `src/components/cashout/__tests__/cashoutViews.test.jsx`.

Expected: focused tests pass and diagnostics report no errors.

---

### Task 4: Verify the full local change

**Files:**
- No additional source files.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test -- --reporter=dot
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Build the production bundle**

Run:

```bash
npm run build
```

Expected: the Vite production build exits successfully; an existing chunk-size warning may remain.

- [ ] **Step 3: Check diff hygiene**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 4: Verify the live browser view**

On the existing Cashout Cycle page, confirm the rendered calendar shows a month grid, weekday headers, only Borrow/Due/Payment markers, visible card identity, and readable horizontal behavior at narrow viewport widths. Confirm no old timeline lanes, event preview, capacity summary, or payment action appears.