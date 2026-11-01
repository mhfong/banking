# Transaction Payment Methods Design

## Status

Approved design for adding two payment-method values to Transactions.

## Goal

Allow users to select and store `MOX` and `DBS Eminent` as payment methods when creating or editing a transaction.

## Data Model

Transactions already store `paymentMethod` as a string on each `transactions/{transactionId}` Firestore document. Firestore rules do not constrain the value, and there is no separate payment-method collection or schema to migrate.

## Implementation

Add the exact labels `MOX` and `DBS Eminent` to the existing `PAYMENT_METHODS` constant in `src/pages/Transactions.jsx`, after the existing card options. The existing form save path will persist the selected label through `addDoc` or `updateDoc`.

No Firestore migration, seed records, collection, rule, or data rewrite is required.

## Validation

- Confirm the options render in the transaction add/edit payment-method select.
- Confirm the app builds successfully.
- Confirm the selected values remain ordinary transaction `paymentMethod` strings.
