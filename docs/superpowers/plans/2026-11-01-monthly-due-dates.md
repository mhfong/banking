# Monthly Due Dates Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with a focused test checkpoint after each task.

**Goal:** Preserve historical cashout records while allowing month-specific Due Date records, edit-card entry, and an automatic next-date prompt defaulted to two days after the latest Due Date.

**Architecture:** Existing cashout Due Dates remain read-only historical markers. A new `cashoutDueDates` collection stores manual month-specific dates with only `userId`, `cardId`, and `dueOn`; it never participates in cashout capacity or payment calculations. A pure helper derives the latest date per active card and determines when a prompt is due. The Cashout Cycle page owns loading, mutations, prompt state, and passes due dates to the card form and calendar.

**Tech Stack:** React 18 JSX, Vite, Vitest, Firebase Firestore, date-only `YYYY-MM-DD` helpers.

## Global Constraints

- Preserve existing cashouts and payments in Firestore and in the calendar.
- Do not create incomplete cashout records for a Due Date-only entry.
- Keep all date-only calculations in UTC helpers.
- Require Firestore ownership checks for new Due Date reads and writes.
- Do not mutate the database directly during implementation or deploy changes.
- Do not commit unless explicitly requested.

## Task 1: Due Date Domain Rules

**Files:**
- Create: `src/cashout/dueDates.js`
- Test: `src/cashout/__tests__/dueDates.test.js`

**Interfaces:**
- `getMonthlyDueDate({ cardId, month, cashouts, dueDates })` returns `{ dueOn, id }` for the latest manual record when present, otherwise the latest matching cashout Due Date.
- `getDueDatePrompts({ cards, cashouts, dueDates, today })` returns active cards whose latest Due Date is today or earlier, with `currentDueOn` and `suggestedDueOn` equal to `currentDueOn + 2 days`.

Write tests for the +2-day suggestion, no prompt while a future manual date exists, manual-date preference in the edit form, and cards without any Due Date.

## Task 2: Firestore Due Date Repository

**Files:**
- Modify: `src/cashout/cashoutRepository.js`
- Modify: `src/cashout/__tests__/cashoutRepository.test.js`
- Modify: `firestore.rules`

Add `cashoutDueDates` loading, validation, ownership checks, and append-only `createDueDate`. New records contain only the card reference and date data needed for a monthly marker. Existing load tests must cover the additional user-scoped query and preserve all previous collections unchanged.

## Task 3: Card Editing and Prompt Workflow

**Files:**
- Create: `src/components/cashout/CashoutDueDatePrompt.jsx`
- Modify: `src/components/cashout/CashoutCardForm.jsx`
- Modify: `src/pages/CashoutCycle.jsx`
- Modify: `src/cashout/__tests__/cashoutFormValidation.test.jsx`
- Modify: `src/components/cashout/__tests__/cashoutViews.test.jsx`
- Modify: `src/styles/cashout-cycle.css`

Add the current-month Due Date field to Edit Card, using the manual record when available and otherwise showing the latest existing cashout Due Date. Saving an unchanged value does not create a duplicate; changing it or filling a missing value appends a manual Due Date record without changing any historical record. On page load, show one in-page prompt for the first active card whose latest Due Date has arrived; default its date to +2 days. Saving the prompt appends a new Due Date record, and dismissing it suppresses that prompt for the current page session.

## Task 4: Calendar Integration and Verification

**Files:**
- Modify: `src/components/cashout/CashoutTimeline.jsx`
- Modify: `src/pages/CashoutCycle.jsx`
- Modify: `src/components/cashout/__tests__/cashoutViews.test.jsx`

Render manual Due Date records as Due markers alongside existing Borrow, Due, and Payment markers. Deduplicate identical visual markers while retaining every source record in the database. Verify focused tests, the full suite, production build, diagnostics, diff whitespace, and the live browser workflow.
