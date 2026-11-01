# Cashout Cycle Design

## Status

Draft for user review. This feature is a separate, user-scoped cashout tracker. It does not add cashout records to the existing Transactions page.

## Goals

- Track interest-free cashout records by credit card.
- Show the complete loop: borrow, outstanding balance, payments, credit restoration, renewal timing, and future borrowing capacity.
- Distinguish each card's total credit limit from its monthly borrowing limit.
- Include recurring salary cash inflow on the 28th, moved to the previous working day when necessary.
- Forecast whether upcoming payments can be funded from cash and salary after protected spending.
- Account for effective-dated bank announcements that change a card's monthly borrowing limit.
- Recommend the next safe borrowing date and maximum amount.
- Warn before a payment becomes unsafe and provide the earliest failure date and shortfall.
- Preserve card and cashout history through archiving rather than destructive deletion.

## Non-goals

- This feature does not import or rewrite ordinary income and expense transactions.
- It does not assume that future cashout proceeds are guaranteed income.
- It does not provide background push notifications in the first version.
- It does not model interest, fees, or installment schedules; each cashout has one expected repayment date and can receive multiple partial payments before that date.

## User Experience

A private route at `/cashout-cycle` will be added to the existing `HashRouter` and the sidebar. The page follows the existing dashboard palette and responsive layout.

The page hierarchy is:

1. A loop-health banner at the top with one of `Safe`, `At risk`, or `Will fail`.
2. The aggregate loop summary:
   - Gross total borrowed across all cashout records, including fully paid records.
   - Total paid back.
   - Total still outstanding.
   - Available credit now.
   - Monthly borrowing room for the current cycle.
   - Next payment due and the best next borrow recommendation.
3. A card capacity grid. Each card shows total credit limit, outstanding balance, available credit, monthly borrowing limit, monthly room remaining, and its current state.
4. A separate horizontally scrollable timeline lane for each card. Borrow, due, payment, salary, limit-change, safe-date, and failure events use distinct markers. Past, today, and future are visually different.
5. A cash-flow forecast with monthly salary, protected spending budget, planned payments, ending projected cash, and the first unsafe date.
6. Forms for managing cards, entering cashouts, recording payments, entering salary/budget settings, and recording announced limit changes.

The status banner must explain the reason, not only display a color. For example: `At risk - the Nov 5 payment depends on borrowing capacity that changes on Nov 1.` A failure state includes the payment, card, date, and projected shortfall.

## Domain Model

All date-only values use `YYYY-MM-DD` strings and are interpreted in `Asia/Hong_Kong`. Firestore server timestamps are used only for audit fields such as `createdAt` and `updatedAt`.

Cards from the earlier recurring-day schema are not assigned inferred statement or borrow dates. They remain editable, but safe-borrow recommendations stay unavailable until the user enters the next known borrow date.

### `cashoutCards/{cardId}`

```text
userId: string
name: string
issuer: string | null
totalCreditLimit: number
monthlyBorrowLimit: number
nextStatementDate: string   // YYYY-MM-DD, the next known statement date
nextBorrowDate: string      // YYYY-MM-DD, user-entered and fixed until edited
active: boolean
archivedAt: string | null
createdAt: timestamp
updatedAt: timestamp
```

`totalCreditLimit` is the maximum outstanding card balance. `monthlyBorrowLimit` is the maximum gross amount of new cashouts allowed during one monthly cycle. These values are never treated as interchangeable.

When a card is created with an existing used amount, the creation flow writes the card and an opening cashout in one batch. The opening cashout has its own borrow date, statement date, and due date, so the used amount is part of the normal history.

### `cashouts/{cashoutId}`

```text
userId: string
cardId: string
amount: number
borrowedOn: string
statementDate: string
expectedPaymentOn: string
expectedPaymentAmount: number
status: "open" | "paid"
createdAt: timestamp
updatedAt: timestamp
```

A cashout amount counts toward the monthly borrowing limit in the cycle containing `borrowedOn`, even after it is paid. `status` is a denormalized display field maintained with payment writes; the payment sum remains the source of truth, and outstanding balance is never independently editable.

### `cashoutPayments/{paymentId}`

```text
userId: string
cashoutId: string
amount: number
paidOn: string
note: string | null
createdAt: timestamp
```

