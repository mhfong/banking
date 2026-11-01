# Cashout Cycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Cashout Cycle page that tracks card cashouts and payments, separates total credit from monthly borrowing capacity, forecasts salary-funded repayment safety, and warns when bank limit changes can make the loop fail.

**Architecture:** Keep all date, capacity, recommendation, and cash-flow calculations in pure JavaScript modules under `src/cashout/`. Put all Firestore reads and writes behind `cashoutRepository.js`, with explicit `userId` ownership in every collection. Compose a route-level React page from focused summary, status, card, timeline, forecast, and form components; components render derived results and do not reimplement financial rules.

**Tech Stack:** React 18.3.1, Vite 5.4.21, React Router DOM 6.28.0, Firebase 10.14.0, `date-fns` 3.6.0, existing Font Awesome icons, and Vitest for pure calculation tests.

## Global Constraints

- Use the existing `HashRouter`, `AuthContext`, `db`, dashboard palette, and responsive layout conventions.
- Keep Cashout Cycle data separate from the existing `transactions` collection and Transactions page.
- Interpret date-only values in `Asia/Hong_Kong`; store them as `YYYY-MM-DD` strings.
- Keep total credit limit, available credit, monthly borrowing limit, and monthly borrowing room as separate values.
- Future cashout proceeds are contingent and must not be treated as repayment income unless the user explicitly enters a planned borrowing scenario.
- Salary is scheduled on the 28th and rolls backward over weekends and Hong Kong public holidays.
- Cards with history are archived rather than deleted; only cards without cashout history can be deleted.
- Browser notifications are optional and app-open only; no background notification service is added.
- Preserve unrelated existing changes, including `src/styles/dashboard.css`.
- Do not deploy, push, or mutate production data while implementing or verifying locally.

---

## File Map

Create these focused modules and components:

- `src/cashout/hongKongWorkingDays.js` - holiday data lookup and previous-working-day helpers.
- `src/cashout/cashoutCalculations.js` - pure card capacity, safe-date, summary, forecast, and loop-status functions.
- `src/cashout/cashoutRepository.js` - authenticated Firestore reads and writes for Cashout Cycle collections.
- `src/cashout/reminders.js` - payment reminder selection and browser-notification helpers.
- `src/cashout/__tests__/hongKongWorkingDays.test.js` - working-day and reminder-date tests.
- `src/cashout/__tests__/cashoutCalculations.test.js` - capacity, forecast, recommendation, and status tests.
- `src/cashout/__tests__/cashoutRepository.test.js` - repository validation tests using mocked Firestore functions.
- `src/components/cashout/CashoutStatusBanner.jsx` - Safe/At risk/Will fail status presentation.
- `src/components/cashout/CashoutSummary.jsx` - aggregate loop metrics and best-next-borrow panel.
- `src/components/cashout/CardCapacityGrid.jsx` - per-card capacity and monthly-room display.
- `src/components/cashout/CashoutTimeline.jsx` - horizontally scrollable lanes and event details.
- `src/components/cashout/CashflowForecast.jsx` - salary, protected budget, payment, and projected-cash view.
- `src/components/cashout/CashoutCardForm.jsx` - add/edit/archive card flow, including opening cashout.
- `src/components/cashout/CashoutForm.jsx` - new cashout form and eligibility validation.
- `src/components/cashout/CashoutPaymentForm.jsx` - payment form for one cashout.
- `src/components/cashout/CashflowSettingsForm.jsx` - salary, protected budget, reserve, and notification settings.
- `src/components/cashout/LimitChangeForm.jsx` - effective-dated bank monthly-limit changes.
- `src/pages/CashoutCycle.jsx` - page state, data loading, modals, and component composition.
- `src/styles/cashout-cycle.css` - feature-specific responsive styles.

Modify these existing files:

- `package.json` - add Vitest and the `test` script.
- `src/App.jsx` - register the private `/cashout-cycle` route.
- `src/components/Layout.jsx` - add Cashout Cycle navigation.
- `src/styles/layout.css` - make the additional mobile navigation item fit without overlap.
- `firestore.rules` - add user-only rules for all Cashout Cycle collections.

---

### Task 1: Add the Pure Date, Capacity, and Forecast Engine

**Files:**
- Create: `src/cashout/hongKongWorkingDays.js`
- Create: `src/cashout/cashoutCalculations.js`
- Create: `src/cashout/__tests__/hongKongWorkingDays.test.js`
- Create: `src/cashout/__tests__/cashoutCalculations.test.js`
- Modify: `package.json`

