# Cashout Calendar View Design

## Status

Approved design for implementation. This replaces the Cashout Cycle timeline presentation with a shared month calendar.

## Goal

Make the Cashout Cycle date surface a clean, responsive calendar that marks only Borrow Date, Due Date, and Payment Date for every card.

## User Experience

The existing Cash-out timeline panel becomes a conventional seven-column month calendar. It opens on the month containing the supplied `today` date and provides compact previous-month, next-month, and Today controls.

Each day cell contains date markers derived only from persisted cashout and payment records:

- `B` marks `cashout.borrowedOn` as Borrow Date.
- `D` marks `cashout.expectedPaymentOn` as Due Date.
- `P` marks `payment.paidOn` as Payment Date.

Markers use a stable accent color per card so dates remain attributable when several cards share a day. The marker's `B`, `D`, or `P` badge identifies the date type. Accessible labels include the full card name, date type, and date. Amounts, forecasts, event details, and payment actions are not shown in the calendar.

The calendar removes the previous timeline's capacity summary, event legend, date-zone legend, lane labels, salary markers, limit-change markers, safe-date markers, failure markers, contingent markers, hover previews, click-to-record-payment behavior, synchronized lane scrolling, and drag scrolling.

On wide screens, the calendar fills its available width with seven flexible columns. On narrow screens, the calendar surface keeps readable day-cell and marker dimensions inside a horizontal scroll container. The surrounding page continues to use the existing dark Cashout Cycle theme, borders, typography, and color variables.

## Architecture

`CashoutTimeline.jsx` remains the component file for compatibility, but its implementation becomes a presentation-only calendar:

- Inputs are `cards`, `cashouts`, `payments`, and `today`.
- It builds a month grid from the date containing `today`.
- It creates only three marker records from persisted dates: borrow, due, and payment.
- Payments are associated with cards through their cashout's `cashoutId` and `cardId`.
- No `forecast`, `summary`, or `onSelectCashout` input is consumed.
- Month navigation changes only the displayed month; it does not recalculate domain data or mutate Firestore.

`CashoutCycle.jsx` passes the calendar inputs directly and changes the panel title/subtitle to describe the calendar rather than the removed timeline. Existing cashout, payment, forecast, and capacity calculations remain unchanged outside this presentation boundary.

## Visual System

- Monday-first seven-column grid with a compact weekday header.
- Current-month cells use the normal panel surface; adjacent-month cells are muted.
- Today receives a restrained accent outline/background.
- Card identity uses a deterministic palette selected by card order.
- Borrow, Due, and Payment remain distinguishable through their badge colors and labels while retaining the card accent.
- Calendar controls are icon buttons with accessible labels and tooltips.
- Day cells have stable minimum dimensions so markers do not resize the grid.
- `prefers-reduced-motion` disables calendar entrance and control transitions.

## Data Rules

The view displays valid date-only strings already present in the records. It does not infer dates from statement dates, safe-borrow recommendations, forecast rows, salary settings, limit changes, or failure state.

For each card:

1. Add a Borrow marker for every matching cashout with `borrowedOn`.
2. Add a Due marker for every matching cashout with `expectedPaymentOn`.
3. Add a Payment marker for every payment whose cashout belongs to that card and has `paidOn`.

Multiple markers may occupy the same day. Archived cards remain eligible for historical markers because the calendar represents recorded card history, not only active capacity.

## Testing

Focused view tests will verify:

- The initial month contains the supplied `today` date.
- The calendar renders seven weekday headings and date cells with stable date attributes.
- Borrow, Due, and Payment markers appear under the correct card and dates.
- A payment resolves to the correct card through its cashout relationship.
- Multiple cards can share a date without losing card identity.
- Month navigation controls are present and accessible.
- Removed event types, previews, payment actions, summary metrics, and timeline lane markup are absent.
- Narrow-screen CSS preserves a readable minimum calendar width and desktop CSS remains flexible.

The focused view suite, full Vitest suite, production build, diagnostics, and browser verification will be run after implementation.

## Scope Boundary

This change does not alter Firestore schemas, calculations, forms, reminders, forecast behavior, card editing, or the capacity grid. It changes only the Cashout Cycle date visualization and its page-level props.