Payments apply to one cashout record. A payment cannot exceed that record's remaining balance. A payment restores exactly its amount to the card's available credit immediately. Monthly borrowing room does not reopen until the next monthly renewal cycle.

### `cashoutLimitChanges/{changeId}`

```text
userId: string
cardId: string
effectiveOn: string
monthlyBorrowLimit: number
note: string | null
createdAt: timestamp
updatedAt: timestamp
```

The active monthly borrowing limit for a date is the latest limit change whose `effectiveOn` is on or before that date, falling back to the card's base `monthlyBorrowLimit`. Multiple future changes are allowed so bank announcements can be recorded ahead of time.

### `cashoutSettings/{uid}`

```text
salaryAmount: number
salaryDay: 28
salaryAdjustment: "previousWorkingDay"
protectedMonthlyBudget: number
startingCashReserve: number
reminderDaysBefore: 3
browserNotificationsEnabled: boolean
updatedAt: timestamp
```

Salary and protected budget are cashout-cycle forecast inputs, not ordinary Transactions documents. `protectedMonthlyBudget` is the amount reserved for non-cashout spending each month. The initial forecast assumes the remaining salary is available for cashout payments.

## Calculation Rules

### Credit and monthly capacity

For a card on date `d`:

```text
outstanding = sum(cashout.amount) - sum(cashoutPayments.amount)
availableCredit = totalCreditLimit - outstanding
borrowedThisCycle = sum(cashout.amount where borrowedOn is in the current monthly cycle)
monthlyRoom = effectiveMonthlyBorrowLimit(d) - borrowedThisCycle
maxNewBorrow = max(0, min(availableCredit, monthlyRoom))
```

A card is eligible for a new cashout only when `maxNewBorrow > 0`, the previous cashout on that card is fully paid, and the card has a valid user-entered `nextBorrowDate`. `getSafeBorrowDate` returns that stored date after checking available credit, outstanding payment state, and future capacity on that date. It never derives or shifts the date from statement dates, monthly renewal dates, payment dates, or forecast events. Each cashout also stores its exact statement date, which cannot be before its borrow date.

A missing `nextBorrowDate` is an explicit unavailable state rather than a guessed date. A limit increase can increase future room but cannot erase an existing payment risk.

### Salary dates and working days

Salary is scheduled for the 28th of each month. If that date is a Saturday, Sunday, or Hong Kong public holiday, the salary date moves backward to the latest preceding working day. The same working-day rule is used for payment reminders.

The initial holiday calendar is a checked-in Hong Kong holiday data table maintained by year. The date utility must surface a missing-year warning instead of silently treating an unknown year as having no holidays. Manual holiday overrides are outside the first-version scope and can be added later without changing cashout records.

### Cash-flow forecast

The forecast starts from `startingCashReserve` and processes date-ordered events. On each adjusted salary date, the protected monthly budget is reserved immediately; only the remaining salary is added to cash available for cashout payments:

```text
projectedCash = startingCashReserve
  + salary received through date
  - protected budget reserved through date
  - planned cashout payments through date
```

Cashout proceeds are not automatically counted as repayment income. This prevents the loop from appearing safe only because it assumes an unconfirmed future loan will fund an existing payment.

For each future cashout, the planned payment is the cashout's remaining balance unless the user has recorded a smaller actual payment. Actual payments replace the corresponding forecast obligation immediately.

The forecast is `Safe` when every planned payment leaves projected cash at or above zero and no required future action depends on unconfirmed borrowing. It is `At risk` when a payment is only covered by a contingent future cashout, an unconfirmed bank limit, or an explicit cash buffer warning. It is `Will fail` when projected cash is below a payment amount on any date. The UI identifies the first failure and computes:

```text
shortfall = payment amount - projected cash immediately before payment
```

A planned borrowing scenario may be entered for analysis, but it is clearly marked as contingent and is not treated as an actual cashout until the user records it.

### Bank limit changes and loop risk

An announced limit change applies to new borrowing from its effective date onward. It does not change existing cashout balances or payment obligations. The forecast compares each planned future borrow with the effective limit on that date.

If a payment due before the next salary requires a future cashout and the effective monthly limit is too small, the loop is `Will fail` with the payment date and shortfall. If the date or amount is uncertain, the loop cannot be marked fully safe; it is `At risk` and requests confirmation.

## Data Flow and Components