**Interfaces:**

- `getHongKongHolidayCalendar(years)` returns `{ holidaySet: Set<string>, missingYears: number[] }` so the UI can warn instead of silently assuming an unsupported year has no holidays.
- `isWorkingDay(dateString, holidaySet)` returns `boolean`.
- `moveToPreviousWorkingDay(dateString, holidaySet)` returns a `YYYY-MM-DD` string.
- `getSalaryDate(year, monthIndex, settings, holidaySet)` returns the adjusted salary date.
- `getReminderDate(expectedPaymentOn, daysBefore, holidaySet)` returns the reminder date after calendar subtraction and backward working-day adjustment.
- `calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf })` returns `{ outstanding, availableCredit, borrowedThisCycle, effectiveMonthlyBorrowLimit, monthlyRoom, maxNewBorrow, previousCashout, status }`.
- `getSafeBorrowDate({ asOf, card, cashouts, payments, limitChanges })` returns `{ date, reason }` or `{ date: null, reason }` when no safe date is available.
- `calculateLoopSummary({ cards, cashouts, payments, limitChanges, settings, today })` returns gross borrowed, paid back, outstanding, available credit, monthly room, due-soon total, and best next borrow.
- `buildCashflowForecast({ cashouts, payments, settings, limitChanges, cards, today, horizonMonths })` returns ordered dated rows with salary, reserved budget, planned payments, contingent borrowing, projected cash, and risk metadata.
- `getLoopStatus(forecast, limitChanges)` returns `{ state: 'safe' | 'at-risk' | 'will-fail', title, message, firstFailure, shortfall }`.

- [ ] **Step 1: Add the Vitest test script and write failing date tests.**

Add the development dependency and script:

```json
{
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

Write tests for a normal 28th salary date, a Saturday/Sunday salary date, a public-holiday salary date, and a payment reminder that rolls backward after subtracting three calendar days.

- [ ] **Step 2: Run the focused date tests and confirm they fail for missing modules.**

Run:

```bash
npm install
npx vitest run src/cashout/__tests__/hongKongWorkingDays.test.js
```

Expected: FAIL because the date modules do not exist yet.

- [ ] **Step 3: Implement the working-day module.**

Use a checked-in holiday table for the supported years, return `missingYears` from `getHongKongHolidayCalendar`, skip weekends and holidays in `moveToPreviousWorkingDay`, and keep all calculations date-only. Do not use the local machine timezone to compare dates.

- [ ] **Step 4: Run the focused date tests and confirm they pass.**

Run:

```bash
npx vitest run src/cashout/__tests__/hongKongWorkingDays.test.js
```

Expected: PASS for weekend, holiday, salary, and reminder cases.

- [ ] **Step 5: Write failing capacity and forecast tests.**

Cover these exact cases:

```js
it('separates available credit from remaining monthly room after a partial payment', () => {
  const result = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf: '2026-10-19' })
  expect(result.availableCredit).toBe(12500)
  expect(result.monthlyRoom).toBe(8000)
  expect(result.maxNewBorrow).toBe(8000)
})

it('applies an announced lower limit on its effective date', () => {
  const result = calculateCardCapacity({ card, cashouts, payments, limitChanges, asOf: '2026-11-01' })
  expect(result.effectiveMonthlyBorrowLimit).toBe(8000)
})

