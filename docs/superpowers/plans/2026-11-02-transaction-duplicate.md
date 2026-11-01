# Transaction Duplicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a copy button beside each transaction row's delete button that opens a new, prefilled transaction form with today's date.

**Architecture:** Keep duplication in the existing `Transactions` page state and form flow. A `handleDuplicate(transaction)` helper will populate the create-form state, clear `editingId`, and open the existing modal; the current `handleAdd` path will create the new Firestore document only after submission. Add only the row-level icon button and its styling.

**Tech Stack:** React 18, Firebase Firestore, Vite, existing CSS, Playwright browser smoke verification, Vitest.

## Global Constraints

- Clicking copy must not edit the source transaction or write to Firestore immediately.
- The duplicate form copies type, amount, description, category, payment method, and `excludeFromChart`.
- The duplicate form date is today, using the existing `toDateStr(new Date())` helper.
- The copy button must be immediately to the right of the delete button and must stop event propagation.
- Use accessible `aria-label` and `title` text: `Duplicate transaction`.
- Do not change Firestore schema, security rules, or existing transaction records.

---

### Task 1: Add transaction-row duplication

**Files:**
- Modify: `src/pages/Transactions.jsx` around `handleEdit`, the transaction-row action buttons, and the FAB form reset handler.
- Modify: `src/styles/transactions.css` beside `.txn-delete-btn` styles.
- Test: Live `#/transactions` browser smoke check, `npm run build`, and `npm test -- --reporter=dot`.

**Interfaces:**
- Consumes: `handleAdd`, `setEditingId`, `setFormType`, `setFormAmount`, `setFormDesc`, `setFormCategory`, `setFormPayment`, `setFormDate`, `setFormExcludeChart`, `setShowForm`, and `toDateStr` from `Transactions.jsx`.
- Produces: `handleDuplicate(transaction)` with no return value; a button with `aria-label="Duplicate transaction"`; a new Firestore transaction only when the user submits the existing form.

- [ ] **Step 1: Add the duplicate state helper**

Insert this helper after `handleEdit`:

```jsx
function handleDuplicate(t) {
  setEditingId(null)
  setFormType(t.type)
  setFormAmount(String(t.amount))
  setFormDesc(t.description || '')
  setFormCategory(t.category)
  setFormPayment(t.paymentMethod || PAYMENT_METHODS[0])
  setFormDate(toDateStr(new Date()))
  setFormExcludeChart(t.excludeFromChart || false)
  setShowForm(true)
}
```

This ensures the existing `handleAdd` branch uses `addDoc`, not `updateDoc`, and creates a fresh `createdAt` timestamp after submission.

- [ ] **Step 2: Add the row copy button**

Place this button immediately after the existing delete button in each transaction row:

```jsx
<button
  className="txn-copy-btn"
  aria-label="Duplicate transaction"
  title="Duplicate transaction"
  onClick={(e) => { e.stopPropagation(); handleDuplicate(t) }}
>
  <i className="fas fa-copy"></i>
</button>
```

The `stopPropagation()` call prevents the row's `onClick={() => handleEdit(t)}` from opening edit mode.

- [ ] **Step 3: Style the copy button consistently**

Add a `.txn-copy-btn` rule next to `.txn-delete-btn` with the same transparent icon-button layout and a distinct hover color that remains legible:

```css
.txn-copy-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  opacity: 0.3;
  transition: opacity 0.2s, color 0.2s;
  padding: 4px;
  flex-shrink: 0;
}

.txn-copy-btn:hover {
  opacity: 1;
  color: var(--accent);
}
```

- [ ] **Step 4: Verify the source-level behavior**

Run:

```bash
rg -n -C 3 "handleDuplicate|txn-copy-btn|Duplicate transaction|setFormDate\(toDateStr\(new Date\(\)\)\)" src/pages/Transactions.jsx src/styles/transactions.css
```

Expected: the helper, accessible button, today's-date reset, and CSS rule are present.

- [ ] **Step 5: Verify the live interaction without writing data**

With Vite running at `http://127.0.0.1:5174/banking/`:

1. Open `#/transactions`.
2. Locate a transaction row and its `Duplicate transaction` button.
3. Click the copy button.
4. Confirm the `Add Transaction` form opens with the source values copied and the date set to today.
5. Do not submit the form.

- [ ] **Step 6: Run the build and regression suite**

Run:

```bash
npm run build
npm test -- --reporter=dot
```

Expected: the build exits with code 0 and all existing tests pass.
