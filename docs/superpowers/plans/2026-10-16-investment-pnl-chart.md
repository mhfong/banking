# Investment PNL Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users switch the Investment chart between Time-Weighted Return and cumulative Total PNL, with the latest lifetime PNL point matching the Total PNL stat card.

**Architecture:** The ETL will persist a `dailyTotalPnL` series calculated from daily NAV changes and snapped cash flows. The Investment page will select either that dollar series or the existing `dailyTWR` percentage series, reusing the existing area chart and period controls while switching labels, axes, colors, and tooltips by mode.

**Tech Stack:** React 18, Recharts, Firebase/Firestore, Node.js ES modules, Vite.

## Global Constraints

- Keep TWR as the default chart mode.
- Do not change the existing TWR calculation or its stored data shape.
- Total PNL must include realized and unrealized account movement and use dollar formatting.
- The `All` Total PNL series must end at the same value as `summary.totalPnL` when the ETL payload is complete.
- Do not write to Firestore or deploy during local verification.

---

### Task 1: Persist daily total PNL

**Files:**
- Modify: `etl_ibkr.mjs`
- Test: inline Node assertion against the extracted calculation or `node --check etl_ibkr.mjs`

**Interfaces:**
- Produces `dailyTotalPnL: [{ date, dailyPnL, cumulativePnL, endingValue, cashFlow }]` in the Firestore investment payload.

- [ ] **Step 1: Add the daily series after NAV and cash-flow inputs are available**

For each sorted NAV row, calculate `dailyPnL = current.total - previous.total - cashFlow`, with the first row using `current.total - cashFlow`. Calculate `cumulativePnL = current.total - cumulativeCashFlow`, round monetary values to cents, and retain the ending NAV and flow for chart/tool-tip use.

- [ ] **Step 2: Align the final cumulative value with the existing summary definition**

After `summary.totalPnL` is calculated, apply only a constant carry-in adjustment when the first NAV window omits opening capital, so the last `cumulativePnL` equals `summary.totalPnL` without changing daily deltas.

- [ ] **Step 3: Validate syntax and the arithmetic invariants**

Run `node --check etl_ibkr.mjs`. Verify with a small Node assertion that a deposit does not count as PNL and that the final cumulative value equals NAV minus net deposits.

### Task 2: Add the chart mode switch

**Files:**
- Modify: `src/pages/Investment.jsx`
- Modify: `src/styles/investment.css`

**Interfaces:**
- Consumes `data.dailyTotalPnL` from Task 1 and existing `data.dailyTWR`.
- Produces an accessible `TWR` / `Total PNL` mode control, with TWR selected initially.

- [ ] **Step 1: Add mode-aware chart data and period filtering**

Keep the existing TWR filter intact. Add a dollar-series filter that rebases shorter periods using the first point’s daily PNL, while `All` preserves lifetime cumulative PNL.

- [ ] **Step 2: Switch chart presentation by mode**

Use the TWR title, percentage headline, percentage Y-axis, and percentage tooltip in TWR mode. Use `Total PNL`, `summary.totalPnL`, dollar axis ticks, and daily/cumulative dollar tooltip values in Total PNL mode. Reuse the existing area gradients and zero reference line.

- [ ] **Step 3: Add the segmented control styling**

Place the mode switch beside the chart heading and match the existing period-toggle visual language without changing unrelated controls.

### Task 3: Verify the feature locally

**Files:**
- No additional files.

- [ ] **Step 1: Run `npm run build`**

Expected: Vite build succeeds without new errors.

- [ ] **Step 2: Refresh the local app and inspect both modes with Playwright**

Verify the default TWR view, switch to Total PNL, confirm dollar axis/tooltip labels and the mode title, and verify the existing period buttons still work.

- [ ] **Step 3: Report any data prerequisite**

If the currently cached Firestore document predates `dailyTotalPnL`, state that a future ETL run is required to populate historical dollar points; do not mutate Firestore during preview.