it('reports the first payment date and shortfall when salary arrives too late', () => {
  const result = buildCashflowForecast({ cashouts, payments, settings, cards, today: '2026-10-19', horizonMonths: 2 })
  expect(result.firstFailure.date).toBe('2026-11-05')
  expect(result.firstFailure.shortfall).toBe(10000)
})
```

Also test gross borrowed versus paid versus outstanding, monthly-room reset on the first, safe-date maximum selection, exact payment restoration, and the Safe/At risk/Will fail transitions.

- [ ] **Step 6: Run the focused calculation tests and confirm they fail.**

Run:

```bash
npx vitest run src/cashout/__tests__/cashoutCalculations.test.js
```

Expected: FAIL because the calculation exports do not exist yet.

- [ ] **Step 7: Implement the minimum pure calculation modules.**

Use `date-fns` only with parsed date-only values. Calculate outstanding balances from cashout amounts minus payment sums. Count gross cashout amounts against the borrowing cycle in which they were borrowed, even after payment. Resolve the latest effective limit change, cap new borrowing with `min(availableCredit, monthlyRoom)`, and choose the safe date using the approved maximum formula.

Build the forecast by applying salary inflow and protected-budget reservation on the adjusted salary date, then subtracting planned payment obligations. Keep future cashout proceeds in a separate contingent field. Classify an unconfirmed/contingent dependency as `at-risk`; classify a negative projected balance or insufficient effective future limit as `will-fail`.

- [ ] **Step 8: Run all pure calculation tests.**

Run:

```bash
npx vitest run src/cashout/__tests__/hongKongWorkingDays.test.js src/cashout/__tests__/cashoutCalculations.test.js
```

Expected: PASS.

---

### Task 2: Add the Firestore Repository and Ownership Rules

**Files:**
- Create: `src/cashout/cashoutRepository.js`
- Create: `src/cashout/__tests__/cashoutRepository.test.js`
- Modify: `firestore.rules`

**Interfaces:**

- `loadCashoutData(userId)` returns `{ cards, cashouts, payments, limitChanges, settings }`.
- `saveCashoutSettings(userId, settings)` writes `cashoutSettings/{uid}` with `merge: true`.
- `createCardWithOpeningCashout(userId, card, openingCashout)` uses one `writeBatch`; omit the opening cashout when its amount is zero.
- `updateCard(userId, cardId, patch)` verifies the owner in the caller and updates the card.
- `archiveCard(userId, cardId)` sets `active: false` and `archivedAt` without deleting history.
- `deleteEmptyCard(userId, cardId)` deletes only a card with no cashout history after the caller has verified the condition.
- `createCashout(userId, cashout)`, `createPayment(userId, payment)`, and `saveLimitChange(userId, change)` write their dedicated collections with `userId` attached.

- [ ] **Step 1: Write repository tests for ownership fields and validation.**

Mock the Firebase modular functions used by the repository. Assert that every create payload includes the authenticated `userId`, settings use the UID document path, opening card/cashout writes use one batch, and negative or missing required values are rejected before Firestore is called.

- [ ] **Step 2: Run the repository tests and confirm they fail.**

Run:

```bash
npx vitest run src/cashout/__tests__/cashoutRepository.test.js
```

Expected: FAIL because the repository module does not exist yet.

- [ ] **Step 3: Implement repository reads and writes.**

Query each top-level collection with `where('userId', '==', userId)`, read `cashoutSettings/{uid}` with `getDoc`, normalize missing settings to explicit defaults, and return plain objects with document IDs. Use `writeBatch` for card plus opening cashout. Keep Firestore timestamps only for audit fields and convert date-only fields without timezone conversion.

- [ ] **Step 4: Add explicit Firestore rules.**

Add matches for `cashoutCards`, `cashouts`, `cashoutPayments`, `cashoutLimitChanges`, and `cashoutSettings`. Require authentication, require incoming `userId == request.auth.uid` on create, require stored ownership on read/update/delete, and require an immutable `userId` on update. Validate non-negative numeric fields in `request.resource.data`. Leave the existing transaction and investment rules unchanged.

- [ ] **Step 5: Run repository tests and inspect the rules diff.**

Run:

```bash
npx vitest run src/cashout/__tests__/cashoutRepository.test.js
 git diff --check -- firestore.rules
```

Expected: PASS and no whitespace errors. Do not deploy or run mutating Firestore commands.

---

### Task 3: Register the Route and Page Data Shell

**Files:**
- Create: `src/pages/CashoutCycle.jsx`
- Create: `src/styles/cashout-cycle.css`
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`
- Modify: `src/styles/layout.css`

**Interfaces:**

`CashoutCycle` owns `{ data, settings, loading, error, modal, selectedCashoutId }`, calls `loadCashoutData(user.uid)`, derives the view model with `calculateLoopSummary` and `buildCashflowForecast`, and passes callbacks/data to child components. It must render loading, retryable error, empty state, and populated state.

- [ ] **Step 1: Add a route and navigation test checklist before implementation.**

The route must be private at `/cashout-cycle`, redirect unauthenticated users through the existing `PrivateRoute`, and preserve the existing public routes. The sidebar item must use the existing `nav-item` pattern and remain visible in both desktop and mobile navigation.

- [ ] **Step 2: Register the route and nav item.**

Import `CashoutCycle` in `App.jsx`, add `<Route path="/cashout-cycle" element={<PrivateRoute><Layout><CashoutCycle /></Layout></PrivateRoute>} />`, and add a `NavLink` with a sync/cycle icon and the label `Cashout Cycle` in `Layout.jsx`. Adjust only the mobile nav spacing needed for the additional item.

