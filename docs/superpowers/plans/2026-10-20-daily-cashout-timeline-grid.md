# Daily Cashout Timeline Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a contiguous daily cash-out timeline centered on today, with a 30-day past window, a 30-day future window, clear past/today/future cell tones, and table-like card rows.

**Architecture:** Keep date generation and zone classification in `CashoutTimeline.jsx`, using the supplied date-only `today` value as the anchor. Generate every day in the base window and extend the same contiguous daily range when event dates fall outside it. Keep synchronized axis/lane scrolling and use CSS variables for fixed daily column width.

**Tech Stack:** React 18, Vite, Vitest, date-only helpers from `src/cashout/hongKongWorkingDays.js`, existing cash-out CSS variables and Font Awesome icons.

## Global Constraints

- Use strict `YYYY-MM-DD` date-only values and UTC helpers.
- Preserve the existing synchronized horizontal scrolling and custom range navigator.
- Match the existing dark glass, blue-accent visual language.
- Do not mutate Firebase data, deploy, push, or commit changes.
- Keep native horizontal scrollbars hidden.

---

### Task 1: Specify the daily date window in tests

**Files:**
- Modify: `src/components/cashout/__tests__/cashoutViews.test.jsx`

**Interfaces:**
- Consumes: `CashoutTimeline` server-rendered markup and its `data-date` attributes.
- Produces: regression coverage for the exact 61-day window, zone classes, contiguous ordering, compact labels, and event-driven extension.

- [ ] **Step 1: Replace adaptive-scale cases with a failing fixed-window test**

```jsx
it('renders every day from 30 days before today through 30 days after today', () => {
  const markup = renderDateScale({
    timelineCard: card,
    timelineCashout: { ...cashout, expectedPaymentOn: '2026-10-20' },
    forecastDate: '2026-10-20',
    today: '2026-10-20',
  })
  const axisDates = getAxisDates(markup)

  expect(axisDates).toHaveLength(61)
  expect(axisDates[0]).toBe('2026-09-20')
  expect(axisDates[30]).toBe('2026-10-20')
  expect(axisDates[60]).toBe('2026-11-19')
  expect(markup).toContain('cashout-cycle-timeline-date past')
  expect(markup).toContain('cashout-cycle-timeline-date today')
  expect(markup).toContain('cashout-cycle-timeline-date future')
})
```

- [ ] **Step 2: Add a failing extension test for out-of-window events**

```jsx
it('extends the contiguous daily range to retain an out-of-window event', () => {
  const markup = renderDateScale({
    timelineCard: { ...card, safeBorrow: { date: '2026-12-01', reason: 'Safe to borrow from 2026-12-01.' } },
    timelineCashout: { ...cashout, expectedPaymentOn: '2026-12-01' },
    forecastDate: '2026-12-01',
    today: '2026-10-20',
  })
  const axisDates = getAxisDates(markup)

  expect(axisDates[0]).toBe('2026-09-20')
  expect(axisDates.at(-1)).toBe('2026-12-01')
  expect(axisDates).toContain('2026-11-19')
  expect(axisDates).toContain('2026-12-01')
  expect(axisDates).toHaveLength(73)
})
```

- [ ] **Step 3: Run the focused tests and confirm they fail for the missing behavior**

Run: `npx vitest run src/components/cashout/__tests__/cashoutViews.test.jsx -t "every day|contiguous daily range"`

Expected: FAIL because the existing adaptive date generator does not return a fixed 61-day daily range.

### Task 2: Implement the daily range and accessible compact labels

**Files:**
- Modify: `src/components/cashout/CashoutTimeline.jsx`

**Interfaces:**
- Consumes: `today`, forecast row dates, global event dates, and per-card event dates.
- Produces: `getTimelineDateRange(today, sourceDates)` returning `{ scale: 'daily', dates }`; every axis date and lane cell exposes `data-date` and the full date as an accessible label/title.

- [ ] **Step 1: Generate the base window and contiguous event extensions**

