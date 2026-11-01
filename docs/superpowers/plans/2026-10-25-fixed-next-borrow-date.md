# Fixed Next Borrow Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic safe-borrow-date guessing with a user-entered, persisted card date that remains fixed until the user edits it.

**Architecture:** Add `nextBorrowDate` to the card form and repository card writes. Keep credit, monthly-room, and outstanding-payment checks in `getSafeBorrowDate`, but return the persisted card date when those checks pass instead of deriving a date from statements, renewals, or payment dates. Preserve compatibility for legacy cards by requiring the field on future edits and returning an explicit unavailable reason until it is supplied.

**Tech Stack:** React 18, Vite, Vitest, Firebase Firestore.

## Global Constraints

- Do not automatically guess or shift a card's next borrow date.
- The user-entered date is fixed until the card is edited.
- Keep existing credit-limit, monthly-room, and outstanding-payment safeguards.
- Preserve existing card and cashout APIs unless the new field requires an additive change.

---

### Task 1: Define fixed-date calculation behavior

**Files:**
- Modify: `src/cashout/__tests__/cashoutCalculations.test.js`
- Modify: `src/cashout/cashoutCalculations.js`

**Interfaces:**
- `getSafeBorrowDate({ asOf, card, cashouts, payments, limitChanges })` continues to return `{ date, reason }`.
- A card with `nextBorrowDate` returns that exact date when capacity and payment safeguards pass.
- A card without `nextBorrowDate` returns `{ date: null, reason: 'The card has no next borrow date.' }`.

- [x] **Step 1: Write the failing tests**

Add cases asserting that a future `nextBorrowDate` is returned unchanged, that a date in the past is still returned unchanged because it is user-controlled, and that a missing date is unavailable instead of being inferred from statement/renewal dates.

- [x] **Step 2: Run the calculation tests and verify they fail**

Run: `npm test -- src/cashout/__tests__/cashoutCalculations.test.js`

Expected: the new assertions fail because the implementation currently derives dates from renewal, payment, and statement constraints.

- [x] **Step 3: Implement the smallest calculation change**

After the existing available-credit and outstanding-payment checks, return the parsed `card.nextBorrowDate` directly. Replace the candidate-date and future-capacity date-guessing block with a missing-date guard and the fixed-date return. Do not change capacity arithmetic or payment safeguards.

- [x] **Step 4: Run the calculation tests and verify they pass**

Run: `npm test -- src/cashout/__tests__/cashoutCalculations.test.js`

Expected: all calculation tests pass, including the fixed-date cases.

### Task 2: Persist and validate the user-entered card date

**Files:**
- Modify: `src/components/cashout/CashoutCardForm.jsx`
- Modify: `src/cashout/cashoutRepository.js`
- Modify: `src/cashout/__tests__/cashoutFormValidation.test.jsx`
- Modify: `src/cashout/__tests__/cashoutRepository.test.js`

**Interfaces:**
- `validateCardValues(values)` validates `values.nextBorrowDate` as a required date.
- `getInitialValues(card, today)` loads `card.nextBorrowDate` for edits.
- New cards and edits include `nextBorrowDate` in the card patch passed to repository callbacks.
- Repository card normalization/writes preserve `nextBorrowDate` as an additive card field.

- [x] **Step 1: Write failing form and repository tests**

Assert that a missing next-borrow date is rejected, an invalid date is rejected, an edited card renders its stored date, and a repository card write keeps the new field.

- [x] **Step 2: Run the focused form/repository tests and verify they fail**

Run: `npm test -- src/cashout/__tests__/cashoutFormValidation.test.jsx src/cashout/__tests__/cashoutRepository.test.js`

Expected: failures show the form does not validate or submit `nextBorrowDate` and the repository does not retain it yet.

- [x] **Step 3: Implement the form and repository changes**

Add a required date input labeled `Next borrow date`, include it in validation and `cardValues`, initialize it from existing cards, and ensure repository card normalization accepts the field without dropping it.

- [x] **Step 4: Run the focused tests and verify they pass**

Run: `npm test -- src/cashout/__tests__/cashoutFormValidation.test.jsx src/cashout/__tests__/cashoutRepository.test.js`

Expected: all focused form and repository tests pass.

### Task 3: Show the fixed date in the Cashout Cycle UI

**Files:**
- Modify: `src/pages/CashoutCycle.jsx`
- Modify: `src/components/cashout/CardCapacityGrid.jsx`
- Modify: `src/components/cashout/__tests__/cashoutViews.test.jsx`
- Modify: `src/styles/cashout-cycle.css`

**Interfaces:**
- Capacity cards display the persisted next-borrow date when present.
- Existing safe-borrow display and card edit trigger remain compatible with the new field.
- No component recalculates or overwrites the date.

- [x] **Step 1: Write failing view tests**

Assert that a capacity card renders its fixed next-borrow date and that legacy cards show an explicit missing-date state rather than a guessed date.

- [x] **Step 2: Run the focused view tests and verify they fail**

Run: `npm test -- src/components/cashout/__tests__/cashoutViews.test.jsx`

Expected: the new date-display assertions fail because the card capacity view does not render the field yet.

- [x] **Step 3: Implement the display and styling**

Render the stored date in the capacity card using the existing date text conventions. Keep the clickable card editor and existing capacity states intact. Do not add another date calculation path.

- [x] **Step 4: Run all tests and build**

Run: `npm test -- --reporter=dot && npm run build`

Expected: all tests pass and the production build exits successfully; any pre-existing CSS/chunk warnings remain documented rather than expanded in scope.

### Task 4: Verify the end-to-end fixed-date workflow

**Files:**
- No additional production files.

- [ ] **Step 1: Check the browser workflow**

Open the Cashout Cycle page, click a card, confirm `Next borrow date` is editable, save a changed date, and confirm the capacity card displays the changed value without shifting it based on the current month or payment state.

- [x] **Step 2: Run diagnostics on all touched files**

Run the workspace diagnostics for the changed JSX, JavaScript, and CSS files and confirm no new errors are reported.