- [ ] **Step 3: Build the page data shell.**

Load the authenticated user's dedicated collections through the repository. Re-fetch after successful mutations. Keep form values on errors, show an inline retry action for initial-load failures, and avoid reading `transactions`. Import `cashout-cycle.css` from the page.

- [ ] **Step 4: Run the build and inspect route compilation.**

Run:

```bash
npm run build
```

Expected: PASS with the new route and page shell compiled.

---

### Task 4: Implement Card, Cashout, Payment, Settings, and Limit Forms

**Files:**
- Create: `src/components/cashout/CashoutCardForm.jsx`
- Create: `src/components/cashout/CashoutForm.jsx`
- Create: `src/components/cashout/CashoutPaymentForm.jsx`
- Create: `src/components/cashout/CashflowSettingsForm.jsx`
- Create: `src/components/cashout/LimitChangeForm.jsx`
- Modify: `src/pages/CashoutCycle.jsx`

**Interfaces:**

Each form receives the relevant derived data, a repository mutation callback, `onSuccess`, and `onCancel`. Form validation must happen before the repository call and must use the pure calculation functions for capacity/date checks.

- [x] **Step 1: Build the card form.**

Collect card name, issuer, total credit limit, monthly borrowing limit, next statement date, next borrow date, and optional existing used amount with its borrow, statement, and payment dates. Reject negative values, invalid dates, statement dates before borrow dates, and existing used amounts above the total limit. Submit a card and opening cashout as one batch. Show archive for cards with history and delete only for cards with no history.

- [ ] **Step 2: Build the cashout form.**

Select an active card, show both available credit and monthly room, accept amount, borrow date, exact statement date, due date, and expected payment amount, and reject amounts above `maxNewBorrow`. Prefill the statement date from the selected card and reject one before the borrow date. Block a borrow before the safe date with the exact blocking reason. Do not allow a second overlapping cashout while the previous one is unpaid.

- [ ] **Step 3: Build the payment form.**

Open it for one cashout, display its original amount, paid amount, and remaining balance, and reject zero/negative payments or values above the remaining balance. On success, refresh derived capacity so the paid amount restores available credit immediately.

- [ ] **Step 4: Build salary/budget settings and bank-limit change forms.**

Persist net salary, protected monthly budget, starting cash reserve, reminder days, and browser-notification preference. Persist a new monthly borrowing limit with an effective date and optional note. Reject conflicting duplicate effective dates for the same card and negative values.

- [ ] **Step 5: Run the calculation tests and build after wiring forms.**

Run:

```bash
npm test
npm run build
```

Expected: all pure tests pass and the form components compile without new diagnostics.

---

### Task 5: Build the Summary, Status, Capacity, Timeline, and Forecast Views

**Files:**
- Create: `src/components/cashout/CashoutStatusBanner.jsx`
- Create: `src/components/cashout/CashoutSummary.jsx`
- Create: `src/components/cashout/CardCapacityGrid.jsx`
- Create: `src/components/cashout/CashoutTimeline.jsx`
- Create: `src/components/cashout/CashflowForecast.jsx`
- Modify: `src/pages/CashoutCycle.jsx`
- Modify: `src/styles/cashout-cycle.css`

**Interfaces:**

- `CashoutStatusBanner({ status, onReview })` renders Safe, At risk, or Will fail with reason, first failure, and shortfall when available.
- `CashoutSummary({ summary, status, onAddCashout })` renders gross borrowed, paid back, outstanding, available credit, monthly room, due-soon amount, and best next borrow.
- `CardCapacityGrid({ cards })` renders total limit, outstanding, available credit, current effective monthly limit, monthly room, and card state for every active card.
- `CashoutTimeline({ cards, cashouts, payments, forecast, today, onSelectCashout })` renders one horizontally scrollable lane per card with distinct event markers and hover/focus details.
- `CashflowForecast({ rows, status })` renders salary dates, protected budget reservations, payment obligations, projected cash, contingent borrowing, and the first unsafe date.

- [ ] **Step 1: Implement the status banner and summary hierarchy.**

Put the status banner before the total-borrowed figure. Use the existing blue-black palette and existing `--green`, `--yellow`, and `--red` variables. Never represent status by color alone; include text and the reason. Keep gross total borrowed separate from outstanding and paid-back totals.

- [ ] **Step 2: Implement the card grid with two capacity measures.**

Show total credit limit and available credit independently from monthly borrowing limit and monthly room. Label the maximum next borrow as `min(available credit, monthly room)`. Use distinct card badges for Ready, Partial, Locked, and No credit.

