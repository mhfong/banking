# Transaction Payment Methods Implementation Plan

> **For agentic workers:** Execute this plan inline in the current session because it contains one small, isolated task.

**Goal:** Add `MOX` and `DBS Eminent` as selectable transaction payment methods and persist them through the existing Firestore transaction path.

**Architecture:** Extend the existing `PAYMENT_METHODS` constant in `src/pages/Transactions.jsx`. The form already writes the selected value to the transaction document's `paymentMethod` string field through `addDoc` and `updateDoc`, so no database migration or rules change is needed.

**Tech Stack:** React 18, Vite, Firebase Firestore, existing browser smoke verification.

## Global Constraints

- Store the exact labels `MOX` and `DBS Eminent` as ordinary `paymentMethod` strings.
- Do not add a payment-method collection, seed transaction records, migration, or Firestore-rules change.
- Do not rewrite existing transaction data.

---

### Task 1: Add the two payment-method options

**Files:**
- Modify: `src/pages/Transactions.jsx:64`
- Test: browser smoke check on `#/transactions` and `npm run build`

**Interfaces:**
- Consumes: the existing `PAYMENT_METHODS` array used by the transaction add/edit `<select>`.
- Produces: selectable values `MOX` and `DBS Eminent`; existing `handleAdd` persists either value as `paymentMethod`.

- [ ] **Step 1: Extend the existing options list**

Change the constant to include the new card labels after `SC Mastercard`:

```js
const PAYMENT_METHODS = ['HSBC Red', 'SC Mastercard', 'MOX', 'DBS Eminent', 'Cash', 'PayMe', 'Octopus', 'FPS', 'Bank Transfer', 'Other']
```

- [ ] **Step 2: Verify the source contains both exact labels**

Run:

```bash
rg -n "MOX|DBS Eminent" src/pages/Transactions.jsx
```

Expected: both labels appear in the `PAYMENT_METHODS` constant.

- [ ] **Step 3: Verify the app builds**

Run:

```bash
npm run build
```

Expected: Vite exits with code 0.

- [ ] **Step 4: Verify the transaction form renders both options**

With the local Vite server running, open `http://127.0.0.1:5174/banking/#/transactions`, open the add-transaction form, and inspect the payment-method select. Expected: options `MOX` and `DBS Eminent` are present alongside the existing options.