- `CashoutCycle.jsx` owns the page-level view state and composes the summary, status, card grid, timeline, and forecast panels.
- `CashoutCardForm.jsx` validates card limits and creates a card plus optional opening cashout in one Firestore batch.
- `CashoutForm.jsx` validates available credit, monthly room, renewal date, and the cashout's exact statement date before creating a cashout.
- `CashoutPaymentForm.jsx` validates the remaining balance and creates a payment record.
- `CashflowSettingsForm.jsx` stores salary, protected budget, starting reserve, and reminder preferences in `cashoutSettings/{uid}`.
- `LimitChangeForm.jsx` stores effective-dated monthly borrowing limits.
- `cashoutRepository.js` contains user-scoped Firestore reads and writes.
- `cashoutCalculations.js` contains pure date, capacity, forecast, status, and recommendation functions.
- `hongKongWorkingDays.js` contains holiday data and working-day adjustment logic.
- `CashoutCycle.css` owns page-specific responsive styling and reuses the global CSS variables.

Reads load the active user settings, active and archived cards, cashouts, payments, and future limit changes. Derived totals and status are calculated in memory from those records. Writes update only the relevant collection and refresh the derived view; no normal Transactions data is read or mutated.

## Validation and Error Handling

- Card name is required.
- Total credit limit, monthly borrowing limit, salary, protected budget, and starting reserve must be finite and non-negative.
- Existing used amount cannot exceed total credit limit.
- Cashout amount must be positive and no greater than both available credit and monthly room.
- A new cashout cannot be entered before its safe borrow date.
- Payment amount must be positive and no greater than the cashout's remaining balance.
- Limit changes cannot have a negative monthly limit and cannot overlap with a different value on the same effective date for the same card.
- Missing referenced cards or cashouts are reported as recoverable data errors rather than causing the whole page to fail.
- Firestore permission and network failures show an inline retryable message; unsaved form values remain in local component state.
- Calculation errors caused by invalid dates or missing holiday years produce an explicit warning and suppress a false `Safe` status.
- Cards with historical cashouts are archived. Deletion is offered only for cards with no cashout history and requires confirmation.

## Security and Firestore Rules

Every new document contains `userId`, and rules require it to equal `request.auth.uid` on create. Reads, updates, and deletes require the existing document's `userId` to equal the signed-in user. Ownership fields are immutable on update. Card, cashout, payment, limit-change, and settings documents are inaccessible to unauthenticated users and to other users.

The rules validate basic ownership and non-negative numeric fields. Cross-document business rules, such as available credit and payment remaining balance, are enforced in the client calculation and form flow; the UI must never present a successful write until Firestore confirms it.

## Reminders and Notifications

The app shows in-page reminders three days before each due date. The reminder date is calculated by subtracting three calendar days and then moving backward to the previous working day that is not a Hong Kong public holiday.

Browser notifications are optional, require permission, and run only while the app is open. Notification failures do not block cashout or payment writes. Background push scheduling is explicitly outside the first version.

## Testing and Verification

Pure calculation tests cover:

- Gross borrowed, paid, outstanding, available credit, and monthly room totals.
- Partial payment and exact credit restoration.
- Monthly borrowing cap consumption and reset.
- Statement closing date plus one day and fully-paid-date restrictions.
- Salary adjustment for weekends and Hong Kong holidays.
- Reminder adjustment for weekends and holidays.
- Salary, protected budget, and payment forecasts.
- Safe, at-risk, and will-fail classifications with shortfalls.
- Effective-dated limit reductions and increases.
- Missing or conflicting future limit data.

Integration checks cover user-scoped Firestore reads/writes, opening cashout creation, payment creation, archival behavior, and permission failures. Frontend checks cover the private route, sidebar and mobile navigation, forms, responsive summary layout, separate card lanes, horizontal timeline scrolling, status explanations, and retryable loading/error states. The final verification command is `npm run build`; no test script currently exists in `package.json`.

## Scope Boundary

The first implementation includes the route, navigation, dedicated Firestore collections and rules, card/cashout/payment management, salary and budget settings, effective-dated limit changes, calculations, loop status, in-app reminders, optional app-open browser notifications, and focused tests. It does not include ordinary transaction integration, server-side notification scheduling, bank API integrations, automatic bank-limit discovery, interest/fee modeling, or multi-installment cashouts.