- [ ] **Step 3: Implement the timeline.**

Use a minimum-width timeline world inside an overflow-x scroll container. Keep card names fixed in the lane label, show past/today/future zones, and render borrow, due, payment, salary, limit-change, safe-date, and failure events. Provide accessible focus/hover detail text for each event without changing layout dimensions.

- [ ] **Step 4: Implement the forecast view.**

Show the adjusted salary date, budget reserved on salary day, payments due, projected cash after each event, and contingent future borrowing separately. Highlight the first failure row and show the shortfall. Keep the cash-only forecast visible even when a planned borrowing scenario is present.

- [ ] **Step 5: Add responsive styling and validate the visual hierarchy.**

At desktop, keep the aggregate summary, status, and card grid scannable. At mobile, stack summary metrics, keep the status reason readable, keep controls within the viewport, and preserve horizontal scrolling only for the timeline. Do not alter unrelated page styles.

- [ ] **Step 6: Run tests and build.**

Run:

```bash
npm test
npm run build
```

Expected: all calculation/repository tests pass and the page compiles.

---

### Task 6: Add In-App Reminders and App-Open Browser Notifications

**Files:**
- Create: `src/cashout/reminders.js`
- Modify: `src/pages/CashoutCycle.jsx`
- Modify: `src/components/cashout/CashflowSettingsForm.jsx`

**Interfaces:**

- `getUpcomingPaymentReminders({ cashouts, payments, today, daysBefore, holidaySet })` returns reminders with `cashoutId`, card name, adjusted reminder date, due date, amount, and status.
- `requestBrowserNotificationPermission()` returns the browser permission state without throwing when notifications are unavailable.
- `notifyUpcomingPayments(reminders, permissionState)` sends notifications only when permission is granted and the app is open.

- [ ] **Step 1: Add reminder tests.**

Test three-calendar-day subtraction, backward adjustment over a weekend and holiday, exclusion of fully paid cashouts, and no notification attempt when permission is denied or unsupported.

- [ ] **Step 2: Implement reminder selection and notification helpers.**

Use the same Hong Kong working-day utility as salary dates. Keep reminder failures non-blocking and return a visible in-page reminder list regardless of browser permission.

- [ ] **Step 3: Wire reminders into the page and settings.**

Display due-soon reminders in the summary/forecast, request permission only from an explicit user action, and run the app-open check when the page loads or returns to the foreground. Do not create a service worker or backend scheduler.

- [ ] **Step 4: Run reminder tests and build.**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

---

### Task 7: End-to-End Verification and Regression Check

**Files:**
- Verify: all files from Tasks 1-6
- Modify: `docs/superpowers/specs/2026-10-19-cashout-cycle-design.md` only if implementation decisions expose a documented mismatch

- [ ] **Step 1: Run the complete automated checks.**

Run:

```bash
npm test
npm run build
```

Expected: all tests pass and Vite produces `dist/` successfully.

- [ ] **Step 2: Start the local app and verify the private route.**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/banking/#/cashout-cycle` while authenticated. Verify unauthenticated navigation redirects to `/login` and the sidebar link works on desktop and mobile.

- [ ] **Step 3: Exercise the core workflow manually.**

Create a card with a total limit of `50000`, monthly limit of `20000`, and an existing used amount. Confirm the opening cashout appears in the timeline. Add a new cashout, record a partial payment, and verify available credit increases by exactly the payment amount while monthly room does not reopen.

- [ ] **Step 4: Exercise salary and bank-limit failure scenarios.**

Set a salary amount, protected budget, and starting reserve. Add a payment due before the next salary, then add a lower monthly borrowing limit effective next month. Confirm the status changes to At risk or Will fail with the first unsafe date and shortfall. Confirm an effective limit increase changes only future monthly room and does not erase an existing failure.

- [ ] **Step 5: Verify responsive behavior and regression safety.**

Check the status banner, summary metrics, forms, card grid, forecast, mobile bottom navigation, horizontal timeline scrolling, focus/hover event details, and no horizontal overflow outside the timeline. Visit Dashboard, Transactions, Investment, and Settings to confirm their existing routes and styles remain unchanged.

- [ ] **Step 6: Review the final diff without committing or deploying.**

Run:

```bash
git status --short
git diff --check
```

Confirm that only the Cashout Cycle feature, its tests, rules, plan/spec documentation, and required package metadata are included. Do not run `git push`, deployment, or production database writes.
