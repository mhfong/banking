# Transaction Duplicate Design

## Status

Approved design for duplicating transaction records from the Transactions page.

## Goal

Let users create a new transaction from an existing row without re-entering the transaction type, amount, description, category, payment method, or chart-setting choice.

## User Experience

Each transaction row will keep its existing edit behavior and delete button, with a copy button immediately to the right of the delete button. The copy button will have an accessible label and tooltip such as `Duplicate transaction`.

Clicking the copy button will:

- stop the click from opening the row edit handler;
- open the existing Add Transaction form;
- copy the source row's amount, description, category, payment method, and `excludeFromChart` value;
- set the transaction type to the source row's type;
- set the date to today;
- leave the form in create mode rather than edit mode.

The user reviews or changes the values and submits the form. Clicking copy alone does not write to Firestore.

## Data Flow

`Transactions.jsx` will add a `handleDuplicate(transaction)` helper that resets `editingId`, copies the source row's fields into the existing form state, sets `formDate` with `toDateStr(new Date())`, and sets `showForm(true)`. The existing `handleAdd` function will see that `editingId` is empty and create a new `transactions/{id}` document with a fresh `createdAt` timestamp.

No Firestore schema, security-rule, or migration change is required.

## Visual and Accessibility Behavior

The copy button will use the existing icon-button styling pattern and a copy icon. It will be a sibling of the delete button on the row's right side. Its click handler will call `stopPropagation()` so it does not trigger row editing. The button will include `aria-label="Duplicate transaction"` and `title="Duplicate transaction"`.

## Validation

- Source-level verification confirms the duplicate handler copies all required fields and clears `editingId`.
- Browser verification confirms the copy button appears beside each delete button and opens the Add Transaction form with copied values and today's date.
- Submitting is not required for the browser smoke check, avoiding unintended Firestore writes.
- `npm run build` and the existing Vitest suite must pass.
