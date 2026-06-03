# P2-14 — Migrate hot analytics from Google Sheets to Postgres

**Status:** Design / runbook — **not yet implemented**. Review before executing.
**Decision captured:** plan + implement (multi-day, with backfill + cutover).

---

## 1. Why

The dashboard, customers, and P&L pages derive their numbers from **Google Sheets** via
`lib/sheets.ts` (`getSales()`, `getInventory()`, `getCompetitors()`, `getDistributorOrders()`),
transformed in `lib/kpis.ts` / `lib/finance.ts`. Even with the 60s in-process TTL cache + the
`fetch` `revalidate: 300`, the request path still:

- depends on the Google Sheets API (latency, quota, occasional 5xx),
- pulls **whole ranges** (`'Sales'!A:Z`, etc.) and parses them in JS on every cache miss,
- can't be filtered/aggregated server-side (no indexes, no `WHERE`/`GROUP BY`).

Postgres already holds the transactional truth (`Order`, `OrderItem`, `ProductVariant`,
`InventoryBatch`, `RetailOrder`). Reading analytics from indexed Postgres at request time
removes the external dependency and lets the DB do the aggregation.

## 2. Strategy — incremental, read-through, reversible

Do **not** rip out Sheets in one shot. Introduce a Postgres-backed analytics source behind the
**existing function signatures** so pages don't change, then flip a flag per data domain.

```
lib/analytics/
  index.ts         // getSalesAnalytics(), getInventoryAnalytics(), ... (stable API)
  postgres.ts      // Prisma aggregations
  sheets.ts        // re-export current lib/sheets impls (fallback)
```

`getSalesAnalytics()` chooses source by env flag `ANALYTICS_SOURCE` (`postgres` | `sheets` |
`auto`). `auto` = Postgres if it returns rows, else Sheets. This mirrors the hybrid pattern
already used in `lib/pricing.ts` (`getPricing`) and `lib/airtable.ts` (`getProductCatalog`).

## 3. Data-domain mapping (Sheets → Postgres)

| Sheets read | Consumers | Postgres equivalent |
|---|---|---|
| `getSales()` (Sales sheet) | dashboard KPIs, customers metrics, P&L revenue | `Order` + `OrderItem` aggregations (group by product/customer/month). Indexes added in P1 (`Order.createdAt`, `(clientId,status,createdAt)`, `OrderItem.orderId/variantId`) directly support these. |
| `getInventory()` | inventory KPIs, shop stock | `ProductVariant.inventoryOnHand` + `InventoryBatch` rollups (already live via `listBatches`). |
| `getDistributorOrders()` (Orders/Expenses) | orders-expenses page | **No Postgres source yet** — these are *purchase/expense* records that only exist in Sheets. Needs a new `DistributorOrder`/`Expense` model + entry UI, OR keep on Sheets. Recommend: **keep distributor expenses on Sheets** for now (out of scope), migrate only *revenue/sales* analytics. |
| `getCompetitors()` | competitors page | Stays on Sheets (externally curated data; no transactional source). |

> **Key scoping decision:** P2-14 should target **sales/revenue analytics** (the genuinely hot
> dashboard/customers/P&L path) sourced from `Order`/`OrderItem`. Distributor expenses and
> competitor pricing have **no transactional Postgres origin** and should remain Sheets-backed.

## 4. Implementation steps

1. **Define the analytics contract.** Lock the exact shape `getSales()` returns today (read
   `lib/sheets.ts` `getSalesImpl` + how `lib/kpis.ts` consumes it) so the Postgres impl is a
   drop-in. Add a unit test asserting Postgres output matches the Sheets shape for a fixture.
2. **Write `lib/analytics/postgres.ts`.** Implement sales aggregation with Prisma `groupBy` /
   raw SQL:
   - revenue by month: `groupBy(orderId month)` over paid `Order`s.
   - by product: join `OrderItem` → `ProductVariant`.
   - by customer: group by `Order.clientId`.
   Use the P1 indexes; verify with `EXPLAIN` that the composite `(clientId,status,createdAt)`
   index is used.
3. **Source switch.** `lib/analytics/index.ts` reads `ANALYTICS_SOURCE`. Default `sheets` until
   validated, then `auto`, then `postgres`.
4. **Point pages at the new module.** Replace `import { getSales } from '@/lib/sheets'` with
   `import { getSalesAnalytics } from '@/lib/analytics'` in dashboard/customers/P&L. (Sheets
   module stays as the fallback impl.)
5. **Parity validation.** Run both sources for a date range and diff totals (revenue, order
   count, top products/customers). Tolerance for rounding only. Script:
   `scripts/analytics-parity-check.ts`.

## 5. Cutover & rollback

- Ship with `ANALYTICS_SOURCE=sheets` (no behavior change). Deploy.
- Flip staging to `auto`, run parity check, eyeball the dashboard.
- Flip prod to `auto` (Postgres-first, Sheets fallback) — **instant rollback = set back to
  `sheets`**, no redeploy needed (env var).
- After a stable period, set `postgres` to drop the Sheets dependency for sales.

## 6. Risks / watch-outs

- **Definition drift:** the Sheets "Sales" tab may include manual adjustments / non-Order
  revenue that Postgres doesn't have. Parity check will surface this; reconcile before cutover.
- **Order status semantics:** decide which `OrderStatus` values count as revenue (paid?
  fulfilled?). Must match how Sheets rows were entered.
- **Timezone:** month bucketing must match the Sheets convention (likely US/Eastern). Use a
  fixed tz in the SQL date_trunc.
- **Refunds/voids:** ensure voided/refunded orders are excluded consistently.

## 7. Estimate
~1 day contract + Postgres aggregations + tests, ~0.5 day parity script + reconciliation,
~0.5 day staged cutover. **~2 days** for sales analytics. (Distributor-expense and competitor
domains explicitly excluded.)