```js
function getTimelineDateRange(today, sourceDates) {
  const normalizedDates = [...new Set(sourceDates.filter(Boolean))].sort(compareDateOnly)
  const baseStartDate = addDateDays(today, -30)
  const baseEndDate = addDateDays(today, 30)
  const startDate = normalizedDates.length && compareDateOnly(normalizedDates[0], baseStartDate) < 0
    ? normalizedDates[0]
    : baseStartDate
  const endDate = normalizedDates.length && compareDateOnly(normalizedDates.at(-1), baseEndDate) > 0
    ? normalizedDates.at(-1)
    : baseEndDate
  const dates = []
  let currentDate = startDate

  while (compareDateOnly(currentDate, endDate) <= 0) {
    dates.push(currentDate)
    currentDate = addDateDays(currentDate, 1)
  }

  return { scale: 'daily', dates }
}
```

- [ ] **Step 2: Use compact labels while preserving the exact date for accessibility**

```jsx
<div
  className={`cashout-cycle-timeline-date ${getTimelineDateClasses(date, today)}`}
  data-date={date}
  aria-label={date}
  title={date}
>
  <span>{date === today ? 'Today' : date.slice(5).replace('-', '/')}</span>
```

Apply the same `data-date`, `aria-label`, and `title` attributes to each lane cell.

- [ ] **Step 3: Run the focused tests and confirm they pass**

Run: `npx vitest run src/components/cashout/__tests__/cashoutViews.test.jsx -t "every day|contiguous daily range"`

Expected: PASS for the fixed 61-day window and the extended daily range.

### Task 3: Style the three-zone table grid

**Files:**
- Modify: `src/styles/cashout-cycle.css`
- Modify: `src/components/cashout/__tests__/cashoutViews.test.jsx`

**Interfaces:**
- Consumes: `past`, `today`, `future`, and `weekend` classes from the timeline markup.
- Produces: compact fixed-width daily columns, persistent three-zone backgrounds, a secondary weekend marker, and touching row borders with no row padding gap.

- [ ] **Step 1: Add stylesheet assertions for grid spacing and zone styling**

```jsx
it('styles daily timeline zones as a connected table grid', () => {
  expect(timelineStyleSource).toContain('--cashout-cycle-timeline-column-width: 64px;')
  expect(timelineStyleSource).toContain('.cashout-cycle-timeline-lane-scroll {\n  padding-bottom: 0;')
  expect(timelineStyleSource).toContain('.cashout-cycle-timeline-cell.past')
  expect(timelineStyleSource).toContain('.cashout-cycle-timeline-cell.today')
  expect(timelineStyleSource).toContain('.cashout-cycle-timeline-cell.future')
  expect(timelineStyleSource).toContain('.cashout-cycle-timeline-cell.weekend::after')
})
```

- [ ] **Step 2: Set the fixed daily column width and remove row gaps**

Use `--cashout-cycle-timeline-column-width: 64px`, compute the timeline width from the number of dates, set the date/cell grid tracks to that minimum width, remove lane scroll bottom padding, and add matching bottom borders to lane labels.

- [ ] **Step 3: Give past, today, and future cells distinct but restrained fills**

Use muted charcoal-blue for `.past`, the existing blue accent for `.today`, and a low-saturation green for `.future`. Preserve weekend identity with a thin amber top marker rather than replacing the zone background.

- [ ] **Step 4: Run the focused view suite**

Run: `npx vitest run src/components/cashout/__tests__/cashoutViews.test.jsx`

Expected: all Cashout Cycle view tests pass.

### Task 4: Verify the repository and live rendering

**Files:**
- No additional source files.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: all test files and tests pass.

- [ ] **Step 2: Build the production bundle**

Run: `npm run build`

Expected: build succeeds; report the existing large-chunk warning if it remains.

- [ ] **Step 3: Check diagnostics and diff hygiene**

Run diagnostics for `CashoutTimeline.jsx`, `cashout-cycle.css`, and `cashoutViews.test.jsx`, then run `git diff --check`.

- [ ] **Step 4: Confirm the live timeline**

Inspect the shared Cashout Cycle page and verify 61 daily axis cells around today, distinct past/today/future fills, and no visible vertical gaps between card rows.
