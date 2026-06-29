# ACTIVE PLAN — Whole-Platform Performance Overhaul (June 2026)  [PLANNER]

> **Current source of truth.** Full-platform performance audit (admin + shop + storefront), grounded in a code audit across client rendering, the DB/API layer, and the JS bundle. Supersedes the earlier "Admin Backend Performance Analysis" (below), whose P0/P1 Sheets fixes are ✅ done. No code changed in this pass — analysis + prioritized remediation plan. **Awaiting user go-ahead** on which phase to execute.

---

## 🚨 INCIDENT — "still slow + freezes + no data" (Jun 4 2026) [EXECUTOR diagnosis]

User report after deploying P0–P2: *"no speed at all, it freezes, no data."* Triage selection: symptom = "loads eventually but very slow, then freezes"; migration applied = "not sure".

**Evidence gathered (live, read-only):**
- ✅ **Code IS deployed.** `peptsci.com` alias → deployment `dpl_DKLQ3nrLnqEaj1ELR6Tt9CsWkb9J`, created **Jun 2 22:55:39** (my push, commit `4ea08b1`), region `iad1`, aliases include `peptsci-dashboard-git-main`. Git→Vercel auto-deploy works.
- ❌ **NO Google Sheets env vars** in ANY environment (`vercel env ls`): missing `GOOGLE_SHEETS_SPREADSHEET_ID` + `GOOGLE_SHEETS_API_KEY` (`lib/config.ts:14-30`). → `fetchRange()` returns `[]` (`lib/sheets.ts:70-72`) → dashboard/customers/P&L/search/orders-expenses/competitors render **empty**.
- ❌ **NO Airtable env vars**: missing `AIRTABLE_API_KEY` + `AIRTABLE_BASE_ID` (`lib/airtable.ts:13-22`) → shop catalog **empty**.
- ⚠️ DB index migration `20260603010000_add_perf_indexes` **likely NOT applied** (user unsure; must hit `/api/admin/db/migrate`). → slow Postgres queries.
- ⚠️ Prod DB uses **RDS IAM auth** (PG* + AWS_ROLE_ARN set, no PGPASSWORD) — per-pool STS token mint adds cold-start latency; pool `max=20`.
- ⚠️ My RSC conversions (`/pricing`,`/inventory`,`/orders-expenses`) now fetch on the **server render** → if DB/Sheets slow → slow TTFB ("freeze"); `db()` throws if prisma null (`lib/inventory-batches.ts:53-57`).
- Public/edge routes fast: `/`,`/shop`,`/sf` → HTTP 307 in ~0.27–0.45s. Platform is NOT down; problems are behind auth in the data layer.

**Two distinct problems:**
1. **"No data" = missing prod config** (Sheets + Airtable creds), NOT a code regression. Fix = add env vars + redeploy, OR repoint those pages to Postgres if data now lives there.
2. **"Slow/freezes" = DB-path latency** = unapplied indexes + RDS IAM cold token + server-render blocking.

**PIVOTAL QUESTION for user:** Is the source of truth still Google Sheets/Airtable (legacy → just add the missing env vars), or has data moved to Postgres (then prod DB needs seeding/migration + pages repointed)? The repo shows an in-progress Sheets/Airtable → Postgres migration (`scripts/migrate-to-postgres.ts`, `scripts/seed*.ts`, new Prisma models).

**USER DECISION (Jun 4 2026):** Remove Google Sheets + Airtable entirely. Postgres becomes the sole source of truth, populated via the admin UI, CSV upload, and a Stripe backfill for historical sales. → See "RESOLUTION" below.

---

## ✅ RESOLUTION — Sheets/Airtable removed, Postgres is sole source of truth (Jun 4 2026) [EXECUTOR]

Implemented per the approved plan (`remove_sheets_and_airtable_49657eee.plan.md`). **All 12 plan to-dos complete; `tsc --noEmit`, `next build`, and `npm test` (96 tests, 0 fail) green.**

**What changed**
- **New Postgres models** (`prisma/schema.prisma`) + idempotent migration `20260604010000_add_sales_competitor_distributor`: `SalesRecord` (flat sales row; unique `orderId`/`stripePaymentIntentId`/`externalId` for dedup), `CompetitorPrice` (unique `competitorName,productName,dose`), `DistributorOrder` + `DistributorOrderLine`.
- **New Postgres-backed modules:** `lib/sales.ts` (`getSales`, `syncSalesRecordFromOrder`, `buildCostLookup`, `estimateUnitCost`), `lib/inventory.ts`, `lib/competitors.ts`, `lib/catalog.ts` (shop catalog from `Product`/`ProductVariant`), `lib/csv-coerce.ts` (shared coercion helpers). `lib/pricing.ts` Postgres-only (Sheets fallback dropped); `lib/orders.ts` reads `DistributorOrder`.
- **Sales ingestion (3 writers, 1 table):** (1) platform orders mirror into `SalesRecord` on capture via `reconcileOrderFromPaymentIntent` + one-time `scripts/backfill-sales-from-orders.ts` (`npm run backfill:sales`); (2) CSV importer `/api/admin/sales/import` + `lib/sales-import.ts` + dashboard "Import Sales" button; (3) Stripe backfill `/api/admin/sales/backfill-stripe` (connected account, dedup by PI id) + dashboard button.
- **Competitors + Distributor orders:** CSV parsers (`lib/competitor-import.ts`, `lib/distributor-order-import.ts`) + APIs + admin import buttons; competitors page/API and orders-expenses page/API repointed to Postgres.
- **Reusable UI:** `components/admin/CsvImportDialog.tsx` (template download, client-side preview/validation, validateOnly) wrapped by Sales/Competitor/Distributor import buttons.
- **Removed:** `lib/sheets.ts`, `lib/airtable.ts`, Sheets config in `lib/config.ts`, `GOOGLE_SHEETS_SETUP.md`, `docs/P2-14-*.md`, `scripts/migrate-to-postgres.ts`; `airtable` dep dropped; env-example/README scrubbed.
- **Tests:** test runner switched `ts-node/register` → `tsx` (resolves extensionless TS runtime imports under ESM; ts-node could not). Added `salesImport`, `competitorImport`, `distributorOrderImport` test suites.

**Deploy + data-load runbook (do in order)**
1. **Deploy** the branch (git push → Vercel auto-deploy, same as prior commits).
2. **Apply the new tables migration in prod:** `POST /api/admin/db/migrate` (admin-authenticated) — runs `20260604010000_add_sales_competitor_distributor` (idempotent `CREATE TABLE/INDEX IF NOT EXISTS`, safe to re-run). RDS IAM auth blocks the Prisma CLI, hence the runtime runner.
3. **Backfill historical sales from platform orders:** `npm run backfill:sales` (uses `.env.local`) — mirrors all captured `Order`s into `SalesRecord`. Idempotent (upsert by `orderId`).
4. **(Optional) Stripe backfill** for sales that predate platform orders: dashboard → "Backfill from Stripe" (date range). Dedups by `stripePaymentIntentId`, skips PIs already linked to platform orders. COGS uses the 35% fallback when product/vials are unknown (matches legacy behavior).
5. **Upload CSVs** for the rest: Products (admin UI), Pricing (admin UI), then Sales / Competitors / Distributor Orders via their "Import" buttons (each has a downloadable template). Inventory/catalog derive from `Product`/`ProductVariant`.
6. **Verify** dashboard/customers/P&L/search/competitors/orders-expenses show data and load fast (DB perf-index migration `20260603010000_add_perf_indexes` should also be applied via the same runner if not already).

**Note:** the missing-Sheets/Airtable-env "no data" failure mode is gone — there are no Sheets/Airtable code paths left. Remaining slowness, if any, is purely DB-path (ensure both migrations applied).

---

## 🧭 ROADMAP — "Make it comprehensive like EonPro" (Jun 21 2026) [PLANNER]

> Strategic gap analysis grounded in the current codebase (42 pages, 60 API routes, 25-model Prisma schema). EonPro (`logosrx.eonpro.io`) is referenced as the source of the FedEx-label + package-photo modules, implying a more mature **Rx / telehealth / pharmacy-ops** platform. EonPro's repo is NOT in this workspace, so the EonPro-specific items below are *inferred* from that domain and must be confirmed with the user before building.

### Current-state capability map (what already exists — strong base)
- **Identity/RBAC:** Clerk auth; `CLIENT / ADMIN / SUPER_ADMIN`; user status lifecycle; pending-approval gate; NPI-verified onboarding.
- **B2B core:** Clients (practices) w/ NPI registry snapshot, license/DEA/insurance docs, custom per-client pricing; Patients (ship-to); saved cards (Stripe).
- **Catalog/inventory:** Product/Variant (cost, SRP, supplier), inventory-on-hand + reorder level; **inventory batches** w/ BUD, batch#, Code128 barcode, label PDF, immutable batch event audit.
- **Orders/payments:** full order lifecycle, Stripe PaymentIntents + Connect, webhook idempotency (`WebhookEvent`), refunds status; FedEx labels + tracking writeback; package-photo proof-of-shipment.
- **White-label storefronts:** per-client subdomain, branding, storefront products + retail pricing, end-customer accounts (bcrypt), retail orders → auto-generate PeptSci orders.
- **Analytics:** SalesRecord, CompetitorPrice, DistributorOrder/Line; KPIs, P&L, balance sheet; CSV importers + Stripe backfill.
- **Ops:** AuditLog, Sentry, `/api/health`, CI, rate-limit util, structured logger, runtime migration runner.

### Gap analysis by domain (what "comprehensive" adds)
1. **Notifications (highest-leverage gap):** no transactional email/SMS anywhere. Need order/shipping/approval/payment-failure emails (Resend/SendGrid) + SMS (Twilio), templates, and a notification log. Abandoned-cart + review-request later.
2. **Background jobs / scheduling:** no queue or cron. Needed for emails, FedEx tracking polling (DELIVERED status), BUD/expiry alerts, reorder alerts, subscription runs, nightly reports. (Vercel Cron + a `Job`/outbox table, or QStash/Inngest.)
3. **Subscriptions / auto-refill / recurring orders:** none. Big revenue feature for both B2B reorders and storefront retail (Stripe subscriptions or scheduled order generation).
4. **Returns / RMA / cancellations / partial refunds UI:** only an inventory `RETURN` reason exists; no customer-facing or admin RMA workflow, no partial-refund UI, no restock flow.
5. **Telehealth / Rx workflow (likely EonPro's core):** no prescription intake, provider/prescriber review queue, e-sign, Rx approval gating, or lab/intake forms. If PeptSci must dispense to patients (not just sell B2B), this is the largest net-new domain. **Needs user confirmation.**
6. **Fulfillment depth:** single-carrier (FedEx). Add packing slips, pick/pack queue (the `/fulfillment` page exists — verify depth), batch label printing, end-of-day manifest, multi-carrier (USPS/UPS), address validation, and FEFO (expiry-first) batch allocation on order fulfillment.
7. **Inventory depth:** add lot/expiry-aware allocation, multi-location/warehouse, cycle counts, COGS valuation methods, low-stock + expiring-soon dashboards, and tie batch consumption to order fulfillment (currently batches and order fulfillment look loosely coupled).
8. **CRM / marketing:** no segmentation, campaigns, email automation, or customer timelines. Add a client/customer 360 view + lifecycle automations.
9. **Reporting / BI / accounting:** KPIs exist but no scheduled reports, CSV/PDF exports everywhere, cohort/retention, or **QuickBooks/Xero** export for sales + COGS + fees. Tax handling (TaxJar/Stripe Tax) is currently flat.
10. **Compliance / security hardening (regulated data):** HIPAA posture (BAA coverage for Clerk/Stripe/Resend/Vercel, PHI minimization — Patients table is PII), audit-log *viewer* + tamper-evidence, restricted Stripe keys, per-route rate-limit coverage, field-level encryption for sensitive docs, data-retention policy, and a documented DR/backup + RPO/RTO plan.
11. **Search / UX scale:** add the optional `pg_trgm` indexes (already scripted), saved table views, bulk admin actions, command-palette coverage, and pagination/virtualization on the remaining large lists.
12. **Quality gates:** broaden test coverage toward the ≥85% target (importers/finance are covered; orders, checkout, fulfillment, webhooks, RBAC need integration tests), add E2E (Playwright) for the critical money paths, and load testing.
13. **Patient/customer portal depth:** order tracking timeline, reorder-in-one-click, document upload, messaging.
14. **AI (per project rules, responsibly):** product Q&A/assistant, demand forecasting for reorder levels, anomaly detection on sales/fraud, support-ticket triage — all with PHI/PII anonymization before any third-party model.

### Suggested phasing (each independently shippable, TDD where logic changes)
- **P0 — Operational backbone (unblocks everything):** transactional email+SMS + notification log; background-job/outbox + Vercel Cron; FedEx tracking poller → DELIVERED; expiring-BUD + low-stock alerts.
- **P1 — Revenue + correctness:** subscriptions/auto-refill; returns/RMA + partial refunds; FEFO batch allocation tied to fulfillment; Stripe Tax; QuickBooks export.
- **P2 — Growth + scale:** CRM/customer-360 + marketing automation; reporting/BI + scheduled reports; search/UX scale; E2E + load tests; AI assist features.
- **P3 — New domain (only if confirmed):** telehealth/Rx intake + prescriber review + e-sign + dispensing compliance.

### Open questions for the user (calibrate scope before building)
- What does EonPro actually do that PeptSci lacks (telehealth/Rx? subscriptions? CRM? multi-pharmacy)? Can we get read access to its repo/feature list?
- Does PeptSci need to handle **prescriptions / dispense to patients**, or stay **B2B distribution + white-label retail**? (Determines whether P3 exists and the entire compliance surface.)
- Which outcome matters most next quarter: revenue (subscriptions/RMA), trust/compliance (HIPAA/audit), or growth (CRM/marketing)?

### ✅ DECISIONS (Jun 21 2026)
- **Scope locked: B2B distribution + white-label retail only. NO patient Rx/telehealth.** → P3 (Rx domain) is OUT. Compliance stays at PII/PCI + standard SOC2-style hygiene; no PHI/dispensing surface.
- **Priority: P0 operational backbone first** (notifications, background jobs/cron, alerts).
- **EonPro repo: user will add it to the workspace** so P0 patterns can be matched to EonPro's implementation before/while building. Until it lands, P0 design below is the working baseline.

### P0 — Operational backbone (detailed plan, pending provider confirm + EonPro repo)
**Goal:** the platform can reliably *talk to people* and *do scheduled work*. Everything downstream (subscriptions, RMA, alerts) depends on this.

1. **Notification service + log**
   - New `Notification` model (channel email|sms, template, to, payload JSON, status QUEUED|SENT|FAILED, providerId, error, dedupeKey, timestamps) — mirrors `WebhookEvent` for idempotency/audit.
   - `lib/notifications/` with a provider-agnostic `send()` + templates. Email via **Resend** (recommended) or SendGrid; SMS via **Twilio** (Twilio plugin available in this workspace).
   - Wire transactional triggers: order submitted/approved/rejected, payment captured/failed, label created (tracking #), shipment delivered, client approved, low-stock/expiry (see #3).
2. **Background jobs / outbox + scheduler**
   - `Job`/outbox table (type, payload, runAt, status, attempts, lastError) drained by an internal worker route; **Vercel Cron** triggers (`vercel.json`) on a schedule. (Alt: Inngest/QStash if EonPro uses one.)
   - Notifications enqueue to the outbox so a failed email/SMS retries with backoff instead of blocking the request path.
3. **Scheduled jobs (first set)**
   - FedEx tracking poller → update `Order.shippingStatus` to DELIVERED + fire delivered notification.
   - Expiring-BUD scan (InventoryBatch.bud within N days) → admin alert.
   - Low-stock scan (ProductVariant.inventoryOnHand ≤ reorderLevel) → admin reorder alert.
   - Nightly KPI/sales digest email to admins (optional).
4. **Success criteria:** sending is idempotent + logged; a provider outage degrades gracefully (queued + retried, request still succeeds); cron runs visible in the Notification/Job logs; tsc + build + tests green; admin can see a notification/job log.

**Provider/infra decisions still needed:** email provider (Resend vs SendGrid), SMS (confirm Twilio), scheduler (Vercel Cron vs Inngest/QStash), and whether to match EonPro's exact stack once its repo is in the workspace.

### 🔎 EonPro reference located + analyzed (Jun 28 2026)
GitHub org `eonpro`. Cloned two references next to the repo (shallow, outside the PeptSci git tree):
- **`../eonpro-fulfillment`** (repo `eonpro/fulfillment-platform`) — **THE north star.** Same stack as PeptSci (Next.js 16 + Prisma 7 + Clerk + pg + Stripe + FedEx), multi-tenant **fulfillment ops** platform, **no Rx**. Its schema/libs are the concrete blueprint for PeptSci's "comprehensive."
- **`../eonpro-mono`** (repo `eonpro/eonpro`) — large **HIPAA telehealth** platform (Zoom, DoseSpot e-Rx, Twilio chat). Mostly **out of scope** (no Rx) except backbone ideas.
- Other org repos for reference only: `pharmax` (Rx fulfillment), `logosrx-website`, `logos-rx-invoicing`, `weightlossintake`, several intake/checkout apps.
- ⚠️ `~/Downloads/EonPro.txt` contains a live "Primary Sub Key" secret — recommend deleting + rotating.

**EonPro's actual backbone patterns (to mirror, not telehealth):**
- **Notifications:** `Notification` + `NotificationPreference` models; `lib/services/notification.service.ts` writes a DB row, sends **AWS SES** email (`lib/email/*`) + **Twilio** SMS (`lib/sms/*`), and fires an optional outbound **webhook** — all non-blocking (`.catch`). A `notification-bell` UI component.
- **Events:** lightweight **in-process event-bus** (`lib/events/event-bus.ts`, typed `DomainEvent` union + `on/emit`, ring-buffer audit) + `subscribers.ts` — NOT a durable queue.
- **Scheduling:** cron routes guarded by `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron). Example: `api/tracking/poll` iterates active shipments, calls FedEx, updates status + writes `ShipmentEvent`, emits notifications. Also `api/reports/send-weekly`.
- **Storage:** AWS S3 (`lib/integrations/aws/*`) for labels/photos.

### Feature gaps PeptSci ← fulfillment-platform (the real "comprehensive" list)
1. **Notifications backbone** (email SES + SMS Twilio + Notification model + bell + prefs + webhooks). ← P0
2. **Cron/event backbone** (`CRON_SECRET` routes + in-process event-bus + subscribers). ← P0
3. **FedEx tracking poller** → Shipment status timeline (`Shipment` + `ShipmentEvent`) + delivered notifications. ← P0
4. **Returns / RMA** (`ReturnRequest`/`ReturnItem`, RMA #, status workflow, restock endpoint). ← P1
5. **Billing & invoicing** (`BillableEvent`, `Invoice`/`InvoiceLineItem`, billing.service, invoice PDF, public `/pay/[invoiceId]` Stripe page). ← P1
6. **Warehouse ops**: `FulfillmentTask` queue + kanban board, `PickList`/`PickListItem`, `PackVerification`, batch label printing, packing-slip PDF, richer order status (`NEW→NEEDS_REVIEW→READY_TO_PICK→PICKED→PACKED→LABEL_CREATED→SHIPPED→DELIVERED→EXCEPTION/HOLD`) + `OrderDisposition`. ← P1/P2
7. **Inventory reservations**: `InventoryRecord` (onHand/reserved/reorderPoint/bin/lastCounted) + `InventoryTransaction` ledger (RESERVED/RELEASED/SHIPPED…). ← P1
8. **Shipping intelligence**: rules-engine, rate-shop, order-router, address validation/autocomplete, service recommend. ← P2
9. **Channel integrations**: WooCommerce + Shopify sync (`IntegrationConnection`, `SyncJob`, webhooks). ← P2 (if PeptSci sells via external channels)
10. **Reporting/BI**: weekly report email, demand-forecast, SLA service + `/api/sla`, ExcelJS export everywhere. ← P2
11. **Public self-service tracking page** `/tracking/[trackingNumber]`. ← P1
12. **Resilience/ops**: circuit-breaker, rate-limiter coverage, feature-flags, cache, observability, tenant-context isolation. ← cross-cutting

### ✅ RESOLVED P0 stack (match EonPro)
- **Email = AWS SES** (`@aws-sdk/client-ses`; PeptSci already uses AWS SDKs + RDS IAM). **SMS = Twilio** (`twilio`). **Scheduler = Vercel Cron + `CRON_SECRET`-guarded routes.** **Events = in-process event-bus** (port `lib/events`), not a queue. Storage stays on existing `lib/storage.ts` (add S3 later if needed).
- **P0 build order (modeled on fulfillment-platform):**
  1. Port `lib/events/event-bus.ts` (typed PeptSci `DomainEvent`s: ORDER_SUBMITTED/APPROVED/REJECTED, PAYMENT_CAPTURED/FAILED, LABEL_CREATED, SHIPMENT_DELIVERED, LOW_STOCK, BUD_EXPIRING, CLIENT_APPROVED).
  2. `Notification` + `NotificationPreference` Prisma models + idempotent migration; notification-bell + `/api/notifications` (list/markRead/unread-count).
  3. `lib/email` (SES + templates) + `lib/sms` (Twilio) + `lib/services/notification.service.ts`; wire emits from existing order/payment/label paths (reuse `reconcileOrderFromPaymentIntent`, label creation).
  4. `CRON_SECRET`-guarded cron routes + Vercel `vercel.json` crons: `api/cron/tracking-poll` (FedEx → Order.shippingStatus DELIVERED + notify), `api/cron/inventory-alerts` (low-stock + expiring-BUD), optional nightly KPI digest.
  5. TDD for pure bits (event-bus, template rendering, status mapping); tsc + build + tests green; admin notification log/bell visible.
- **New env/infra:** `CRON_SECRET`, SES creds/verified sender (or reuse IAM role), `TWILIO_*`. Confirm SES sender domain + Twilio number exist before wiring sends.

### ⚠️ BASELINE CORRECTION (Jun 28 2026) — P0 IS ALREADY BUILT
On inspecting the actual repo (my roadmap notes were stale), PeptSci has **already ported the entire P0 backbone from eonpro/eonpro**:
- **Notifications:** `Notification` model + `NotificationCategory`/`NotificationPriority` enums (with `(userId,sourceType,sourceId)` dedup); `lib/notifications/service.ts` (create/notifyAdmins/notifyUser, pagination, unread count, mark/archive/cleanup); `components/NotificationBell.tsx`; `lib/__tests__/notifications.test.ts`.
- **Email:** `lib/email/client.ts` = AWS **SES v2** sender gated by `EMAIL_ENABLED` (no-op + log when off — exactly the provider-agnostic pattern), `lib/email/index.ts` intent senders + templates (welcome, partner approved/rejected/needs-info).
- **Cron:** `vercel.json` → `/api/cron/fedex-tracking` (hourly), `/api/cron/low-stock` (daily), `/api/cron/expiring-batches` (daily); guarded by `verifyCronAuth` (`lib/cron/auth.ts`, `CRON_SECRET`).
- **FedEx/shipping:** `lib/fedex.ts`, `lib/fedex-services.ts`, `lib/shipping/fedex-status.ts`, `lib/shipping/fedex-tracking-poller.ts` (writes status back to Order + notifies admins on delivery), `components/shipping/FedExLabelModal.tsx`, label/rate API routes. `Order` already carries `carrier/trackingNumber/trackingUrl/shippingStatus/shippedAt`; `ShipmentLabel` + `PackagePhoto` models exist.
- **Order workflow:** richer than fulfillment-platform on the approval side (`DRAFT→SUBMITTED→UNDER_REVIEW→AWAITING_DOCUMENTS→APPROVED→REJECTED→FULFILLED→SHIPPED→COMPLETED→CANCELLED`).
→ **Conclusion:** P0 is DONE. Do NOT rebuild. The remaining work is the P1/P2 feature surface below.

### ✅ ACCURATE remaining gaps vs `eonpro/fulfillment-platform`
| # | Gap | Notes / scope | Needs new account? |
|---|-----|---------------|--------------------|
| A | **Customer-facing shipment emails** (shipped / delivered / exception) | PeptSci notifies *admins in-app* only; templates today are partner-onboarding only. Reuse existing SES + poller. | No (SES already wired) |
| B | **Public self-service tracking page** `/tracking/[trackingNumber]` | Customer/clinic looks up status without login. | No |
| C | **SMS notifications (Twilio)** | Entirely absent. Layer onto notification triggers. | Yes (Twilio) |
| D | **Returns / RMA** | `ReturnRequest`/`ReturnItem`, RMA #, status workflow, restock. Absent. | No |
| E | **Inventory reservations + ledger** | Has `InventoryBatch`; lacks reserved/available split + RESERVED/RELEASED/SHIPPED transactions tied to orders. | No |
| F | **Warehouse pick/pack ops** | PickList, PackVerification, fulfillment task kanban, batch label print, packing-slip PDF. | No |
| G | **Billing & invoicing** | `BillableEvent`/`Invoice` + invoice PDF + public `/pay/[invoiceId]`. NOTE: separate repo `eonpro/logos-rx-invoicing` exists — confirm before duplicating. | No |
| H | **Reporting/BI** | Weekly report email, demand forecast, SLA tracking, ExcelJS exports. | No |
| I | **Per-recipient NotificationPreference + outbound webhooks** | Channel prefs + partner webhooks. | No |

**Recommended next increment (no new account, clearly in-scope, high value):** A + B together — customer shipment emails wired into the existing FedEx poller/label flow, plus a public tracking page. Then D (Returns) or E (inventory reservations). C (SMS) once Twilio creds exist. Confirm G against the separate invoicing repo first.

### ✅ DONE — Gap A + B (Jun 28 2026)
- **A. Customer shipment emails** (reuse existing SES, no new env):
  - `lib/email/templates.ts`: `orderShippedEmail` / `orderDeliveredEmail` / `orderExceptionEmail` (branded, PHI-free, CTA → public tracking page) + `ShipmentEmailOpts`, `detailPanel()` helper.
  - `lib/email/index.ts`: `sendOrderShippedEmail` / `sendOrderDeliveredEmail` / `sendOrderExceptionEmail` (fire-and-forget; no-op when `EMAIL_ENABLED!==true`).
  - **Triggers:** label creation route emails "shipped" to `client.contactEmail`; FedEx poller emails "delivered" + "exception" on transition, and now also alerts admins on EXCEPTION (HIGH). Admin notif dedup keys made per-status (`${orderId}:DELIVERED` / `:EXCEPTION`).
- **B. Public tracking page** (`/tracking` + `/tracking/[trackingNumber]`, added to middleware `isPublicRoute`):
  - `lib/shipping/tracking.ts` `getPublicTracking()` — returns ONLY order #, carrier, tracking #, status, shippedAt (no PII).
  - `lib/shipping/fedex-status.ts`: pure `describeShippingStatus` / `trackingTimeline` / `isExceptionStatus` / labels.
  - Branded result page with status timeline + carrier deep-link; standalone lookup form; `noindex`.
- **Tests:** extended `fedexStatus.test.ts` (timeline/labels/exception) + new `shipmentEmails.test.ts`. `npm test` 130 pass, `tsc --noEmit` clean, `next build` green.
- **No new env required.** Customer emails simply start flowing once `EMAIL_ENABLED=true` + verified SES sender (already the email gate). Tracking links use `NEXT_PUBLIC_APP_URL`.

### ✅ DONE — Gap D: Returns / RMA (Jun 28 2026)
- **Schema:** `ReturnRequest` + `ReturnItem` models with `ReturnStatus` (REQUESTED→…→CLOSED) + `ReturnItemCondition` (GOOD/DAMAGED/MISSING) enums; back-relations on `Order`/`Client`/`OrderItem`/`ProductVariant`. Idempotent SQL migration `20260628010000_add_returns_rma` (no DO blocks — matches runner's `;`-splitter; CREATE TYPE re-runs ignored as "already exists"). Probe in `/api/admin/db/migrate` extended for the two new tables.
- **Pure core** (`lib/returns/core.ts`, fully unit-tested): `formatRmaNumber` (`RMA-YYYYMMDD-NNN`), `canTransition`/`nextStatuses` state machine (CLOSED reachable from any non-terminal, CLOSED terminal), `isRestockEligible` (GOOD + RECEIVED/INSPECTED + not-yet-restocked).
- **Service** (`lib/returns/service.ts`): `createReturnRequest` (resolves order/client, per-day RMA seq with unique-collision retry, notifies admins → `/returns/{id}`), `updateReturnStatus` (transition-validated, stamps approved/received/closed timestamps), `restockReturnItems` (per-item tx: `inventoryOnHand += qty` + `InventoryAdjustment{reason:RETURN, orderId}` + mark restocked; idempotent; auto-advances to RESTOCKED), `listReturnRequests`/`getReturnRequest`.
- **API (admin-gated):** `GET/POST /api/admin/returns`, `GET/PATCH /api/admin/returns/[id]`, `POST /api/admin/returns/[id]/restock`, `GET /api/admin/returns/order-lookup` (resolves order → returnable line items with variant linkage).
- **UI:** `/returns` list (status tabs + New Return dialog: order lookup → pick items/qty/condition → submit) and `/returns/[id]` detail (items, workflow timeline, status-advance Select limited to valid transitions, refund input on REFUNDED, Restock button). Nav link added to `AdminHeader`; `/returns(.*)` added to middleware `isAdminRoute`.
- **Tests:** new `lib/__tests__/returns.test.ts`. `npm test` 138 pass, `tsc --noEmit` clean, `next build` green.
- **Deploy note:** run `POST /api/admin/db/migrate { "confirm": true }` once in prod to create the two tables (Prisma CLI can't reach RDS).

### ✅ DONE — Gap E: inventory reservations + ledger (Jun 28 2026)
- **Schema:** `ProductVariant.inventoryReserved Int @default(0)` + `InventoryReservation` model (order+variant, qty, `ReservationStatus` ACTIVE/RELEASED/CONSUMED, `@@unique([orderId, variantId])`) with back-relations on `Order`/`OrderItem`/`ProductVariant`. Idempotent migration `20260628130000_add_inventory_reservations` (`ADD COLUMN IF NOT EXISTS`, `CREATE TYPE`, FKs). Probe extended (table + column).
- **Model:** availability for new orders = `inventoryOnHand − inventoryReserved`. Reserving bumps the reserved counter only (on-hand untouched); fulfillment frees reserved while the existing batch consume drops on-hand → no double count.
- **Pure core** (`lib/inventory/reservations-core.ts`, unit-tested): `availableQty`, `isOversold`, `canReserve`, reservation transition rules, `aggregateByVariant`.
- **Service** (`lib/inventory/reservations.ts`): `reserveForOrder` (idempotent, aggregates lines per variant, txn-safe counter), `releaseForOrder`/`consumeForOrder` (close ACTIVE → RELEASED/CONSUMED, decrement counter), `getVariantAvailability`, `getOrderReservations`, `listActiveReservations`.
- **Wiring (all non-blocking):** reserve on B2B capture (`reconcileOrderFromPaymentIntent`) + storefront order creation (`createRetailOrder`); release on `charge.refunded`; consume at fulfillment (order label PDF `?consume=true`). `getInventory()` now nets reserved out of `InventoryAvailable` and adds `OnHand`/`Reserved`. New `GET /api/admin/inventory/reservations`.
- **Decision:** reservation is non-blocking (allows oversell, surfaced as negative available / `isOversold`) so unmaintained stock counts never block checkout; `canReserve` is shipped for future hard enforcement.
- **Tests:** new `lib/__tests__/reservations.test.ts`. `npm test` 147 pass, `tsc --noEmit` clean, `next build` green.
- **Deploy note:** run `POST /api/admin/db/migrate { "confirm": true }` once in prod to add the column + table.

### ✅ DONE — Gap F: warehouse pick/pack ops (Jun 28 2026)
- **Schema:** `OrderFulfillment` 1:1 with `Order` (`stage` `FulfillmentStage` NOT_STARTED/PICKING/PICKED/PACKED, `pickedAt/pickedById`, `packedAt/packedById`, `verifiedItems` Json snapshot, `notes`) + `Order.fulfillment` back-relation. Idempotent migration `20260628140000_add_order_fulfillment` (`CREATE TYPE`, `CREATE TABLE IF NOT EXISTS`, unique on `orderId`, FK cascade). Probe extended (`orderFulfillmentTable`).
- **Pure core** (`lib/fulfillment/pick-list-core.ts`, unit-tested): `planLineDraws` (FIFO oldest-BUD-first, ties by batch #, carries BUD through) + `buildPickList` (aggregates repeated variants, totals units/shortfall, `fullyAllocatable`). Dependency-free; mirrors `planAllocation`.
- **Service** (`lib/fulfillment/service.ts`): `buildOrderPickList` (order items → variant/product + `allocatableBatchesForVariants` → pick list), `buildPackingSlipData`, `getOrderFulfillment`, `advanceFulfillment(orderId, 'pick'|'pack'|'reset', userId, verifiedItems?)` (idempotent upsert).
- **PDFs** (`lib/fulfillment/pdf.ts`, pdf-lib + Standard-14, serverless-safe): `generatePickListPdf` (per-line batch draws, shortfall flagged in red, picker sign-off) + `generatePackingSlipPdf` (customer-facing, ship-to + qty only, no prices, RUO footer).
- **APIs:** `GET /orders/[id]/pick-list` (JSON), `GET /orders/[id]/pick-list/pdf`, `GET /orders/[id]/packing-slip/pdf`, `GET|POST /orders/[id]/fulfillment` (advance stage). Orders list now returns `fulfillmentStage`.
- **UI:** fulfillment page shows a stage badge + per-order Pick List / Packing Slip PDF downloads and Mark Picked → Mark Packed → Reset actions. Physical stock still consumed via the order-labels `?consume=true` path; pick/pack only records who/when + verification.
- **Tests:** new `lib/__tests__/pickList.test.ts`. `npm test` 154 pass, `tsc --noEmit` clean, `next build` green.
- **Deploy note:** run `POST /api/admin/db/migrate { "confirm": true }` once in prod to add the `OrderFulfillment` table.

---

## Background and Motivation
The platform "feels extremely slow and drags." The earlier effort fixed the Google Sheets data layer (in-process TTL cache, killed dashboard cache-busting, RSC for dashboard/P&L, RDS token cache). But the slowness is now **platform-wide** because most non-fixed surfaces share the same anti-patterns: client-only pages that fetch-after-mount behind spinners, cache-busted `no-store` fetches, a 60 s poll, eager heavy bundles (recharts/jspdf), missing DB indexes + N+1 queries, and full-catalog/full-history loads to render one row.

## Diagnosis — root causes by layer (grounded in code audit, file:line)

### A. Client rendering / data fetching (biggest perceived-latency driver)
1. **~20 routes are `'use client'` + fetch-in-`useEffect` + skeleton** (no SSR): pricing (`pricing/page.tsx:1,56`), inventory (`inventory/page.tsx:1,72`), orders-expenses (`orders-expenses/page.tsx:1,71`), products (`products/page.tsx:1,100`), clients (`clients/page.tsx:42`), storefronts, fulfillment, users, shop account/orders, all `shop/storefront-manage/*`, `sf/account/orders`. Every visit = blank shell → JS hydrate → round trip → render.
2. **Cache-busting `no-store` fetches** defeat all caching: `pricing/page.tsx:23` `/api/prices?t=${Date.now()}`, `inventory/page.tsx:58`, `orders-expenses/page.tsx:54`.
3. **60 s poll, not tab-gated:** `pricing/page.tsx:61` re-pulls the full price list every minute on every open tab.
4. **Duplicate child fetches:** `shop/account` loads profile, then `PatientsManager` (`:39`) + `SavedCards` (`:50`) each re-fetch on mount → 3 serial round trips.
5. **Context values rebuilt every render:** `CartContext.tsx:154` and `StorefrontContext.tsx:153` recreate `value` (+ derived totals) each render → re-render the whole shop/sf subtree.
6. **Heavy derivations in render w/o memo:** `DashboardClient.tsx:69` (groupByProduct/Customer/MoM), `GroupedRecentOrdersTable.tsx:33`.
7. **Big lists, no virtualization/pagination:** inventory batches, product variants, orders-expenses, shop `ProductGrid`, `StorefrontCatalog`.
8. **`<img>` (not `next/image`)** in storefront catalog/detail/shell; `unoptimized` on package-photo + shop order images.

### B. DB / API layer
9. **Missing indexes** on hot filter/sort columns: `Order(orderNumber)`, `Order(clientId,status,createdAt)`, `User(clientId)`, `ProductVariant(status)`, `OrderItem(orderId)`, `ProductVariant(productId)`, `InventoryBatch(createdAt)`. (schema in `prisma/schema.prisma`.)
10. **N+1 / sequential queries:** order-label PDF `for (item of items) await allocatableBatchesForVariant()` (`api/admin/orders/[id]/labels/pdf/route.ts:42`) + per-draw `$transaction` (`:84`); CSV import 2–4 queries/row (`api/admin/products/import/route.ts:89`); client status cascade = 1 Clerk call/user (`api/admin/clients/[id]/route.ts:140`).
11. **Full dataset → filter in JS:** shop product page loads the **entire** catalog + client price map to find one SKU (`shop/product/[sku]/page.tsx:72`, `shop/page.tsx:12`); `pricing.ts:160` full catalog for one SKU; `pricing.ts:98` double-fetches (getPricing + clientPricing).
12. **Unbounded `findMany` (no `take`):** `pricing.ts:42`, admin clients/products/client-pricing, shop patients.
13. **Duplicate `auth()` per request:** `requireAuth()` + `getUserMetadata()`/`getRole()` each call Clerk `auth()` separately (clinic + admin/storefronts routes).
14. **`force-dynamic` everywhere** (53/54 API routes + 3 layouts + shop/sf pages) and **no `revalidate`/`unstable_cache`** anywhere → zero HTTP/data caching layer.
15. **Inline heavy sync work in request path:** PDF generation (`lib/labels/peptsciLabelPdf.ts`), 10 MB photo base64-in-DB fallback (`api/admin/package-photos/route.ts:115`).

### C. Bundle / build / config
16. **No `experimental.optimizePackageImports`** (lucide-react ~120+ icons across 68 files, date-fns, recharts, radix) and **no `compiler.removeConsole`** in `next.config.mjs`.
17. **Zero `next/dynamic` in the whole repo** — recharts ships eagerly on dashboard (`DashboardCharts.tsx`) + competitors; jspdf+autotable eager on po-generator (`po-generator/page.tsx:17`); FedEx/Receive modals + cmdk `SearchCommand` (on every admin page header) eager.
18. **Client graph pulls server libs:** `DashboardClient.tsx:4` imports runtime `lib/kpis` → drags `date-fns-tz`; several client files value-import types from `lib/sheets` instead of `import type`.
19. **Unused deps shipped/installed:** `jotai` (unused), `@radix-ui/react-navigation-menu|tabs|tooltip` (unused); orphaned `InventoryChart.tsx` still importing recharts.
20. **Render-blocking Adobe Typekit `<link>`** in root `app/layout.tsx:20` (no `next/font`, no `display=swap`).

## High-Level Task Breakdown (prioritized, each independently shippable, TDD where logic changes)

### P0 — Quick, high-impact, low-risk (hours; biggest perceived speedup)
- **P0-1 Bundle config:** add `optimizePackageImports` (lucide/date-fns/recharts/radix) + `compiler.removeConsole` to `next.config.mjs`; remove unused deps (`jotai`, 3 radix) + orphaned `InventoryChart.tsx`. **Success:** prod build first-load JS drops; build green.
- **P0-2 Kill cache-busting + tame poll:** remove `?t=Date.now()`/`no-store` on pricing/inventory/orders-expenses; remove or 5-min + visibility-gate the pricing poll (match `DashboardClient`). **Success:** repeat loads cache-served; no per-minute full pulls.
- **P0-3 Lazy heavy chunks:** `next/dynamic` for `DashboardCharts`, `CompetitorChart`, `po-generator` jspdf (import in handler), `SearchCommand`/cmdk, FedEx + Receive modals. **Success:** dashboard/admin first-load JS drops; charts/modals load on demand.
- **P0-4 Memoize context + derivations:** `useMemo` the `value` in `CartContext`/`StorefrontContext`; memoize Dashboard KPI derivations + recent-orders grouping. **Success:** typing/nav in shop & dashboard stops re-rendering whole tree.

### P1 — Server-render + index the hot paths (1–2 days)
- **P1-5 Add DB indexes** (#9) via a Prisma migration; apply to prod via the runtime runner `/api/admin/db/migrate` (RDS IAM — CLI can't reach prod, see Lessons). **Success:** `migrate status` clean; order/list queries use indexes.
- **P1-6 Fix N+1s** (#10): single `inventoryBatch.findMany({ where: { variantId: { in } } })` for labels + one batched `recordLabelsPrinted` tx; batch CSV import lookups. **Success:** label route makes O(1) batch queries; unit tests green.
- **P1-7 Single-SKU fetch** for shop product page + `getProductPriceBySku` (don't load full catalog). **Success:** `/shop/product/[sku]` no longer scans the whole catalog.
- **P1-8 Convert client pages → RSC islands:** pricing, inventory, orders-expenses (then products/clients/storefronts): fetch server-side, pass seed to a thin client island (pattern already used by dashboard/P&L). **Success:** these pages paint data at TTFB, no first-paint spinner.
- **P1-9 De-dupe `auth()`:** one `getAuthContext()` helper returning `{ userId, role, status, clientId }` per request. **Success:** ≤1 Clerk `auth()` per request on dual-call routes.

### P2 — Structural (multi-day)
- **P2-10 Paginate/virtualize** large admin + catalog lists (server pagination or `@tanstack/react-virtual`).
- **P2-11 Add a caching layer:** `unstable_cache`/`revalidate` (or short TTL) for read-heavy Postgres reads (pricing catalog, products, clients); remove redundant `force-dynamic` (esp. layout-level) where not needed.
- **P2-12 `next/image` + fonts:** replace storefront `<img>`, drop `unoptimized`, add image `formats`/`minimumCacheTTL`; move Typekit to `next/font` or async load.
- **P2-13 Offload heavy request-path work:** ensure label/photo/PDF/import paths are bounded; move 10 MB photos off base64-in-DB to blob; consider background/queue for import.
- **P2-14 (carried from prior plan) Migrate hot analytics Sheets→Postgres** so dashboard/customers/P&L read indexed Postgres at request time.

## Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| Audit | Whole-platform perf audit (client + DB + bundle), file:line | ✅ |
| P0-1 | Bundle config + remove unused deps | ✅ `next.config.mjs` (optimizePackageImports + removeConsole + image formats); removed `jotai` + 3 unused radix (`npm i` dropped 13 pkgs); deleted orphaned `InventoryChart.tsx` |
| P0-2 | Kill cache-busting + tame pricing poll | ✅ pricing/inventory/orders-expenses fetch w/o `?t`/`no-store` on mount (force only on manual refresh + mutations); pricing poll 60s→5min + visibility-gated |
| P0-3 | Lazy heavy chunks (recharts/jspdf/cmdk/modals) | ✅ `next/dynamic` for DashboardCharts (ssr:false), FedEx + Receive modals; jspdf deferred to PO export handler; SearchCommand/cmdk lazy + mount-on-first-open. (CompetitorChart still eager — server-page, ssr:false N/A → P1) |
| P0-4 | Memoize context + dashboard derivations | ✅ `useMemo` value in Cart/Storefront context; memoized Dashboard KPI/derivations + GroupedRecentOrdersTable grouping |
| P0-verify | Build + tests | ✅ `next build` green (exit 0); /dashboard 128kB, /po-generator 152kB (recharts/jspdf out of initial); 79/79 tests pass |
| P1-5 | Add DB indexes (migration + prod apply) | ✅ schema `@@index` added (User.clientId, ProductVariant.status/productId, Order orderNumber/createdAt/stripeChargeId + composite clientId,status,createdAt, OrderItem orderId/variantId, InventoryAdjustment variantId/orderId, InventoryBatch.createdAt, AuditLog userId/orderId/(entity,entityId), RetailOrder(storefrontId,createdAt)); idempotent migration `20260603010000_add_perf_indexes` (CREATE INDEX IF NOT EXISTS, Prisma-canonical names); client regenerated. **PROD APPLY PENDING:** deploy + admin `POST /api/admin/db/migrate {confirm:true}` |
| P1-6 | Fix N+1s | ✅ order-label PDF: `allocatableBatchesForVariants` (1 query for all line items) + `recordLabelsPrintedMany` (1 tx for all draws). CSV import per-row loop deferred to P2 (infrequent admin path) |
| P1-7 | Single-SKU fetch (shop product page) | ✅ `getShopProductBySku` + `getRelatedShopProducts` (category-scoped) → product page no longer maps the whole catalog (full-catalog fuzzy match kept as fallback); `getProductPriceBySku` now single indexed variant query |
| P1-8 | Convert client pages → RSC islands | ✅ `/pricing`, `/inventory`, `/orders-expenses` now server-render data (`getPricing`/`listBatches`/`getDistributorOrders`) and seed a `*Client` island → no first-paint skeleton, no client mount round-trip. Manual refresh + visibility-gated poll preserved. All three are now `ƒ` (server-rendered on demand); admin migration helper added at `scripts/apply-prod-migrations.sh` |
| P1-9 | De-dupe auth() per request | ❌ SKIPPED — Clerk `auth()` is already request-scoped and `cache()` doesn't dedupe across route handlers; high churn, negligible gain |
| P1-comp | Lazy-load CompetitorChart | ✅ `CompetitorChartLazy` client wrapper (`next/dynamic` ssr:false) → recharts off `/competitors` initial load |
| P1-verify | Build + tests | ✅ `next build` green; 79/79 tests pass |
| P2-10 | Paginate/virtualize large lists | ✅ ASSESSED — no churn needed: shared `DataTable` (TanStack) already client-paginates (pageSize 10); raw-table pages (inventory ≤200 server cap, orders-expenses small Sheets set, pricing grouped cards) are bounded. Catalog scale (dozens–hundreds of SKUs) doesn't warrant react-virtual yet. Revisit if a list exceeds ~1k rows |
| P2-11 | Caching layer + trim force-dynamic | ✅ Airtable catalog now `unstable_cache` (revalidate 300s, tag `catalog`, bust via `revalidateTag`/`POST /api/revalidate?tag=catalog`) — public shop no longer re-hits the slow rate-limited Airtable API every render. Sheets reads already in-process TTL-cached (60s) + `fetch next.revalidate 300`. Decided NOT to cache `getPricing` Postgres read (single indexed query, already fast; caching would add inventory staleness for negligible gain). Dashboard layout `force-dynamic` kept (auth-required, can't be static anyway) |
| P2-12 | next/image + fonts | ✅ Typekit stylesheet now preceded by `preconnect`/`dns-prefetch` to `use.typekit.net` + `p.typekit.net` (parallel TLS/DNS → faster FCP/LCP on this render-blocking font). `<img>`/`unoptimized` cases are user-supplied arbitrary-host or base64-via-API sources → defer optimization to P2-13 when hosting is controlled (avoids broken images / over-broad remotePatterns) |
| P2-13 | Offload heavy request-path work | 📋 RUNBOOK READY — `docs/P2-13-package-photos-s3.md`. Decision: **AWS S3**. Key insight: `lib/storage.ts` already abstracts blob/inline drivers + schema has `blobUrl`/`imageBase64` cols → additive S3 driver + idempotent backfill (`scripts/backfill-media-to-s3.ts`), reversible via env. ~1.5d. Implement next session (needs S3 bucket/IAM + can't be tested from here) |
| P2-14 | Migrate hot analytics Sheets→Postgres | 📋 RUNBOOK READY — `docs/P2-14-analytics-sheets-to-postgres.md`. Decision: **implement**. Scope narrowed to **sales/revenue analytics** (Order/OrderItem, uses P1 indexes); distributor-expenses + competitors stay on Sheets (no transactional source). Read-through `lib/analytics/*` behind `ANALYTICS_SOURCE` env flag → instant env-only rollback. Parity check before cutover. ~2d. Implement next session (needs prod DB to validate parity) |

## Executor's Feedback or Assistance Requests
- **Need user decision:** execute **P0** first (config + cache-bust + lazy-load + memo — a few hours, low risk, big perceived speedup), then P1? Recommend yes.
- **Measurement gap:** no real timing data captured yet. Recommend a `next build` first-load-JS snapshot + a couple Vercel function durations (`/api/prices`, `/api/sales`, order-label PDF) to quantify before/after.

## Follow-up audit (Jun 2026, post P0–P2) — Phase 1 + Phase 2 implemented
Fresh whole-app read-only audit confirmed prior fixes still in place. New, verified findings + actions:
| Item | Status |
|---|---|
| DB indexes applied to PROD | ⚠️ STILL PENDING user — biggest live win; run `scripts/apply-prod-migrations.sh`. Indexes are seq-scans until then |
| HTTP cache on `/api/prices`, `/api/sales`, `/api/inventory` | ✅ `Cache-Control: private, max-age=30, stale-while-revalidate=120` (extended `successResponse` to take headers). Manual refresh still bypasses via `?t=`+no-store |
| Search debounce | ✅ ALREADY PRESENT — `SearchCommand` debounces 300ms; no change. (Underlying full-dataset scan is Sheets-TTL-cached) |
| `/api/sales` payload bounding | ❌ NOT SAFE — `DashboardClient` consumes the full sales array to recompute KPIs; bounding would break it. Kept full + cached |
| Admin list routes projection/pagination | ✅ `/api/admin/users` already paginated; `/api/admin/clients` already projected; `/api/admin/products` switched `include`→`select` (only used cols). No `take` caps added (would silently truncate admin pickers) |
| pg_trgm search indexes | ✅ Delivered as `scripts/optional-trgm-search-indexes.sql` (NOT a Prisma migration — needs rds_superuser, would cause drift + could abort runtime migrate). Run via psql only when search volume warrants |
| CustomerPricing waterfall fold-in | ⬜ optional, deferred (low impact; client component fetches after render) |
| Rate limiter (in-memory, per-instance) | 📋 noted — correctness/scaling not latency; move to Redis/Upstash if abuse protection needed |
| Verify | ✅ tsc clean, `next build` exit 0, 79/79 tests pass |

---

# (SUPERSEDED) ACTIVE PLAN — Admin Backend Performance Analysis (June 2026)  [PLANNER]

> Earlier, narrower analysis. P0/P1 below are ✅ done; remaining items folded into the whole-platform plan above.

## Background and Motivation
The admin portal (`/dashboard`, `/customers`, `/profit-loss`, `/inventory`, `/pricing`, `/competitors`, global search) feels slow. The platform has two data backends: **Google Sheets** (legacy: sales/inventory/pricing/competitors — powers most admin analytics) and **Postgres/RDS** (orders, clients, pricing overrides, fulfillment). The slowness is concentrated on the Sheets-backed analytics surfaces and the client-side fetch patterns around them.

## Key Challenges and Analysis (grounded in code audit)

### ROOT CAUSE #1 — Google Sheets is used as the application database (highest impact)
`lib/sheets.ts` hits the Google Sheets REST API for every analytics read. Sheets is a spreadsheet API (typically 300 ms–2 s per range, rate-limited), not an OLTP store. Worse, the read functions chain extra round trips:
- `getSales()` fetches `Sales!A:P`, then **calls `getInventory()`** (a 2nd sheet fetch), then runs an **O(rows × costLookup)** nested loop with a partial-match fallback (`for (const [key,cost] of costLookup.entries())`) for *every* sales row to compute COGS. (`lib/sheets.ts:118-289`)
- `getPriceSheet()` **also calls `getInventory()`** (`lib/sheets.ts:348`).
- So a single `globalSearch` request runs `Promise.all([getSales(), getInventory(), getPriceSheet()])` → `getInventory()` is effectively fetched **3×** in one request, plus a full parse of the entire sales history. (`app/api/search/route.ts:61-65`)

### ROOT CAUSE #2 — Dashboard: client-only render + cache-busting + 60 s polling
`app/(dashboard)/dashboard/page.tsx` is `'use client'`:
- Renders a skeleton, then fetches `/api/sales?t=${Date.now()}` with `cache: 'no-store'` → **defeats the browser cache and Next's fetch cache**, forcing a full Sheets parse + transfer on every load. (`dashboard/page.tsx:24-26`)
- No SSR/streaming: the user waits for JS hydration + a full Sheets round trip before seeing any KPI.
- **Auto-refreshes every 60 s** (`setInterval` 60000) — every open admin tab re-pulls the entire sales dataset every minute, multiplying Sheets load and server CPU.

### ROOT CAUSE #3 — Search re-pulls the whole dataset per query
`/api/search` loads ALL sales+inventory+prices (see #1) just to substring-match, on a 300 ms debounce (`SearchCommand.tsx:77-83`). Each query = ~3–4 Sheets round trips + full-history parse. Fast typers fire several.

### ROOT CAUSE #4 — Same heavy data fetched independently by many pages, no shared cache
`getSales()` / `/api/sales` is consumed by Dashboard (client), Customers (server, `customers/page.tsx`), Customer detail (server, **per-customer** full `getSales()` — `customers/[id]/page.tsx:20`), Profit-Loss (client, + `/api/inventory` + `/api/orders`). No SWR/React Query/dedupe — every navigation re-pulls and re-parses the full history.

### ROOT CAUSE #5 — RDS IAM token minted per DB connection (Postgres-backed admin routes)
`lib/db-url.ts` passes `password: getRdsAuthToken` — an async fn called by node-postgres **per new connection**. Each cold connection does an STS assume-role (Vercel OIDC) + RDS signer round trip (hundreds of ms) with **no token caching/reuse** across connections. On serverless with frequent cold pools this adds latency to every DB-backed admin request (orders, clients, fulfillment, pricing).

### Contributing factors
- **`force-dynamic` on every API route** + client `no-store` ⇒ effectively no caching layer; only `fetchRange`'s `revalidate:300` caches the Sheets hop (and the dashboard's transform re-runs regardless).
- **Heavy client bundles**: Dashboard + Profit-Loss are large `'use client'` pages pulling `recharts`; PO Generator first-load ≈287 kB. More JS to download/parse before interactivity.
- **In-memory rate-limit** (`lib/rate-limit`) is per-instance (correctness, not latency).

## High-Level Task Breakdown (prioritized; each independently shippable)
### P0 — Kill the redundant Sheets work (biggest win, low risk)
1. **Request-level memoization of Sheets reads.** Wrap `fetchRange`/`getInventory`/`getSales`/`getPriceSheet` in React `cache()` (per-request dedupe) so `getInventory` runs once per request, not 3×. **Success:** one search request makes ≤1 fetch per distinct range.
2. **Stop cache-busting the dashboard.** Remove `?t=Date.now()` + `cache:'no-store'`; rely on a short server cache (see #4). Make auto-refresh opt-in or raise to ≥5 min. **Success:** repeat dashboard loads served from cache; Sheets hit ≤1×/cache-window.
3. **Search shouldn't reload everything per keystroke.** Add an in-process TTL cache (e.g. 60–300 s) for the parsed sales/inventory/prices used by search, and raise debounce. **Success:** typing a query reuses cached parsed data; no per-keystroke Sheets pulls.

### P1 — Server-render + cache the analytics
4. **Move Dashboard/Profit-Loss data fetching server-side** (RSC) with `unstable_cache`/`revalidate` (e.g. 300 s) instead of client `fetch` + skeleton; stream the shell. **Success:** TTFB shows KPIs without a client round trip; bundle shrinks (charts can stay client islands).
5. **Cache RDS IAM tokens** in module scope (~14 min TTL, refresh-ahead) so connections reuse a token instead of re-signing each time. **Success:** cold DB route latency drops by the STS+signer cost on warm pools.

### P2 — Structural
6. **Migrate hot analytics off Sheets to Postgres** (sales already partly in `Order`); make Sheets an import/sync source, not a request-time dependency. Add a nightly/triggered sync. **Success:** Dashboard/Customers/P&L read indexed Postgres, not Sheets, at request time.
7. **Code-split heavy chart pages**; lazy-load `recharts`. **Success:** first-load JS for `/dashboard` and `/profit-loss` drops.

## Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| Audit | Diagnose slowness, document root causes | ✅ |
| P0-1 | Per-request memoization of Sheets reads | ✅ in-process TTL cache + in-flight dedupe in `lib/sheets.ts` (`SHEETS_CACHE_TTL_MS`, default 60s); `getInventory` now fetched 1× per window instead of 3× |
| P0-2 | Remove dashboard cache-bust + tame polling | ✅ dropped `?t=`/`no-store`; auto-refresh 60s→5min + visibility-gated |
| P0-3 | TTL cache for search data | ✅ covered by P0-1 (search reuses cached parsed sales/inventory/prices) |
| P1-4 | Server-render + cache Dashboard/P&L | ✅ both pages now RSC: data fetched server-side (`getSales`/`getInventory`/`getDistributorOrders`) and passed to seeded client components (`DashboardClient`, `ProfitLossClient`) — no first-paint skeleton or client round trip |
| P1-5 | Cache RDS IAM tokens | ✅ module-scope token cache (~14min TTL) + in-flight dedupe in `lib/db-url.ts`; connections reuse one signed token instead of re-signing per connection |
| P2-6 | Migrate hot analytics Sheets→Postgres | ⬜ |
| P2-7 | Code-split chart pages | ⬜ |

## Executor's Feedback or Assistance Requests
- **Need user decision:** start with the P0 quick wins (memoization + stop cache-busting + search TTL — low risk, hours, big perceived speedup) before the larger P2 Sheets→Postgres migration? Recommend yes.
- **Measurement gap:** no real timing data captured yet (Lighthouse/Vercel traces). Recommend grabbing Vercel function durations for `/api/sales` and `/api/search` to quantify before/after.

---

# ACTIVE PLAN — FedEx Labels + Package Photos + Client Tracking (June 2026)  [PLANNER]

> **Current source of truth for the in-flight effort.** Port EonPro's (`logosrx.eonpro.io`, repo `/Users/italo/Desktop/FULFILMENT/eonpro`) FedEx shipping + package-photo capture into PeptSci, mapped from EonPro's Patient/Clinic domain onto PeptSci's B2B Client/Order domain. Goal: (1) generate FedEx labels from the customer profile or from the address a client entered at checkout, (2) capture a photo of each outgoing package and attach it to the order so the client sees it on their profile, (3) deliver tracking info to the client.

## Background and Motivation
PeptSci ships physical orders but has no carrier integration. EonPro already has a mature, production FedEx integration + a package-photo "proof of shipment" capture flow used at logosrx.eonpro.io. The user wants that **copied exactly** and wired to PeptSci's data model:
- **FedEx labels**: admin generates a real FedEx shipping label for an order; recipient = the order's `shippingAddress` (entered at checkout) or the client's saved shipping address; shipper = PeptSci/Logos RX origin.
- **Package photo**: warehouse rep scans/enters the order identifier, photographs the package, photo is stored and linked to the `Order`; the client can view it on their order detail/profile (proof of shipment).
- **Tracking**: tracking number + URL persisted on the `Order` and surfaced on the (currently mock) client order pages; optional notification.

## Reference mapping (EonPro → PeptSci)
| EonPro | PeptSci |
| --- | --- |
| `Patient` / `Clinic` (multi-tenant) | `Client` (single PeptSci tenant) |
| `Order` (Rx) `trackingNumber`/`trackingUrl`/`shippingStatus` | `Order` — **fields must be added** |
| `ShipmentLabel` model | new `ShipmentLabel` model (clientId/orderId, no patient/clinic) |
| `PatientShippingUpdate` | fold into `Order` tracking fields (+ optional `OrderShippingUpdate`) |
| `PackagePhoto` (LifeFile ID match) | new `PackagePhoto` (match by PeptSci `orderNumber`/order id) |
| AWS S3 (`uploadToS3`) + signed URLs | **STORAGE DECISION REQUIRED** (S3 / Vercel Blob / base64) |
| Twilio SMS + SES email tracking notify | **NOTIFY DECISION REQUIRED** (email / in-app only) |
| Per-clinic FedEx creds + env fallback | **env-only single account** (simpler) |
| `withAuth(roles)` / HIPAA audit | PeptSci `requireAdmin`/`requireSuperAdmin` + `AuditLog` |

## Key Challenges and Analysis (grounded in code audit)
- **No object storage in PeptSci.** Labels today are base64-in-DB (inventory labels). Package photos (≤10 MB JPEG) in Postgres is a poor fit. Need a storage backend; PeptSci already runs on Vercel + AWS RDS (account 631413806260, Vercel OIDC role) so S3 in the same account is feasible; Vercel Blob is simplest. (Decision D-STORE.)
- **FedEx port is clean.** `lib/fedex.ts` only depends on `fetch`, a logger, and a circuit breaker. PeptSci has `lib/logger.ts` (pino) and `lib/rate-limit.ts`. We drop EonPro's `phi-encryption`, `integrations/adapter`, and clinic-credential branch; keep OAuth cache, circuit-breaker (or simple retry), `createShipment`/`cancelShipment`/`getRateQuote`, and `fedex-services.ts` verbatim.
- **Order tracking fields missing.** Add to `Order`: `trackingNumber String?`, `trackingUrl String?`, `carrier String?`, `shippingStatus String?` (or enum), `shippedAt DateTime?`. Migration must be applied to prod RDS via the runtime runner `POST /api/admin/db/migrate` (RDS IAM — Prisma CLI can't reach prod; see Lessons).
- **Admin order surface is thin.** `/dashboard/customers/[id]` = Google Sheets (legacy); `/shop/orders/[id]` = mock. To "generate labels from the customer profile" we need a DB-order surface. Likely a new admin order detail (or attach to the planned `/dashboard/clients/[id]`) that lists the client's Postgres orders with a "Create FedEx Label" action. (Decision D-SURFACE.)
- **Client order pages are mock.** `/shop/orders` + `/shop/orders/[id]` must be wired to real `Order` data to show tracking + the package photo. (In-scope: read-only wiring for tracking/photo; full order-history rewrite may be larger.)
- **Recipient source.** Order `shippingAddress` (Json) is the checkout address. Need a shared `Address` shape + a helper to map `Order.shippingAddress`/`Client.shippingAddress` → `FedExAddress`. Phone is required by FedEx; ensure checkout/client captures phone.
- **Auth/roles.** Label create/void + photo capture = ADMIN/SUPER_ADMIN (reuse `lib/access.ts`/`lib/auth.ts` guards). Photo *viewing* allowed to the owning client on their order.
- **Security.** FedEx creds server-only; never trust client-sent amounts; validate addresses (Zod); rate-limit label + photo routes; signed/proxied photo URLs so only the owner/admin can view.

## High-Level Task Breakdown (TDD; explicit success criteria) — DRAFT pending Decisions
### Phase A — Schema & FedEx core
1. Prisma: add `Order` tracking fields; new `ShipmentLabel` + `PackagePhoto` models; migration (local Docker now, prod via `/api/admin/db/migrate`). **Success:** `migrate status` clean; client regenerated.
2. Port `lib/fedex.ts` (OAuth cache, retry/circuit-breaker, create/cancel/rate) + `lib/fedex-services.ts` (service/packaging catalogs); strip PHI/clinic/adapter deps; env-only `resolveCredentials`. Unit tests for payload builders + credential resolution. **Success:** tests green; no PHI imports.
3. `lib/shipping/address.ts` — shared `Address` type + `orderToFedExAddress`/`clientToFedExAddress` mappers + Zod schemas + unit tests. **Success:** tests green.

### Phase B — Storage
4. `lib/storage.ts` abstraction (`put`/`getSignedUrl`/`download`/`delete`) backed by the chosen provider (D-STORE), with a base64-in-DB fallback for local dev. **Success:** upload+read round-trips in dev and on Vercel.

### Phase C — FedEx label APIs + UI
5. `POST /api/admin/shipping/fedex/rate` (rate quote) + `POST/GET/DELETE /api/admin/shipping/fedex/label` (create/store/void; persist `ShipmentLabel`, write tracking onto `Order`, audit). Admin-guarded, Zod, rate-limited. **Success:** sandbox label returns tracking+PDF; order shows tracking; void reverses.
6. Port `FedExLabelModal.tsx` (PeptSci theme, `Address` mappers, no AddressAutocomplete dependency or add a simple one). **Success:** modal creates+prints a sandbox label end-to-end.

### Phase D — Package photos
7. Prisma `PackagePhoto` (done in A1) + `POST/GET /api/admin/package-photos` (+ `[id]` PATCH tracking, `[id]/image` proxy, `[id]/pdf` audit). Match by PeptSci order number/id; resolve tracking from Order/ShipmentLabel; store via `lib/storage.ts`. **Success:** capture links a photo to an order; audit log lists it.
8. Port the capture page (`/dashboard/package-photos` or `/shop/storefront-manage`?) — scan order # → camera → upload → confirm; + audit log table. **Success:** rep captures a photo on mobile; it appears on the order.

### Phase E — Client-facing tracking + photo
9. Wire `/shop/orders` + `/shop/orders/[id]` to real `Order` data (read-only): show tracking number/link, shipping status timeline, and the package photo (proof of shipment). **Success:** a client sees their real order, tracking, and package photo.
10. (If D-NOTIFY = email) send tracking email on label creation. **Success:** email delivered in test.

### Phase F — Hardening & docs
11. Tests (fedex payloads, address mappers, authz), build green, env-example + README + scratchpad. **Success:** suite green; docs updated.

## Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| A1 | Schema: Order tracking + ShipmentLabel + PackagePhoto + migration | ✅ |
| A2 | lib/fedex.ts + lib/fedex-services.ts port | ✅ |
| A3 | lib/shipping/address.ts mappers + tests | ✅ |
| B4 | lib/storage.ts abstraction (Vercel Blob + base64 fallback) | ✅ |
| C5 | FedEx rate + label create/get/void admin APIs | ✅ |
| C6 | FedExLabelModal port (PeptSci theme, shadcn) | ✅ |
| D7 | package-photos APIs (upload, list/stats, PATCH/DELETE, image proxy) | ✅ |
| D8 | package-photos capture page + audit log (`/package-photos`) | ✅ |
| C5b | admin orders list API + Fulfillment page (`/fulfillment`) w/ label action | ✅ |
| E9 | client order pages wired to real data (tracking + photo) | ✅ |
| E10 | tracking notification (email) | ⬜ deferred — in-app only per D-NOTIFY |
| F11 | tests (79 pass) + production build green | ✅ |

### Implementation notes (June 2, 2026 — Executor)
- **Surface chosen**: instead of `/dashboard/orders`, added a dedicated **`/fulfillment`** admin page (nav: Fulfillment) listing Postgres `Order`s with "Create/New Label" (opens `FedExLabelModal`), tracking links, and photo counts. Warehouse capture lives at **`/package-photos`**. Client sees tracking + photos at **`/shop/orders` + `/shop/orders/[id]`** (both now real, was mock).
- **Client photo access**: image proxy `GET /api/package-photos/[id]/image` allows admin OR the owning client (via `resolveShopClientId`); URLs are not public even on the blob backend.
- **Env vars required** (set in Vercel / `.env.local`):
  - FedEx: `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`, `FEDEX_ACCOUNT_NUMBER`, `FEDEX_SANDBOX` (`true`/`false`, default sandbox). Optional ship-from override: `FEDEX_ORIGIN_NAME|COMPANY|PHONE|ADDRESS1|ADDRESS2|CITY|STATE|ZIP|COUNTRY`. Label UI/APIs degrade gracefully (422 `FEDEX_UNCONFIGURED`) when unset.
  - Storage: `BLOB_READ_WRITE_TOKEN` (optional) → use Vercel Blob; unset → base64-in-DB fallback (works out of the box).
- **DB migration**: `prisma/migrations/20260602110000_fedex_labels_package_photos` + the runtime runner `/api/admin/db/migrate` probes the new `ShipmentLabel`/`PackagePhoto` tables and `Order.trackingNumber`.

## Decisions (user skipped the question prompt → Executor proceeding with documented defaults, all reversible)
- **D-STORE → `lib/storage.ts` abstraction.** Uses **Vercel Blob** when `BLOB_READ_WRITE_TOKEN` is set; otherwise **base64-in-DB** fallback (zero new infra, works local+prod). Switchable later to S3 by adding a driver. Photos proxied through an auth-gated route so URLs aren't public.
- **D-FEDEX-ACCT → env-only, single account.** `FEDEX_CLIENT_ID/SECRET/ACCOUNT_NUMBER`, `FEDEX_SANDBOX=true` default (apis-sandbox.fedex.com). Ship-from origin defaults to Logos RX (7543 West Waters Ave, Tampa FL 33615, 8138862800) and is overridable via `FEDEX_ORIGIN_*` env. App degrades gracefully (label UI disabled) when creds absent.
- **D-SURFACE → new admin order detail** backed by Postgres `Order` (`/dashboard/orders` list + `/dashboard/orders/[id]`), with the "Create FedEx Label" action there. `/dashboard/customers` (Sheets) left as-is.
- **D-PHOTO-ID → match by `Order.orderNumber`** (autoincrement int the client/admin sees), with fallback to order cuid.
- **D-NOTIFY → in-app only for v1.** Tracking + photo shown on the client order page. Email hook left as a no-op `lib/notify.ts` to wire a provider later.
- **D-CLIENT-ORDERS → in scope.** Wire `/shop/orders` + `/shop/orders/[id]` to real `Order` data (read-only) to show tracking + package photo.

---

# ACTIVE PLAN — New-User Sign-Up + Practice Profile + NPI + Checkout Shipping Tiers (June 2026)

> **Current source of truth for the in-flight effort.** Planner mode. Builds a real B2B onboarding flow (NPI-verified provider, practice profile, billing/shipping addresses, contact, saved payment) tied to the existing Clerk + `Client` model, editable by the client and by SUPER_ADMIN, plus a new checkout shipping selector (ship-to + speed tiers).

## Background and Motivation
New medical-provider customers must self-register with verifiable identity (NPI), full practice details, and addresses so PeptSci can approve them and ship orders. Today sign-up is bare Clerk → `/pending-approval` with no profile capture; `/shop/account` is 100% mock; there is no admin Client-management UI; and checkout shipping is a single flat rule (free ≥ $500 else $25) with no speed choice and no ship-to-patient option. We need to:
1. Capture a complete practice profile at sign-up, anchored to a validated **NPI** (autocomplete provider name from the NPPES registry).
2. Persist it as the `Client` profile (1 Client per practice; the signing-up user becomes its first member).
3. Let the client edit their own profile + saved cards (`/shop/account`), and let SUPER_ADMIN edit any client on the backend (`/dashboard`).
4. Support saved payment methods (Stripe — backend already exists; wire the UI).
5. Replace checkout shipping with: **ship-to (Practice | Patient)** + **speed (2-Day | Overnight)**, priced per the tier matrix below.

## Shipping tier matrix (to confirm — see Decisions D-SHIP)
| Order subtotal | 2-Day | Overnight |
| -------------- | ----- | --------- |
| < $500         | $15   | $25       |
| ≥ $500         | FREE  | $20       |

## Key Challenges and Analysis (grounded in code audit)
- **NPI verification**: NPPES NPI Registry API (`https://npiregistry.cms.hhs.gov/api/?version=2.1`) is **public, free, no key, CORS-permissive-via-server-proxy**. Plan: server-side proxy route (`/api/npi/lookup`) to avoid CORS + add rate-limit/caching. Supports lookup by `number` (exact NPI → returns provider/org name, taxonomy, practice address) and by `first_name`/`last_name`/`organization_name`/`state` (typeahead). We autocomplete the provider/practice name from the entered NPI and let the user pick.
- **Data model gaps**: `Client` has `organizationName, contactName, contactEmail, contactPhone, billingAddress(Json), shippingAddress(Json)`. **Missing**: `npiNumber`, `providerName` (the credentialed individual), `practiceName` (vs org), structured shipping-address-differs flag. Plan: add `npiNumber String? @unique`, `providerName String?`, optionally `npiData Json?` (frozen registry snapshot). Reuse `organizationName` as practice name. Addresses already `Json?` — define a shared `Address` TS type. `User.clientId` already links a user to a Client.
- **Sign-up → profile linkage**: Clerk creates the auth user; the webhook (`user.created`) currently sets `role=CLIENT,status=PENDING` and upserts a `User`. There is **no Client creation**. Plan: add a post-sign-up **/onboarding** step (after Clerk sign-up, before /pending-approval) that collects the profile, creates the `Client`, links `User.clientId`, sets Clerk `publicMetadata.clientId`, then routes to /pending-approval. Guard middleware so a CLIENT with no `clientId` is forced to /onboarding.
- **Client self-edit**: `/shop/account` is mock. Plan: wire it to a new `GET/PATCH /api/shop/profile` (auth'd; client edits own `Client` + own contact). Saved cards already have `GET/POST/DELETE /api/shop/payment-methods` + `setup-intent` — replace the mock card UI with the real Stripe Elements add-card + list/delete.
- **Super-admin edit**: existing `/dashboard/customers` reads **Google Sheets** (legacy sales), not the `Client` table — wrong surface. Plan: add an admin **Clients** management surface (`/dashboard/clients` + `/dashboard/clients/[id]`) backed by `/api/admin/clients` (list exists; add GET-one + PATCH + approve). SUPER_ADMIN can edit all profile fields + approve/suspend.
- **Approval workflow**: reuse `Client.onboardingStatus` (PENDING/APPROVED/REJECTED/NEEDS_INFO) + `User.status`. Approving the Client flips the user(s) to ACTIVE and Clerk `status=ACTIVE`. Ties into existing `/users` approve path — keep them consistent.
- **Checkout shipping**: `lib/checkout-core.ts` `computeShipping(subtotal)` is flat. Plan: replace with `computeShipping(subtotal, { speed })` returning the matrix above; add `shipTo` (PRACTICE|PATIENT) + optional patient address. Thread `speed`, `shipTo`, `shippingAddress`, optional `patient` through `resolveCart` → `/api/shop/checkout/process` → `Order` (`shippingTotal`, `shippingAddress`, `notes`/new fields). Update checkout UI (`app/shop/checkout/page.tsx`) with the selector. Server recomputes shipping — never trust client.
- **Validation/security**: Zod-validate NPI (10-digit Luhn per CMS check-digit), addresses, phone/email. Rate-limit the NPI proxy. Server is authoritative on pricing + shipping. PHI note: "ship to patient" stores a patient name + address on the order — flag minimal-PII handling (no diagnosis/health data; treat address as confidential, no logging of patient PII).

## High-Level Task Breakdown (TDD; explicit success criteria) — DRAFT, pending Decisions
### Phase A — Schema & NPI core
1. Prisma: add `Client.npiNumber @unique`, `providerName`, `npiData Json?`; migration (local Docker now, prod via `/api/admin/db/migrate` runtime runner per Lessons). **Success:** `migrate status` clean; client regenerated.
2. `lib/npi.ts` — pure NPI validation (10-digit + CMS Luhn check digit) + NPPES response normalizer; unit tests incl. known-valid/invalid NPIs. **Success:** tests green.
3. `GET /api/npi/lookup?number=` and `?name=&state=` — server proxy to NPPES (rate-limited, 5-min cache, Zod). **Success:** valid NPI returns normalized provider+address; invalid → 400.

### Phase B — Sign-up + Onboarding
4. `/onboarding` page (multi-section form): NPI field w/ autocomplete (provider name), practice name, billing address, "shipping same as billing" toggle + shipping address, contact name/email/phone. Client-side + server Zod validation. **Success:** submitting creates a `Client`, links `User.clientId`, sets Clerk `publicMetadata.clientId`, redirects to /pending-approval.
5. `POST /api/onboarding` (auth'd CLIENT, no existing clientId) — idempotent create. Middleware: CLIENT without `clientId` → `/onboarding`. Update sign-up `forceRedirectUrl` → `/onboarding`. **Success:** new user can't reach /shop until onboarded + approved.

### Phase C — Profile editing (client + super-admin)
6. `GET/PATCH /api/shop/profile` — client reads/updates own Client + contact (not status/role/NPI-locked-after-approve?). **Success:** edits persist; reload shows them.
7. Rewrite `/shop/account` to real data: profile form (wired to /api/shop/profile), addresses, and **real Stripe saved cards** (Elements add-card via setup-intent + list/delete). Remove mock. **Success:** add/remove card hits Stripe test mode; profile saves.
8. Admin Clients UI `/dashboard/clients` + `/dashboard/clients/[id]` backed by `GET /api/admin/clients`, `GET/PATCH /api/admin/clients/[id]`, approve route. SUPER_ADMIN edits all fields + approve/suspend (flips user status + Clerk metadata). Nav entry, role-gated. **Success:** super-admin edits a client and approves; user flips ACTIVE.

### Phase D — Checkout shipping
9. `lib/checkout-core.ts`: new `ShipSpeed`/`ShipTo` types + `computeShipping(subtotal, speed)` matrix; update `computeCartTotals` signature; unit tests for all 4 cells + boundary at $500. **Success:** tests green.
10. Thread shipping selection through `resolveCart` + `/api/shop/checkout/process` + Order persistence (shippingTotal, shippingAddress, shipTo, patient). **Success:** server total == matrix regardless of client input.
11. Checkout UI: ship-to (Practice prefilled from profile | Patient w/ address fields) + speed (2-Day | Overnight, prices reflect threshold live) selectors; summary updates. **Success:** test purchase with each combination charges correct total.

### Phase E — Hardening & docs
12. Tests (NPI, shipping, profile authz), build green, README/env + scratchpad status. **Success:** suite green; docs updated.

## Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| A1 | Schema: NPI fields + Patient + Order shipTo/patientId + migration | ✅ |
| A2 | lib/npi.ts validation + normalizer + tests | ✅ |
| A3 | /api/npi/lookup proxy (rate-limited, cached, Zod) | ✅ |
| B4 | /onboarding form (NPI autocomplete + addresses) | ✅ |
| B5 | /api/onboarding + middleware gate | ✅ |
| C6 | /api/shop/profile GET/PATCH (NPI lock after APPROVED) | ✅ |
| C7 | /shop/account real (profile + Stripe saved cards + patients) | ✅ |
| C8 | /clients admin list + /clients/[id] detail; GET/PATCH/approve APIs | ✅ |
| D9 | shipping matrix in checkout-core + tests | ✅ |
| D10 | thread shipping (shipTo/speed/patientId) through process/order | ✅ |
| D11 | checkout UI ship-to + speed selectors | ✅ |
| E12 | tests (73 pass) + production build green | ✅ |

## Decisions (CONFIRMED with user — June 2, 2026)
- **D-SHIP ✅** Shipping matrix: `< $500` → 2-Day **$15** / Overnight **$25**; `≥ $500` → 2-Day **FREE** / Overnight **$20**. Server-enforced.
- **D-ONBOARD ✅** Profile collected in a dedicated **`/onboarding` step right after Clerk sign-up**, before /pending-approval.
- **D-PATIENT ✅** "Ship to patient" uses a **saved patient list per practice** → new `Patient` model (name + address, minimal PII, no health data). Selectable at checkout; manageable in account.
- **D-NPI ✅** Free public **NPPES NPI Registry API** via server proxy (no key).
- **D-NPI-LOCK ✅** After a Client is **APPROVED**, NPI + practice name are **read-only** for the client (admin-only to change).
- **D-PAY ✅** Saved cards offered on the **account page and during checkout** (not required at sign-up), via the existing Stripe backend.

### Schema delta from these decisions
- `Client`: add `npiNumber String? @unique`, `providerName String?`, `npiData Json?`.
- New `Patient` model: `id, clientId, firstName, lastName, address Json, phone?, email?, isActive, timestamps`; `Client.patients Patient[]`. Order gets `shipTo` (PRACTICE|PATIENT) + `patientId?` + keeps `shippingAddress Json` snapshot.

---

# ACTIVE PLAN — Inventory Intake + Auto Batch/Barcode + Label Generation (June 2026)

> **This is the current source of truth for the in-flight effort.** Adapted from the proven `eonpro/eonpro` label + vial-inventory model (`src/lib/labels/vialLabelPdf.ts`, `src/lib/vial-inventory/*`, `src/app/admin/vial-inventory/*`). The earlier Go-Live plan (User Roles / Client Pricing / Members-Only / Stripe) remains below and is largely complete.

## Background and Motivation

PeptSci staff need to (1) record inbound inventory by batch and set a BUD (Beyond-Use Date), (2) have the **batch number + barcode auto-generated** and tied to that batch, (3) **auto-generate print-ready labels** matching the supplied PeptSci RUO label artwork, (4) import all current + future inventory, and (5) generate labels for orders on demand.

Reference (in our GitHub, `eonpro/eonpro`, powering logosrx.eonpro.io):
- `src/lib/labels/vialLabelPdf.ts` — `pdf-lib` + `jsbarcode` Code128 + `@pdf-lib/fontkit`; draws a full label sheet on 8.5×11 with brand column, dose box, rotated warning + rotated batch barcode. Geometry constants per label stock.
- `src/app/admin/vial-labels/page.tsx` + `src/app/api/admin/vial-labels/pdf/route.ts` — generator UI + PDF route.
- `src/lib/vial-inventory/service.ts` + `_components/NewBatchModal.tsx` — batch intake + BUD + counts + audit.

## Label spec (from supplied artwork)
- Stock: **OnlineLabels OL4891LP**, label **2.0" × 0.75"**, **36/sheet (3 cols × 12 rows)**, sheet 8.5×11.
- Margins/pitch: top **0.3125"**, left **1.125"**, H gap **0.125"**, V gap **0.125"**, H pitch **2.125"**, V pitch **0.875"**.
- Fields (left→right): PeptSci vertical "research" logo + divider line; `BUD: MM/DD/YYYY` (day in accent color); product name (e.g. "Tesamorelin"); rotated `RUO`; two-tone rounded dose box (top black `10mg`, bottom blue `99%HPLC`); rotated `PROVIDER USE ONLY / NOT FOR HUMAN OR / ANIMAL CONSUMPTION`; Code128 barcode of batch#; rotated `BATCH: <batchNumber>` in blue.
- Batch number format (from sample `TES10-102027`): `<3-letter product code><dose#>-<MM><YYYY of BUD>`, numeric suffix on collision; barcode = Code128 of the batch number.

## Key Challenges and Analysis
- **Data source split**: `/inventory` currently reads Google Sheets (`lib/sheets.ts getInventory`). Batches must live in Postgres (Prisma). Need to decide whether DB batches become the inventory source of truth or run alongside the Sheets view (see decisions).
- **Schema gap**: no Batch/BUD/purity model. Add `InventoryBatch` (+ optional `InventoryBatchEvent` audit) tied to `ProductVariant`; add `RECEIPT` to `InventoryAdjustmentReason`. Receiving a batch increments `ProductVariant.inventoryOnHand` and writes an `InventoryAdjustment`.
- **Roles**: schema has only CLIENT/ADMIN/SUPER_ADMIN. Request mentions "staff". Decide: add STAFF role or gate to ADMIN/SUPER_ADMIN (see decisions).
- **Label engine**: introduce `pdf-lib` + `jsbarcode` + `@pdf-lib/fontkit` (project currently has `jspdf`, which is weaker for this vector/rotated layout). Adapt eonpro geometry to OL4891LP (2"×0.75").
- **Assets**: need PeptSci vertical logo (PNG/SVG) + label fonts; provide a vector fallback mark if not supplied.
- **Order labels on command**: FIFO batch selection by soonest BUD with stock; generate N labels for ordered vials.

## High-Level Task Breakdown (TDD; each task has explicit success criteria)
### Phase A — Schema & domain
1. [ ] Prisma: add `InventoryBatch` (+ `InventoryBatchEvent`?), `BatchStatus` enum, `RECEIPT` reason; migration. **Success:** `prisma migrate` clean; client types generated.
2. [ ] `lib/batch-number.ts` — pure batch-number + Code128-payload builder with unit tests (format + collision suffix). **Success:** tests green incl. `TES10-102027` case.
3. [ ] `lib/inventory-batches.ts` — service: createBatch (auto number, tx: +inventoryOnHand, +InventoryAdjustment, +event), list, get, update, void, FIFO allocate-for-order. Unit tests. **Success:** receiving increments on-hand; voiding reverses; tests green.

### Phase B — Label engine (port from eonpro)
4. [ ] `lib/labels/peptsciLabelPdf.ts` — OL4891LP geometry; `pdf-lib`+`jsbarcode`; renders the spec fields; proof mode (single centered) + N-up sheet. **Success:** proof PDF visually matches artwork; barcode scans to batch#.
5. [ ] Assets: `public/labels/peptsci-logo-vertical.png` (+ fonts) with graceful vector fallback. **Success:** logo renders; missing-asset fallback doesn't crash.

### Phase C — APIs (admin-guarded, rate-limited, Zod-validated)
6. [ ] `POST/GET /api/admin/inventory/batches`, `GET/PATCH/DELETE /api/admin/inventory/batches/[id]`. **Success:** CRUD persists; authz tests pass.
7. [ ] `POST /api/admin/inventory/labels/pdf` (by batchId, qty, proofMode). **Success:** returns application/pdf.
8. [ ] `POST /api/admin/orders/[id]/labels/pdf` — FIFO allocate + label sheet. **Success:** correct count + batch on labels.

### Phase D — UI
9. [ ] `/dashboard/inventory` "Batches" tab + "Receive Inventory" modal (product, qty, damaged, BUD, purity, notes, accent color). **Success:** new batch appears with auto batch#.
10. [ ] Batch list table + detail drawer + "Print labels" / "Proof" actions; nav entry; role gate. **Success:** print downloads PDF.
11. [ ] Order detail "Generate labels" button. **Success:** PDF for the order.

### Phase E — Import & docs
12. [ ] Importer for existing inventory → seed initial batches (from Sheets/CSV or current variant on-hand). **Success:** current stock represented as batches.
13. [ ] Tests + README/env + scratchpad status. **Success:** docs reflect behavior; suite green.

## Project Status Board (Inventory + Labels)

| # | Task | Status |
| - | ---- | ------ |
| A1 | Prisma `InventoryBatch` + `InventoryBatchEvent` + `BatchStatus`/`BatchEventType` enums + `RECEIPT` reason; migration `20260602001258_inventory_batches` applied | ✅ |
| A2 | `lib/batch-number.ts` (format `<PRD><MG#>-<MMYYYY>`, collision suffix, Code128 payload) + 15 unit tests | ✅ |
| A3 | `lib/inventory-batches.ts` service (create w/ tx + collision retry, list, get, update, void, FIFO allocate, label events) + `lib/inventory-batches-core.ts` pure helpers + 9 unit tests | ✅ |
| B4 | `lib/labels/peptsciLabelPdf.ts` — OL4891LP (2"×0.75", 36/sheet), `pdf-lib`+`jsbarcode` Code128, multi-page/multi-batch + proof + single-label | ✅ proof + 36-up verified visually |
| B5 | **Real artwork as template** — user-supplied `PEPTSCI LABEL SAMPLE.svg` (viewBox 144×54 = label in pt; dynamic fields are `display:none`) rasterized to `public/labels/peptsci-label-template.png` via `scripts/build-label-template.ts` (`npm run labels:template`, `@resvg/resvg-js`). Engine composites the template and overlays only the dynamic fields (BUD date, dose, barcode, name, batch) at the exact SVG placeholder coords. Programmatic vector label kept as fallback. | ✅ matches artwork |
| C6 | `POST/GET /api/admin/inventory/batches` + `GET/PATCH/DELETE /[id]` (admin-guarded, Zod) | ✅ |
| C7 | `POST /api/admin/inventory/labels/pdf` (batch sheet/proof, audit event) | ✅ |
| C8 | `POST /api/admin/orders/[id]/labels/pdf` (FIFO allocate + optional `?consume=true`) | ✅ API; UI button deferred with admin order mgmt |
| D9 | `/inventory` rewritten DB-backed: KPIs, Receive modal, Batches table (print/proof/void), By-Product rollup | ✅ |
| E12 | Bulk import | ⏭️ Not needed (manual entry, D6) |
| E13 | Tests (38 green), build green, docs | ✅ tests/build; README pass below |

**Verified:** `npm run build` exit 0 (all 4 new API routes + `/inventory` compiled); 49 unit tests green; live-DB e2e (create→collision-suffix→FIFO→void reversal) confirmed against local Postgres; label proof + 36-up sheet rendered from the real artwork and visually confirmed (template embedded once, shared across 36 labels → ~109 KB/sheet).

**Follow-ups / notes:**
- ✅ Real artwork integrated. The supplied SVG IS the full label template (not just a logo); engine composites `peptsci-label-template.png` and overlays dynamic fields. No separate logo PNG needed (it's baked into the artwork).
- ✅ Brand fonts (June 1, user-confirmed). Engine now embeds + subsets brand fonts via `@pdf-lib/fontkit` from `public/fonts/labels/`, with Standard-14 fallback: **American Typewriter Condensed** for BUD date + batch number (extracted from macOS system collection; matches baked `BUD:`/`BATCH:`), **Sofia Pro** for dose + peptide name. ✅ Sofia Pro Regular sourced from the eonpro project (`eonpro/public/fonts/Sofia-Pro-Regular.ttf` → `public/fonts/labels/SofiaPro-Regular.ttf`, verified real: 638 glyphs). American Typewriter: confirm PeptSci's Monotype/Adobe license for production. Barcode confirmed staying sideways (horizontal bars per artwork); logo confirmed correct.
- Dose-box purity `99%HPLC` is baked into the artwork; non-99% batches require editing the SVG + `npm run labels:template`.
- Product name + batch-number value have no `display:none` placeholder in the SVG; positions were chosen (name centered above dose box; batch rotated continuing `BATCH:`) — confirm placement with user on first print.
- Order-label generation is API-ready (`/api/admin/orders/[id]/labels/pdf`); the trigger button attaches to the admin order-detail page when admin order management ships (currently deferred).
- `/inventory` is now Postgres/batch-backed (D3). The dashboard KPIs + global search still read legacy Google Sheets data; migrating those is out of this scope.

## Decisions (confirmed with user — June 1, 2026)
- **D1 Single-step receive.** One form records an inventory receipt and auto-creates the batch. Captured fields: Product Name, mg (dose), Vial Size (e.g. 3mL), BUD, Amount (qty), Received On date (+ purity, default `99%HPLC`, for the label). Inventory increments immediately.
- **D2 Roles: ADMIN + SUPER_ADMIN only** (no new STAFF role).
- **D3 Postgres batches are the source of truth** for on-hand stock; `/inventory` reads from DB batches.
- **D4 Batch number format CONFIRMED:** `<FIRST 3 LETTERS OF NAME><MG#>-<BUD MM><BUD YYYY>`. Example: Tesamorelin 10mg, BUD 07/11/2027 → `TES10-072027`. Numeric suffix on collision. Barcode = Code128 of the batch number.
- **D5 Assets:** user will upload the PeptSci vertical logo **SVG** (like eonpro's). Engine embeds a PNG render of it at `public/labels/peptsci-logo-vertical.png` (convert SVG→PNG on drop-in) with a vector fallback mark until provided.
- **D6 No bulk import.** Staff enter batches manually going forward (intake form upserts the Product/ProductVariant when new, e.g. Tesamorelin).

---

# ACTIVE PLAN — Go-Live: User Roles, Client Pricing, Members-Only (June 2026)

> **This is the current source of truth.** White-label storefronts (`/sf`, `/api/storefront`, `/api/clinic`, storefront-manage) are explicitly **deferred to a second phase** and out of scope for this effort.

## Background and Motivation

Make three features production-live for the members-only B2B platform:

1. **User Roles** — CLIENT / ADMIN / SUPER_ADMIN with enforcement + admin tooling to manage them.
2. **Client Pricing** — Admins set per-client custom prices; approved clients see their own prices end-to-end (catalog → cart → checkout).
3. **Members-Only** — No anonymous access; role-based routing; pending-approval gate.

## Key Challenges and Analysis (grounded in code audit)

- **CRITICAL BLOCKER — Clerk not configured.** No Clerk keys in `.env.local` → `requireAuth`, `useRole`, and `middleware` all hit dev-bypass branches. All three features are effectively OFF. _Resolution: user has keys, will add to `.env.local`._
- **CRITICAL BLOCKER — DB not live.** `DATABASE_URL` → `127.0.0.1:5433` (unreachable) and **no `prisma/migrations`**. Pricing silently falls back to Sheets. _Resolution: user provides hosted connection string; we create initial migration + deploy._
- **Roles gaps:** No User Management UI; no "list users" API; no SUPER_ADMIN bootstrap path.
- **Client pricing gaps:** Admin page `/pricing/client-pricing` is 100% mock (not wired to API); no list-clients / list-variants APIs; shop never consumes custom pricing; `client-pricing` API lacks admin-role check.
- **Security:** Several `/api/admin/*` routes only check `requireAuth`, not admin role. Need a shared `requireAdmin` / `requireSuperAdmin` guard.
- **Data dependency:** End-to-end client pricing requires Products/Variants and Clients to exist in Postgres (currently catalog is Sheets/Airtable-derived). Need seed/migration so variant IDs are stable for `ClientPricing.variantId`.

## High-Level Task Breakdown (TDD; each task has explicit success criteria)

### Phase 0 — Environment & Foundation
1. [ ] Configure Clerk keys in `.env.local`; verify `isClerkConfigured` true. **Success:** unauthenticated user hitting `/` is redirected to `/sign-in`.
2. [ ] Point `DATABASE_URL` at hosted Postgres; create initial Prisma migration; `prisma migrate deploy`. **Success:** `prisma migrate status` clean; tables exist.
3. [ ] Seed products/variants + at least one Client into Postgres (from Sheets/Airtable). **Success:** `getPricing()` returns `source: 'postgres'` with variants.
4. [ ] Add shared auth guards `requireAdmin()` / `requireSuperAdmin()` in `lib/auth.ts` with unit tests. **Success:** non-admin → 403 on admin APIs.

### Phase 1 — Members-Only Live
5. [ ] Verify middleware enforcement with real Clerk session for each role (CLIENT→/shop, ADMIN→/dashboard, PENDING→/pending-approval). **Success:** manual matrix passes; admin routes 302 for clients.
6. [ ] Bootstrap first SUPER_ADMIN (script or one-time route) for provided email. **Success:** that user can reach `/dashboard` and role APIs.

### Phase 2 — User Roles Tooling
7. [ ] Add `GET /api/admin/users` (list users w/ role+status; admin-only, paginated). **Success:** returns Clerk+DB users.
8. [ ] Build `/dashboard/users` admin page: list, approve/suspend, change role (super-admin only). Wire header dropdown link. **Success:** approving a PENDING user flips them to ACTIVE live.
9. [ ] Apply `requireAdmin`/`requireSuperAdmin` to all `/api/admin/*` routes. **Success:** authz tests pass.

### Phase 3 — Client Pricing End-to-End
10. [ ] Add `GET /api/admin/clients` and `GET /api/admin/products` (variants). **Success:** dropdowns load real data.
11. [ ] Rewrite `/pricing/client-pricing` to use real APIs (CRUD against `/api/admin/client-pricing`); remove mock data; add admin-role guard. **Success:** create/edit/delete persists in Postgres and survives reload.
12. [ ] Resolve current client from session (`clientId` in metadata) and apply `getEffectivePrice` in shop catalog/PDP/cart/checkout. **Success:** a client with a custom price sees it everywhere; others see SRP.
13. [ ] Ensure orders capture the effective unit price at checkout. **Success:** order line items store custom price.

### Phase 4 — Hardening & Docs
14. [ ] Tests: pricing resolution, authz guards, role transitions. **Success:** ≥ critical-path coverage, all green.
15. [ ] Update README + env-example + scratchpad status. **Success:** docs reflect live behavior.

## Project Status Board

| # | Task | Status |
| - | ---- | ------ |
| 0.1 | Clerk keys configured | 🟡 Keys set; webhook secret + session-token claim pending |
| 0.2 | DB + initial migration | ✅ Local Docker PG (RDS deferred); migration `init` applied |
| 0.3 | Seed products/variants/client | ✅ 6 products / 10 variants / 3 clients / 1 example price |
| 0.4 | requireAdmin/requireSuperAdmin guards | ✅ lib/access.ts + lib/auth.ts guards; 7 unit tests green |
| 1.5 | Members-only enforcement verified | 🟡 Unauth blocked (307→/sign-in) verified via curl; role-based routing pending a real logged-in session |
| 1.6 | SUPER_ADMIN bootstrap | 🟡 `scripts/set-role.ts` + `npm run set-role` built; awaiting admin email + signed-up user |
| 2.7 | GET /api/admin/users | ✅ Clerk-sourced, admin-guarded |
| 2.8 | /dashboard/users UI | ✅ `/users` page: list, approve/suspend, role change (super-admin); header link wired; route admin-gated |
| 2.9 | Admin authz on all admin APIs | ✅ client-pricing guarded; users/clients/products guarded; storefront route bug fixed |
| 3.10 | clients/products list APIs | ✅ `/api/admin/clients`, `/api/admin/products` |
| 3.11 | Real client-pricing admin UI | ✅ Rewritten to real CRUD against API (no mock data) |
| 3.12 | Shop consumes client pricing | ✅ SKU overlay via `lib/shop-pricing.ts`; catalog + PDP + ProductCard show effective/custom price |
| 3.13 | Orders capture effective price | ✅ Effective price flows cart→checkout totals (order persistence/Stripe deferred) |
| 4.14 | Tests | 🟡 14 unit tests green (access + finance + inventory); route/integration tests pending |
| 4.15 | Docs | 🟡 scratchpad updated; README/env doc pass pending |

## Decisions (confirmed with user)
- Clerk: user has keys, will add to `.env.local`.
- DB: hosted Postgres, user provides connection string.
- Client pricing scope: **full end-to-end** (admin + shop).
- First SUPER_ADMIN: user to provide email(s).
- **Stripe integration model: Model A — Inline / ad-hoc pricing (confirmed June 1, 2026).** Stripe is a pure payment processor; the platform DB (Postgres `ProductVariant` + `ClientPricing`) is the sole source of truth. We do **not** mirror products/prices into Stripe's catalog and do **not** use the Stripe Dashboard "Products" UI. See section below.

## Stripe Payments — Model A (Inline Pricing)

### Background and Motivation
Checkout is currently simulated (`app/shop/checkout/page.tsx` uses a `setTimeout`; the storefront `app/api/storefront/checkout/route.ts` persists a `RetailOrder` but takes no payment). We need real payment capture without leaking our negotiated per-client B2B pricing into Stripe or maintaining a duplicate catalog there.

### Confirmed product decisions (June 1, 2026)
- **Surface: embedded Payment Element** (stays on-site). Per Stripe best-practices, back it with the **Checkout Sessions API in `ui_mode: 'custom'`** rather than a raw PaymentIntent.
- **Tax: none** (`taxTotal` always 0). **Shipping: free over $500, else $25** — computed server-side. (Drop the previous 8% tax in `app/shop/checkout/page.tsx` and `createRetailOrder`.)
- **Saved cards: yes.** Maintain a **Stripe Customer per `Client`** and save cards for **off-session** reuse (admin reorders / future invoicing). Requires SetupIntents and `setup_future_usage: 'off_session'`.

### Reference implementation: EonPro (`/Users/italo/Desktop/FULFILMENT/eonpro`)
User directed us to mirror EonPro's mature Stripe integration. Transferable patterns adopted (domain mapped patient→Client, invoice/prescription→Order):
- **`lib/stripe/config.ts`**: cached singleton client (`apiVersion` pinned, `maxNetworkRetries:3`, `timeout:30000`), `getStripeClient()`/`requireStripeClient()`/`validateStripeConfig()` (async account check, 5-min cache)/`isStripeConfigured()`/`isStripeTestMode()`/`getStripeDiagnostics()`/`StripeConfigError`. `lib/stripe.ts` re-exports + legacy `getStripe()`/`formatCurrency()`.
- **Customer service** (`getOrCreateStripeCustomer`): retrieve-or-recreate on deleted, persist id, `metadata.clientId`.
- **PaymentIntents + Stripe Elements two-step**: `/process` (DB-first PENDING record → create PaymentIntent → return `clientSecret`; saved-card path charges `off_session, confirm:true` with `idempotencyKey`) → `/confirm` (reconcile PI status, persist saved `PaymentMethod` from Stripe).
- **SetupIntent route** for add-card-without-purchase (`usage:'off_session'`).
- **Bulletproof webhook**: NEVER 500 (always 200 so Stripe doesn't hammer retries), verify signature against multiple secrets, idempotency record table, audit `WebhookEvent` log, DLQ for failures, critical-event alerting.
- **Dropped from EonPro (out of scope here)**: Stripe Connect per-clinic, affiliate/sales-rep commissions, refill queue, PHI encryption, subscriptions (Phase 2). Our flow is single-account, one-time B2B payments + saved cards.

### Key Challenges and Analysis (grounded in code audit)
- **Model A**: inline `price_data` on PaymentIntents — Stripe never holds `Product`/`Price` catalog objects; per-client pricing stays private. Amounts always recomputed server-side.
- **Pre-wired (good)**: `Order.stripePaymentIntentId` + `PaymentStatus` enum (`PENDING/AUTHORIZED/CAPTURED/REFUNDED/FAILED`) exist; `/api/webhooks/stripe` already public in `middleware.ts`; `STRIPE_*` env vars stubbed; per-client pricing resolved server-side via `lib/pricing.ts`; client resolved via Clerk `getUserMetadata().clientId` (`lib/roles.ts`).
- **PaymentStatus mapping**: Stripe `succeeded`→`CAPTURED`, `processing`/`requires_capture`→`AUTHORIZED`, `requires_payment_method`/`canceled`→`FAILED`, refund→`REFUNDED`.
- **Schema gaps**: no `stripeCustomerId`, no saved-cards model, no webhook idempotency table. Add: `Client.stripeCustomerId String? @unique`; `PaymentMethod` model (per-client saved cards); `WebhookEvent` model (idempotency + audit). New migration.
- **Missing**: Stripe SDK not installed; no `lib/stripe*`; no process/confirm/setup-intent APIs; no webhook handler; no DB order persistence for the **direct** `/shop` flow; checkout UI is a placeholder (`setTimeout`).
- **Security (critical)**: `unit_amount` recomputed server-side keyed to the authenticated client's effective price — never trust client cart amounts. Idempotency keys on PI creation; verify webhook signatures. Off-session charges only against a saved PM on the client's own Customer. PCI: raw card data NEVER hits our server — Stripe Elements + clientSecret only (SAQ A).
- **Dynamic payment methods**: never pass `payment_method_types`; let Stripe pick from Dashboard settings.
- **Scope**: targets the **direct B2B `/shop`** flow (Clerk clients). White-label storefront reuses `lib/stripe/*` + webhook in Phase 2 (deferred).

### High-Level Task Breakdown (TDD; explicit success criteria)
- [ ] **S1 — Install + config module.** Add `stripe` + `@stripe/stripe-js` + `@stripe/react-stripe-js`. Create `lib/stripe/config.ts` (cached singleton, pinned `apiVersion`, retries/timeout, validate/diagnostics/`StripeConfigError`) + `lib/stripe.ts` re-export + `getStripe()`/`formatCurrency()`. Add `getStripeConfig()` to `lib/config.ts`. **Success:** type-check passes; importing without keys returns null/graceful, no build crash; `isStripeConfigured()` correct.
- [ ] **S2 — Schema.** Add `Client.stripeCustomerId`, `PaymentMethod` model, `WebhookEvent` model; Prisma migration + regenerate client. **Success:** `prisma migrate status` clean; client types include new models.
- [ ] **S3 — Customer service.** `lib/stripe/customer.ts` `getOrCreateStripeCustomer(clientId)` (retrieve-or-recreate on deleted; persist id; `metadata.clientId`). **Success:** unit/integration: two calls → same id; deleted customer → new id persisted.
- [ ] **S4 — Order/price resolver.** `lib/stripe/checkout.ts` `resolveCart({clientId, items})` → loads variants + client pricing, computes effective unit prices, subtotal, **tax 0**, **shipping (free >$500 else $25)**, total; persists/refreshes a DRAFT `Order` (`paymentStatus: PENDING`). Unit tests: price resolution, shipping threshold, tampered input rejection (unknown variant, qty bounds, empty cart). **Success:** tests green; order total == server total regardless of client-sent amounts.
- [ ] **S5 — `/process` API.** `POST /api/shop/checkout/process`: Clerk-auth + rate-limited; resolve client; `getOrCreateStripeCustomer`; `resolveCart`; DB-first DRAFT order; create PaymentIntent (`customer`, inline amount, `setup_future_usage:'off_session'` when `saveCard`, **no** `payment_method_types`, `metadata:{orderId,clientId}`, `idempotencyKey`); store `stripePaymentIntentId`. Saved-card path: `confirm:true, off_session:true` against chosen saved PM. Returns `{clientSecret, paymentIntentId, publishableKey}`. **Success:** Dashboard shows PI attached to Customer with correct amount, NO catalog product created.
- [ ] **S6 — `/confirm` API.** `POST /api/shop/checkout/confirm`: retrieve PI, map status → `Order.paymentStatus`, advance `Order.status`→`SUBMITTED` on capture, persist saved `PaymentMethod` (last4/brand/exp) when `saveCard`. **Success:** after Elements confirm, order flips to CAPTURED and card row created.
- [ ] **S7 — Webhook.** `POST /api/webhooks/stripe`: verify signature; `WebhookEvent` idempotency (event id); handle `payment_intent.succeeded/payment_failed/canceled`, `charge.refunded`, `payment_method.attached/detached`; reconcile Order by `metadata.orderId`/`stripePaymentIntentId`; NEVER 500 (always 200, DLQ failures). **Success:** Stripe CLI `trigger payment_intent.succeeded` flips order to paid exactly once (replays no-op).
- [ ] **S8 — Saved cards / off-session.** `POST /api/shop/payment-methods/setup-intent`; `GET/DELETE /api/shop/payment-methods` (client's own Customer only); server helper to charge a saved PM off-session. Surface in `app/shop/account/page.tsx`. **Success:** card appears in account; off-session charge succeeds in test mode; detach works.
- [ ] **S9 — Checkout UI (embedded Payment Element).** Replace simulated `handleSubmitOrder` in `app/shop/checkout/page.tsx`: `<Elements>` + `<PaymentElement>` using clientSecret from `/process`; `stripe.confirmPayment`; call `/confirm`; add `/shop/checkout/success` + cancel handling; offer saved-card selection + "save card" toggle; remove 8% tax from summary. **Success:** test `4242` purchase completes on-site; order paid; card saved.
- [ ] **S10 — Diagnostics + docs.** Admin `GET /api/stripe/diagnostics` (uses `getStripeDiagnostics`) + `scripts/test-stripe-config.ts`; update `env-example.txt` (keys only; `rk_` restricted key recommended), README payment section, scratchpad status. **Success:** diagnostics returns config/connectivity; docs reflect Model A; no `payment_method_types` anywhere.

### Compliance note (flagged to user)
B2B controlled-substance-adjacent sales: confirm the Stripe account is approved for the product category before going live (test mode fine for build). Recommend a **restricted key (`rk_`)** scoped to PaymentIntents/Customers/SetupIntents/PaymentMethods.

### Stripe Project Status Board (Executor)
| Step | Status | Notes |
| ---- | ------ | ----- |
| S1 Install + config module | ✅ | `stripe@22.2.0`, `@stripe/stripe-js@9`, `@stripe/react-stripe-js@6`; `lib/stripe/config.ts` (cached singleton, `apiVersion 2026-05-27.dahlia`, retries/timeout, validate/diagnostics/`StripeConfigError`); `lib/stripe.ts` re-export + `getStripe`/`formatCurrency`/`toCents`; `getStripeEnvConfig()` in `lib/config.ts`. tsc clean. |
| S2 Schema + migration | ✅ | `Client.stripeCustomerId @unique`, `PaymentMethod`, `WebhookEvent` + `WebhookEventStatus`; `Order` += shippingTotal/shippingAddress/stripeChargeId/paymentMethodId/paymentFailureReason/paidAt + `stripePaymentIntentId @unique`. Migration `20260601205751_stripe_payments` applied (generated via `migrate diff` since `migrate dev` needs a TTY); client regenerated. |
| S3 Customer service | ✅ | `lib/stripe/customer.ts` `getOrCreateStripeCustomer` (retrieve-or-recreate on deleted, persists id, `metadata.clientId`). |
| S4 Resolver + draft order | ✅ | Pure `lib/checkout-core.ts` (validate/shipping/totals) + DB `lib/stripe/checkout.ts` (`resolveCart` server-authoritative pricing, `createDraftOrder`). 11 unit tests green (`npm test`). |
| S5 `/process` | ✅ | `POST /api/shop/checkout/process`: auth+rate-limit, DB-first DRAFT, PaymentIntent (no `payment_method_types`, `setup_future_usage` on save), saved-card off-session path w/ idempotency. |
| S6 `/confirm` | ✅ | `POST /api/shop/checkout/confirm`: ownership check, reconcile via `reconcileOrderFromPaymentIntent`, persist saved card. |
| S7 Webhook | ✅ | `POST /api/webhooks/stripe`: signature verify, `WebhookEvent` idempotency, never-500, handles payment_intent.*/charge.refunded/payment_method.attached|detached. |
| S8 Saved cards | ✅ | `setup-intent` route + `GET/POST/DELETE /api/shop/payment-methods` (client-scoped). Shared helpers in `lib/stripe/payments.ts`. |
| S9 Checkout UI | ✅ | 2-step Shipping→Payment; embedded `<PaymentElement>` + saved-card selection (`components/shop/CheckoutPaymentSection.tsx`, `lib/stripe-client.ts`); `/shop/checkout/success`; **8% tax removed**. |
| S10 Diagnostics + docs | ✅ | Admin `GET /api/stripe/diagnostics`; `npm run stripe:check` (`scripts/test-stripe-config.ts`); `env-example.txt`, README payments section, this board. |
| S11 Stripe Connect | ✅ | Platform → connected account **Direct charges**. `lib/stripe/connect.ts` (`getConnectedAccountId`, `connectRequestOptions`, optional `application_fee_amount` via `STRIPE_APPLICATION_FEE_BPS`). `stripeAccount` threaded through customer/customer-create, PaymentIntents (both paths), SetupIntent, PaymentMethods retrieve/detach, confirm retrieve. Webhook scopes `persistPaymentMethodFromStripe` by `event.account`. Client `loadStripe(pk, { stripeAccount })` via `connectedAccountId` returned from `/process` + `/setup-intent`. Diagnostics verify balance on the connected account. `STRIPE_CONNECTED_ACCOUNT_ID=acct_1S34ayDhHXlGkLX4` set in `.env.local` + `env-example.txt`. tsc clean. |

**Remaining to go live (user action):** add the **platform's** Stripe keys to `.env.local` (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), set a **Connect** webhook endpoint secret (`STRIPE_WEBHOOK_SECRET`) and enable the listed events, run `npm run stripe:check` (verifies connectivity to `acct_1S34ayDhHXlGkLX4`), and end-to-end test with `4242…` in test mode. Confirm the connected account is approved for the product category; restricted platform key (`rk_` with Connect scope) recommended before production. Decide whether a platform fee applies (`STRIPE_APPLICATION_FEE_BPS`, default none).

## Executor's Feedback or Assistance Requests
- ✅ Phase 0 complete: Clerk keys added; local Docker Postgres running (RDS in AWS acct 631413806260 is inaccessible from this machine — deferred to prod via Vercel); initial migration applied; core seed loaded; admin guards + tests green.
- DB decision: RDS master password is not held by user and the cross-account role can't be assumed locally; using local Docker PG for dev. Production will use the RDS PG* injection on Vercel (may require IAM auth — revisit at deploy time).
- ✅ **RDS IAM auth wired (June 2026):** `lib/db-url.ts` now mints a short-lived RDS IAM token per connection via `@aws-sdk/rds-signer` + Vercel OIDC (`awsCredentialsProvider`) when `PGHOST`+`AWS_ROLE_ARN` are set and no `PGPASSWORD`/`DATABASE_URL` is present. Heavy SDKs imported lazily so local dev / Prisma CLI are unaffected. `lib/prisma.ts` calls `attachDatabasePool` (lazy, Vercel-only) to drain the pool on function suspend. Pool size capped via `PG_POOL_MAX` (default 20). `env-example.txt` documents Mode A (static URL) vs Mode B (IAM). Type-check clean; all 3 config modes runtime-verified.
- **Prod prerequisites still needed before IAM auth works:** RDS IAM database auth enabled, DB user `GRANT`ed `rds_iam`, and a Vercel↔AWS OIDC role with `rds-db:connect`. Migrations against an IAM-only instance must run with a temporary admin `DATABASE_URL` (Prisma CLI can't use OIDC).
- **Still needed from user before Phase 1 verification can pass:**
  1. In Clerk → Sessions → Customize session token, add `{"metadata": "{{user.public_metadata}}"}` (otherwise roles won't propagate).
  2. `CLERK_WEBHOOK_SECRET` in `.env.local` (for approve/role DB sync).
  3. First SUPER_ADMIN email to bootstrap.

## Production (Vercel) connection — status
- Repo linked to Vercel project `peptsci-dashboard` (team `eonpro1s-projects`).
- Vercel prod env had only `PG*` + `AWS_*` (no `PGPASSWORD`, no `DATABASE_URL`, no Clerk) → confirms **RDS IAM auth** is the intended DB method.
- ✅ Added `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (pk_live/sk_live) to Production + Preview.
- ✅ Implemented RDS IAM auth in `lib/db-url.ts`: when `PGHOST`+`AWS_ROLE_ARN` present and no password/URL, `getPoolConfig()` returns discrete fields with an async `password` fn that mints an IAM token via `@aws-sdk/rds-signer` + `@vercel/functions/oidc` (lazy-imported; node-postgres calls it per connection so 15-min tokens rotate).
- Remaining for go-live:
  - [ ] RDS-side: enable IAM database authentication on the cluster AND grant the DB login (`PGUSER`) the `rds_iam` role (infra/AWS task in acct 631413806260).
  - [ ] Run `prisma migrate deploy` + seed against RDS (must run where the AWS role is assumable, e.g. a Vercel build/deploy step that mints a token to build DATABASE_URL — local machine can't reach that account).
  - [ ] Add `CLERK_WEBHOOK_SECRET` to Vercel once the webhook endpoint exists.
  - [ ] Deploy; verify sign-in + roles + client pricing on the live domain.
  - [ ] Rotate the shared `sk_live` key.

## Lessons
- `node-postgres` honors the `PGSSLMODE` env var even when a full connection string is passed; this breaks local (non-SSL) Docker Postgres. Fix: set the `ssl` option explicitly on the Pool based on host (see `lib/db-url.ts` `getPoolConfig`).
- For RDS IAM auth, pass `password` to the pg Pool as a function (`() => signer.getAuthToken()`); node-postgres calls it per new connection so tokens (~15 min TTL) are always fresh. Import `@aws-sdk/rds-signer` and `@vercel/functions/oidc` lazily (dynamic `import()`) so they never load in local dev or the Prisma CLI, which have no Vercel OIDC token.
- On Vercel serverless, call `attachDatabasePool(pool)` from `@vercel/functions` so connections are drained on function suspend (prevents RDS connection exhaustion). Guard it behind `process.env.VERCEL` and import lazily to keep it out of local/dev.
- The Prisma CLI (migrate/seed) cannot obtain Vercel OIDC credentials; run migrations against IAM-only RDS with a temporary admin `DATABASE_URL` or from inside the VPC.
- node-postgres `password` can be an async function, called per new connection — ideal for short-lived RDS IAM tokens (no static password needed).
- Standalone `tsx` scripts don't auto-load `.env.local` like Next.js does — run with `tsx --env-file=.env.local`.
- Docker Desktop on macOS can fail image pulls with "error getting credentials" when `credsStore: desktop` is broken; bypass with a temp `DOCKER_CONFIG` dir containing `{}` for public images.
- **LABELS BROKEN ON PROD = VECTOR FALLBACK (Jun 2 2026):** the printed label on Vercel showed the small "PeptSci" mark (no "research"), no molecule artwork, and an upright barcode — i.e. the engine's programmatic vector fallback, not the SVG artwork. Root cause: the label engine read the artwork template (`public/labels/peptsci-label-template.png`) and brand fonts (`public/fonts/labels/*`) from disk at runtime, but (a) those assets were untracked/undeployed, and (b) **Next.js does not include `public/` in serverless function bundles**, so `fs` reads fail on Vercel and the engine silently falls back. `outputFileTracingIncludes` is unreliable here (Next only applies it when the chunk-trace map is populated, which differs locally vs Vercel). Fix: embed the template + ASCII-subset brand fonts as base64 in `lib/labels/embeddedAssets.ts` (generated by `scripts/build-label-assets.py`, ~274 KB) and use them as a guaranteed fallback after the disk path; pdf-lib re-subsets at embed time so the PDF stays small. Verified by hiding the disk assets and rendering a proof — full artwork still produced. Lesson: never rely on `public/` `fs` reads inside serverless functions; bundle binary assets into the JS (base64/import) or trace them explicitly and verify on the target platform.
- **PROD SCHEMA CHANGES (cross-account RDS):** the prod Aurora cluster is in a different AWS account (`631413806260`) than the local dev creds, inside a VPC, reachable only from the Vercel runtime via IAM. The Prisma CLI can't reach it from a laptop. Pattern for additive migrations: (1) `prisma migrate dev` locally to create the migration file + apply to local Docker; (2) deploy; (3) run the exact `ADD COLUMN IF NOT EXISTS` DDL via a temporary secret-gated `POST /api/diag-migrate` endpoint that runs in the Vercel runtime (IAM), and insert a `_prisma_migrations` row (sha256 checksum of the migration.sql) to keep the CLI consistent; (4) remove the endpoint + redeploy. IMPORTANT ordering: apply the prod DDL immediately after deploy, because Prisma `findMany` SELECTs the new scalar columns and will 500 on every read until they exist.
- **CSV PRODUCT IMPORT (Jun 2 2026):** added `ProductVariant.supplierName` + `supplierSku` (migration `20260602022835_add_supplier_fields`). `lib/product-import.ts` = pure RFC-4180 CSV parser + header-alias mapping + per-row validation (9 unit tests). `POST /api/admin/products/import` upserts Product-by-name (case-insensitive) + ProductVariant-by-SKU; supports `validateOnly`. New `/products` admin page (nav "Products") with template download, drag/drop upload, client-side preview, and import results. GET `/api/admin/products` now returns supplier fields.
- **PROD-DB OUTAGE ROOT CAUSE (Jun 2 2026):** every `/api/admin/*` route 500'd in production with `Can't reach database server at 127.0.0.1:5433`. Cause: an untracked local `.env` containing `DATABASE_URL=postgresql://peptsci:peptsci123@127.0.0.1:5433/...` was being **uploaded by `vercel --prod` (CLI deploy)** and loaded by Next.js at runtime. Because `getDatabaseUrl()` returns `DATABASE_URL` whenever set, it short-circuited the RDS IAM path (`shouldUseRdsIamAuth`), so prod pointed at the dev Docker DB. Fix: added `.vercelignore` excluding `.env`/`.env.*` so local env files never ship to Vercel; prod then falls through to PGHOST+AWS_ROLE_ARN IAM auth. Confirmed via a temporary secret-gated `/api/diag-db` endpoint (since removed): IAM connect OK, 19 tables present (DB was already migrated). Lesson: when deploying via the CLI from a local dir, anything not in `.vercelignore` (incl. gitignored `.env`) can be shipped and override dashboard env vars.
- **TEST RUNNER: `tsx` not `ts-node` for node:test (Jun 4 2026):** `package.json` had no `"type": "module"`, so Node reparses `.ts` test files as ESM (the `MODULE_TYPELESS_PACKAGE_JSON` warning). Under that ESM path, `ts-node/register` (a CJS hook) does **not** resolve extensionless runtime relative imports — e.g. `import { parseCsv } from './product-import'` inside a tested module throws `ERR_MODULE_NOT_FOUND`. Existing tested modules (`product-import.ts`, `finance.ts`) only ever used `import type` for siblings (erased) or were self-contained, so they never hit this. New importer modules (`sales-import`/`competitor-import`/`distributor-order-import`) import `parseCsv` at runtime and failed. Fix: switch the `test`/`test:finance` scripts to `node --import tsx --test …` (tsx was already a devDep). tsx resolves extensionless TS imports under ESM, runs faster, and needed no source/tsconfig changes (keeps Next's bundler resolution untouched). Don't add `.ts` extensions to imports — tsconfig uses `moduleResolution: bundler` without `allowImportingTsExtensions` and Next would need extra config.
- **DATA-SOURCE MIGRATION COMPLETE (Jun 4 2026):** Google Sheets + Airtable fully removed; Postgres is the sole source of truth. New models `SalesRecord`/`CompetitorPrice`/`DistributorOrder(+Line)` (migration `20260604010000_add_sales_competitor_distributor`, idempotent). Sales has 3 writers into one table deduped by `orderId`/`stripePaymentIntentId`/`externalId`: platform-order capture sync, CSV import, and a Stripe backfill. Prod load order: deploy → `POST /api/admin/db/migrate` → `npm run backfill:sales` → (optional) Stripe backfill → CSV uploads. The legacy "missing Sheets/Airtable env = no data" failure mode no longer exists.

---

# PeptSci Platform - Comprehensive Analysis

## 📊 Executive Summary

**Platform Type**: Members-Only B2B Pharmaceutical Ordering Platform  
**Current Status**: 75% Complete (MVP Ready)  
**Tech Stack**: Next.js 15.5 | TypeScript | Clerk Auth | Prisma | Tailwind

---

# 🔍 COMPREHENSIVE PLATFORM ANALYSIS

## 1. CURRENT ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PEPTSCI PLATFORM                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐     ┌─────────────────────┐                    │
│  │   ADMIN PORTAL      │     │   CLIENT PORTAL     │                    │
│  │   /dashboard/*      │     │   /shop/*           │                    │
│  │                     │     │                     │                    │
│  │  • Dashboard KPIs   │     │  • Product Catalog  │                    │
│  │  • Customer Mgmt    │     │  • Shopping Cart    │                    │
│  │  • Inventory        │     │  • Checkout         │                    │
│  │  • Pricing          │     │  • Order History    │                    │
│  │  • P&L Reports      │     │  • Account Mgmt     │                    │
│  │  • PO Generator     │     │  • Payment Methods  │                    │
│  │  • Competitors      │     │                     │                    │
│  └─────────────────────┘     └─────────────────────┘                    │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                           API LAYER                                      │
│  /api/sales | /api/inventory | /api/orders | /api/search | /api/prices  │
├─────────────────────────────────────────────────────────────────────────┤
│                          DATA LAYER                                      │
│  Google Sheets (Current) ←→ PostgreSQL (Prisma Schema Ready)            │
├─────────────────────────────────────────────────────────────────────────┤
│                       EXTERNAL SERVICES                                  │
│  Clerk (Auth) | Stripe (Payments - Pending) | Email (Pending)           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. FEATURE INVENTORY

### ✅ COMPLETED FEATURES

| Module    | Feature                    | Status | Notes                      |
| --------- | -------------------------- | ------ | -------------------------- |
| **Auth**  | Clerk Integration          | ✅     | Middleware configured      |
| **Auth**  | Role-based access (schema) | ✅     | CLIENT, ADMIN, SUPER_ADMIN |
| **Admin** | Dashboard with KPIs        | ✅     | Real-time metrics          |
| **Admin** | Customer Management        | ✅     | View history, search       |
| **Admin** | Inventory Tracking         | ✅     | Auto-depletion from sales  |
| **Admin** | Pricing Management         | ✅     | View/export prices         |
| **Admin** | P&L Reporting              | ✅     | Monthly/YTD views          |
| **Admin** | Balance Sheet              | ✅     | Inventory valuation        |
| **Admin** | PO Generator               | ✅     | PDF export                 |
| **Admin** | Competitor Analysis        | ✅     | Price comparison           |
| **Shop**  | Product Catalog            | ✅     | Search, filter, grid/list  |
| **Shop**  | Shopping Cart              | ✅     | localStorage + drawer      |
| **Shop**  | Checkout Flow              | ✅     | 3-step process             |
| **Shop**  | Order History              | ✅     | Status tracking            |
| **Shop**  | Account Page               | ✅     | Profile, addresses         |
| **Shop**  | Payment Methods            | ✅     | Save cards for checkout    |
| **API**   | Authentication             | ✅     | All routes protected       |
| **API**   | Rate Limiting              | ✅     | Per-user limits            |
| **API**   | Input Validation           | ✅     | Zod schemas                |
| **Infra** | Structured Logging         | ✅     | Pino logger                |
| **Infra** | Error Boundaries           | ✅     | Graceful failures          |

### ⏳ PENDING FEATURES (For Members-Only Platform)

| Module      | Feature                            | Priority | Effort  |
| ----------- | ---------------------------------- | -------- | ------- |
| **Auth**    | Remove public landing page         | 🔴 P0    | 1 hour  |
| **Auth**    | Force login on all routes          | 🔴 P0    | 1 hour  |
| **Auth**    | Role enforcement (Admin vs Client) | 🔴 P0    | 2 hours |
| **Auth**    | Client approval workflow           | 🟠 P1    | 4 hours |
| **DB**      | PostgreSQL setup                   | 🟠 P1    | 2 hours |
| **DB**      | Migrate products to DB             | 🟠 P1    | 3 hours |
| **Payment** | Stripe integration                 | 🟠 P1    | 4 hours |
| **Orders**  | Admin order management             | 🟠 P1    | 4 hours |
| **Orders**  | Order status workflow              | 🟠 P1    | 3 hours |
| **Notif**   | Email notifications                | 🟡 P2    | 4 hours |
| **Audit**   | Activity logging                   | 🟡 P2    | 2 hours |

---

## 3. SECURITY ANALYSIS (Members-Only Focus)

### Current Security Posture

| Control            | Status     | Details                                      |
| ------------------ | ---------- | -------------------------------------------- |
| Authentication     | ⚠️ Partial | Clerk configured but not enforced everywhere |
| Authorization      | ❌ Missing | No role-based access control implemented     |
| API Protection     | ✅ Good    | All API routes require auth + rate limiting  |
| Input Validation   | ✅ Good    | Zod schemas on API routes                    |
| Secrets Management | ✅ Good    | Environment variables, no hardcoded secrets  |
| HTTPS              | ✅ Good    | Enforced in production                       |
| Session Management | ✅ Good    | Clerk handles sessions                       |

### 🚨 CRITICAL GAPS FOR MEMBERS-ONLY

1. **Landing page is public** (`/` redirects to `/dashboard` but should require login)
2. **Shop pages accessible without auth** (need to enforce login)
3. **No role separation** (Admin can access shop, Client can access admin)
4. **Client approval not enforced** (anyone can sign up and order)

### Recommended Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Unauthenticated User                                           │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │  /sign-in   │  ← Only public route                           │
│  └─────────────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐     ┌─────────────────────────────────┐        │
│  │ Check Role  │────▶│ ADMIN → /dashboard              │        │
│  └─────────────┘     │ CLIENT (Approved) → /shop       │        │
│                      │ CLIENT (Pending) → /pending     │        │
│                      └─────────────────────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. DATA ARCHITECTURE

### Current State: Google Sheets

| Data Type   | Source        | Records     | Refresh     |
| ----------- | ------------- | ----------- | ----------- |
| Sales       | Google Sheets | 218         | Real-time   |
| Inventory   | Google Sheets | 46 products | Real-time   |
| Prices      | Google Sheets | 46 SKUs     | Real-time   |
| Competitors | Google Sheets | Variable    | 5 min cache |

### Target State: PostgreSQL (Prisma)

| Model          | Purpose        | Relations                  |
| -------------- | -------------- | -------------------------- |
| User           | Authentication | → Client, AuditLog         |
| Client         | B2B Customer   | → Users, Orders, Documents |
| Product        | Catalog        | → Variants, Media          |
| ProductVariant | SKU-level      | → OrderItems, Inventory    |
| Order          | Transactions   | → Items, Documents, Audit  |
| OrderItem      | Line items     | → Variant                  |
| AuditLog       | Compliance     | → User, Order              |

### Migration Path

```
Phase 1: Keep Google Sheets for legacy data (read-only)
Phase 2: New orders go to PostgreSQL
Phase 3: Sync products to DB, use as primary
Phase 4: Archive Sheets, DB is source of truth
```

---

## 5. USER EXPERIENCE ANALYSIS

### Admin Portal (Staff)

| Page         | Purpose           | UX Score | Issues                      |
| ------------ | ----------------- | -------- | --------------------------- |
| Dashboard    | KPIs overview     | 9/10     | None                        |
| Customers    | Customer lookup   | 8/10     | Pagination needed for scale |
| Inventory    | Stock management  | 8/10     | Good                        |
| Pricing      | Price management  | 7/10     | No edit capability          |
| P&L          | Financial reports | 9/10     | Excellent                   |
| PO Generator | Create POs        | 8/10     | Good                        |

### Client Portal (Members)

| Page     | Purpose         | UX Score | Issues           |
| -------- | --------------- | -------- | ---------------- |
| Catalog  | Browse products | 9/10     | Beautiful UI     |
| Cart     | Review items    | 9/10     | Smooth drawer    |
| Checkout | Place order     | 7/10     | Payment not live |
| Orders   | Track orders    | 8/10     | Mock data only   |
| Account  | Profile mgmt    | 8/10     | Good             |

---

## 6. PERFORMANCE METRICS

| Metric           | Current         | Target  | Status         |
| ---------------- | --------------- | ------- | -------------- |
| First Load JS    | 102 kB          | <150 kB | ✅ Excellent   |
| Largest Page     | 287 kB (PO Gen) | <300 kB | ✅ Good        |
| Build Time       | ~15s            | <30s    | ✅ Good        |
| API Response     | <500ms          | <1s     | ✅ Good        |
| Lighthouse Score | ~85             | >90     | ⚠️ Needs audit |

---

## 7. RECOMMENDED ROADMAP

### Phase 1: Members-Only Lock-Down (1-2 days)

- [ ] Remove public access to all routes
- [ ] Force authentication on `/`
- [ ] Implement role-based routing
- [ ] Add "Pending Approval" state for new signups

### Phase 2: Database Migration (2-3 days)

- [ ] Set up PostgreSQL (Neon/Supabase free tier)
- [ ] Run Prisma migrations
- [ ] Seed products from Google Sheets
- [ ] Update shop to read from DB

### Phase 3: Payment Integration (2-3 days)

- [ ] Configure Stripe account
- [ ] Implement checkout session creation
- [ ] Handle webhooks for payment confirmation
- [ ] Connect saved cards to Stripe Customer

### Phase 4: Order Workflow (2-3 days)

- [ ] Admin order management page
- [ ] Order status updates
- [ ] Inventory deduction on fulfillment
- [ ] Email notifications

### Phase 5: Production Hardening (1-2 days)

- [ ] Security audit
- [ ] Performance optimization
- [ ] Error monitoring (Sentry)
- [ ] Backup strategy

---

## 8. COST ESTIMATES

| Service           | Tier          | Monthly Cost     |
| ----------------- | ------------- | ---------------- |
| Vercel            | Pro           | $20              |
| Clerk             | Free (5k MAU) | $0               |
| PostgreSQL (Neon) | Free          | $0               |
| Stripe            | Pay as you go | 2.9% + $0.30/txn |
| **Total Fixed**   |               | **$20/month**    |

---

# Previous Documentation

## Background and Motivation (Client Ordering System)

- **Request**: Build a complete Client Ordering System enabling B2B customers to browse products, add to cart, checkout, and track orders.
- **Business Goal**: Enable self-service ordering for approved clients, reducing manual order processing and improving client experience.
- **Technical Context**: Prisma schema already has Order, OrderItem, Client, User models. Need to build UI, APIs, and payment integration.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT PORTAL                             │
│  /shop/*  (Product Catalog, Cart, Checkout, Order History)      │
├─────────────────────────────────────────────────────────────────┤
│                        ADMIN PORTAL                              │
│  /dashboard/*  (Existing - Order Management, Fulfillment)       │
├─────────────────────────────────────────────────────────────────┤
│                          API LAYER                               │
│  /api/shop/*  (Catalog, Cart, Orders, Payment)                  │
│  /api/admin/*  (Order Processing, Client Management)            │
├─────────────────────────────────────────────────────────────────┤
│                        DATA LAYER                                │
│  PostgreSQL (Prisma) - Orders, Clients, Products                │
│  Google Sheets - Legacy Sales Data (Read-Only)                  │
├─────────────────────────────────────────────────────────────────┤
│                     EXTERNAL SERVICES                            │
│  Clerk (Auth) | Stripe (Payments) | Email (Notifications)       │
└─────────────────────────────────────────────────────────────────┘
```

## Key Challenges and Analysis

1. **Dual Data Source**: Need to sync product catalog between Google Sheets and PostgreSQL, or migrate fully to DB
2. **B2B Compliance**: Clients need approval before ordering (license verification, DEA compliance)
3. **Payment Flow**: Stripe integration for B2B with support for invoicing and credit terms
4. **Role-Based Access**: Clear separation between CLIENT and ADMIN roles
5. **Order Workflow**: DRAFT → SUBMITTED → APPROVED → FULFILLED → SHIPPED → COMPLETED
6. **Inventory Integration**: Deduct stock on order approval, not submission

## High-Level Task Breakdown

### Phase 1: Foundation (Core Infrastructure)

1. [ ] Set up PostgreSQL database with existing Prisma schema
2. [ ] Migrate product catalog from Google Sheets to DB
3. [ ] Create product seeding script
4. [ ] Configure Clerk roles (CLIENT vs ADMIN)
5. [ ] Set up Stripe account and keys

### Phase 2: Client Portal (Shopping Experience)

6. [ ] Create `/shop` layout with client navigation
7. [ ] Build product catalog page (`/shop/catalog`)
8. [ ] Implement product detail page (`/shop/catalog/[id]`)
9. [ ] Build shopping cart (localStorage + API)
10. [ ] Create cart summary component

### Phase 3: Checkout & Payments

11. [ ] Build checkout flow (`/shop/checkout`)
12. [ ] Implement address management
13. [ ] Integrate Stripe payment
14. [ ] Create order confirmation page
15. [ ] Send order confirmation email

### Phase 4: Order Management

16. [ ] Build client order history (`/shop/orders`)
17. [ ] Create order detail page (`/shop/orders/[id]`)
18. [ ] Add order tracking/status display
19. [ ] Build admin order management (`/admin/orders`)
20. [ ] Implement order status updates

### Phase 5: Client Onboarding

21. [ ] Create client registration flow
22. [ ] Build document upload (licenses, DEA)
23. [ ] Admin client approval workflow
24. [ ] Client profile management

### Phase 6: Polish & Production

25. [ ] Email notifications (order updates)
26. [ ] Audit logging
27. [ ] Performance optimization
28. [ ] Security audit
29. [ ] Documentation

## Data Models (Already in Prisma)

```prisma
model Client {
  id               String    @id
  organizationName String
  licenseNumber    String?
  onboardingStatus ClientOnboardingStatus
  orders           Order[]
  users            User[]
}

model Order {
  id            String      @id
  orderNumber   Int
  client        Client
  status        OrderStatus  // DRAFT → SUBMITTED → APPROVED → FULFILLED
  paymentStatus PaymentStatus
  items         OrderItem[]
  total         Decimal
}

model OrderItem {
  id        String
  order     Order
  variant   ProductVariant
  quantity  Int
  unitPrice Decimal
}
```

## API Endpoints to Build

### Shop APIs (Client-facing)

| Method | Endpoint                     | Description                |
| ------ | ---------------------------- | -------------------------- |
| GET    | `/api/shop/catalog`          | List products with filters |
| GET    | `/api/shop/catalog/[id]`     | Product details            |
| GET    | `/api/shop/cart`             | Get user's cart            |
| POST   | `/api/shop/cart`             | Add item to cart           |
| PUT    | `/api/shop/cart/[itemId]`    | Update cart item           |
| DELETE | `/api/shop/cart/[itemId]`    | Remove from cart           |
| POST   | `/api/shop/orders`           | Create order from cart     |
| GET    | `/api/shop/orders`           | List client's orders       |
| GET    | `/api/shop/orders/[id]`      | Order details              |
| POST   | `/api/shop/checkout/session` | Create Stripe session      |

### Admin APIs

| Method | Endpoint                          | Description             |
| ------ | --------------------------------- | ----------------------- |
| GET    | `/api/admin/orders`               | All orders with filters |
| PUT    | `/api/admin/orders/[id]/status`   | Update order status     |
| GET    | `/api/admin/clients`              | List all clients        |
| PUT    | `/api/admin/clients/[id]/approve` | Approve client          |

## UI Components to Build

### Shop Components

- `ProductCard` - Product grid item
- `ProductDetail` - Full product view
- `CartDrawer` - Slide-out cart
- `CartItem` - Individual cart line
- `CheckoutForm` - Multi-step checkout
- `AddressForm` - Shipping/billing
- `OrderSummary` - Order review
- `OrderStatusBadge` - Status indicator
- `OrderTimeline` - Status history

### Admin Components

- `OrdersTable` - Admin order list
- `OrderActions` - Approve/fulfill buttons
- `ClientApprovalCard` - Pending clients

## Project Status Board

| Component          | Status         | Notes             |
| ------------------ | -------------- | ----------------- |
| Database Setup     | 🔴 Not Started | Need DATABASE_URL |
| Product Migration  | 🔴 Not Started | Sheet → DB        |
| Shop Layout        | 🔴 Not Started | Client navigation |
| Product Catalog    | 🔴 Not Started | Grid + filters    |
| Shopping Cart      | 🔴 Not Started | Local + API       |
| Checkout Flow      | 🔴 Not Started | Multi-step        |
| Stripe Integration | 🔴 Not Started | Payment           |
| Order Management   | 🔴 Not Started | Client + Admin    |
| Client Onboarding  | 🔴 Not Started | Registration      |
| Notifications      | 🔴 Not Started | Email             |

## Success Criteria

1. ✅ Clients can browse product catalog without logging in
2. ✅ Approved clients can add products to cart
3. ✅ Clients can complete checkout with Stripe
4. ✅ Clients can view order history and status
5. ✅ Admins can process and fulfill orders
6. ✅ Inventory updates on order fulfillment
7. ✅ Email notifications for key events
8. ✅ Mobile-responsive shop experience

---

# Previous Work: Financial Reporting Enhancements (✅ COMPLETE)

## Background and Motivation

- **Request**: Enhance the Profit & Loss view to support month-specific and YTD reporting using paid orders by fulfillment product, and introduce a balance sheet summarizing inventory value and associated spend.
- **Business Goal**: Provide finance-ready insights that align revenue with cash recognition (paid invoices) and tie COGS directly to fulfilled products, while surfacing current asset posture.
- **Technical Context**: Data sourced from Google Sheets via `getSales`, `getInventory`, and distributor orders API; P&L page currently uses coarse estimates and mock fallbacks.

## Key Challenges and Analysis

1. Current P&L logic filters only by date ranges and uses estimated expenses; must pivot to actual paid orders with reliable COGS ties.
2. Need robust monthly aggregation (per calendar month) and YTD summary while ensuring only `InvoicePaid` orders contribute.
3. Balance sheet requires combining inventory levels with purchase cost data from distributor orders; need to avoid double counting and ensure currency consistency.
4. Must maintain performant client rendering (or move to server components) and ensure resilience if sheets data is unavailable (fallback strategy).
5. Security/compliance: avoid leaking sensitive financial data, keep API interactions cached, and ensure calculations handle missing or malformed sheet rows gracefully.

## High-level Task Breakdown

1. [x] Audit existing data utilities (`getSales`, `getInventory`, `getDistributorOrders`) to confirm required fields and identify gaps for monthly/YTD COGS alignment.
2. [x] Design calculation helpers for monthly P&L (paid orders only), YTD rollup, and balance sheet valuation.
3. [x] Implement shared-lib aggregation functions with unit tests (`lib/finance.ts`, `lib/__tests__/finance.test.ts`).
4. [x] Update `app/profit-loss/page.tsx` to consume helpers, add month selector, YTD metrics, and balance sheet snapshot.
5. [x] Document assumptions/usage and validate with live data (README updated, JSDoc added to finance helpers).

## New Request Analysis (Inventory Auto-Decrement)

- **Requirement**: When an order is recorded, reduce on-hand inventory for the corresponding product by the ordered vial count.
- **Unknowns**:
  - Source of truth for orders (Google Sheets `Sales` tab?) and whether we have write access via service account.
  - Expected timing (immediate upon submitting order form / upon marking paid?).
  - Handling of multiple products per order or product name normalization.
  - Desired behavior if inventory would go negative (block order vs allow but flag).
- **Risks**: Requires authorized writes to Google Sheets; need atomic updates to avoid race conditions; must ensure server environment holds credentials securely.

## Project Status Board

| Component                | Status      | Notes                                                                      |
| ------------------------ | ----------- | -------------------------------------------------------------------------- |
| Data Audit               | ✅ Complete | Verified sheet outputs for paid sales, inventory, and distributor orders   |
| Aggregation Helpers      | ✅ Complete | `lib/finance.ts` with unit coverage via Node test runner                   |
| P&L UI Update            | ✅ Complete | Month/YTD cards, product contribution, trend table                         |
| Balance Sheet UI         | ✅ Complete | Inventory valuation + spend summary integrated                             |
| Inventory Auto-Decrement | ✅ Complete | API returns inventory reduced by sold vials via `adjustInventoryWithSales` |
| Config Hardening         | ✅ Complete | Centralized env validation in `lib/config.ts`; no public API key fallbacks |
| Tests & Docs             | ✅ Complete | Unit tests and README/JSDoc documentation updated                          |

## Executor's Feedback or Assistance Requests

- Existing lint warnings in other areas remain unchanged; project-wide cleanup outside current scope.
- ✅ npm vulnerabilities addressed: Updated Next.js 15.0.3 → 15.5.9, jspdf → 4.0, @clerk/nextjs to latest. Remaining 5 low/high vulnerabilities are in transitive dev dependencies (ts-node/diff, prisma/@prisma/dev/hono) with minimal production risk.
- Inventory calculation currently derives remaining units from sales on read; if updates should persist back to Google Sheets, we'll need service-account write integration.
- Fixed Next.js 15.5 breaking change: `headers()` now requires `await` in `app/api/webhooks/clerk/route.ts`.

## Lessons

- Node 22 built-in test runner with `ts-node/register` works well for targeted TypeScript unit tests.
- Deriving types from helper signatures (`Parameters<typeof fn>`) avoids circular imports in tests.
- Inventory availability can be virtualized from sales data, enabling real-time depletion without requiring sheet writes.
- Centralized env parsing (zod) provides early warnings when Google Sheets credentials are missing.
- Next.js 15.5+ requires `await headers()` — breaking change from sync to async API. Update Clerk and other dependencies when upgrading Next.js.

---

# Codebase Audit Report (January 2026)

## Executive Summary

The PeptSci Dashboard is a well-structured Next.js 15 application with good TypeScript practices and comprehensive financial reporting. However, there are several security, functionality, and UX improvements needed before production deployment.

| Category      | Score | Status        |
| ------------- | ----- | ------------- |
| Code Quality  | 7/10  | Good          |
| Security      | 5/10  | ⚠️ Needs Work |
| Functionality | 7/10  | Good          |
| UI/UX         | 6/10  | Moderate      |
| Testing       | 6/10  | Moderate      |

---

## 1. CODE QUALITY

### ✅ Strengths

- TypeScript strict mode enabled (`"strict": true`)
- Good type definitions in `lib/sheets.ts` and `lib/finance.ts`
- Consistent code formatting
- Clear separation: `lib/` (logic), `components/` (UI), `app/` (routes)
- Unit tests for critical finance calculations
- JSDoc comments on public APIs

### ⚠️ Issues to Address

| Issue                            | Severity | Location                     | Recommendation                    |
| -------------------------------- | -------- | ---------------------------- | --------------------------------- |
| `getSales()` is 160+ lines       | Medium   | `lib/sheets.ts:118-283`      | Refactor into smaller functions   |
| Hardcoded "November"             | Medium   | `app/dashboard/page.tsx:125` | Use dynamic month name            |
| Console.log in production        | Low      | `lib/sheets.ts:277,324,447`  | Remove or use logger              |
| Duplicated data fetching pattern | Low      | Multiple pages               | Create custom hook `useDataFetch` |
| Missing error boundaries         | Medium   | Page components              | Add granular error boundaries     |

---

## 2. SECURITY

### ✅ Strengths

- Clerk authentication integrated
- Environment variables validated via Zod (`lib/config.ts`)
- `.gitignore` excludes `.env*.local`, `.clerk/`
- No hardcoded secrets in codebase
- Webhook signature verification in `app/api/webhooks/clerk/route.ts`

### 🚨 Critical Issues

| Issue                           | Severity    | Location            | Recommendation                     |
| ------------------------------- | ----------- | ------------------- | ---------------------------------- |
| **API routes unprotected**      | 🔴 Critical | `app/api/*`         | Add Clerk `auth()` checks          |
| No rate limiting                | High        | All API routes      | Implement rate limiting middleware |
| Error messages expose internals | Medium      | API error responses | Return generic messages            |
| No input validation             | Medium      | API query params    | Add Zod validation                 |
| CORS not configured             | Medium      | API routes          | Add explicit CORS headers          |

### Recommended Fix for API Protection

```typescript
// Example: app/api/sales/route.ts
import { auth } from '@clerk/nextjs/server'

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ... existing logic
}
```

---

## 3. FUNCTIONALITY

### ✅ Strengths

- Comprehensive P&L with monthly/YTD views
- Balance sheet with inventory valuation
- Real-time auto-refresh (60s interval)
- Multiple view modes (card/list)
- Data export capability (CSV)

### ⚠️ Issues to Address

| Issue                       | Severity | Location                      | Recommendation              |
| --------------------------- | -------- | ----------------------------- | --------------------------- |
| Competitors page empty      | High     | `lib/sheets.ts:463-466`       | Implement or remove route   |
| Search bar non-functional   | Medium   | `components/Header.tsx:63-68` | Implement search or remove  |
| No pagination               | Medium   | Large data tables             | Add pagination for >50 rows |
| PO Generator status unknown | Medium   | `app/po-generator/page.tsx`   | Verify functionality        |
| Missing data validation     | Medium   | Sheet data parsing            | Add Zod schemas             |

---

## 4. UI/UX

### ✅ Strengths

- Clean, modern design with brand consistency
- Responsive grid layouts
- shadcn/ui component library
- Loading skeletons for perceived performance
- View toggle (card/list) on inventory
- Gradient accents and hover effects

### ⚠️ Issues to Address

| Issue                      | Severity | Location                | Recommendation                    |
| -------------------------- | -------- | ----------------------- | --------------------------------- |
| Header overflows on mobile | High     | `components/Header.tsx` | Add hamburger menu                |
| No mobile navigation       | High     | Header component        | Implement responsive nav          |
| Font may not load          | Medium   | `globals.css:6-8`       | Add @font-face or use fallback    |
| No dark mode toggle        | Low      | UI                      | Add toggle (theme support exists) |
| KPI hardcoded month        | Medium   | Dashboard               | Dynamic month label               |
| Search placeholder only    | Medium   | Header                  | Implement or remove               |

### Mobile Navigation Recommendation

```tsx
// Add to Header.tsx
const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
// ... responsive menu with Sheet component
```

---

## 5. DATABASE & DATA LAYER

### Current State

- Prisma schema well-designed with proper relations
- Database URL configured but **not actively used**
- All data currently sourced from Google Sheets API

### ⚠️ Concerns

| Issue             | Severity | Recommendation                        |
| ----------------- | -------- | ------------------------------------- |
| Schema unused     | Medium   | Either migrate to DB or remove Prisma |
| No migrations     | Medium   | Run `prisma migrate dev` if using DB  |
| Dual data sources | Medium   | Consolidate on one source of truth    |

---

## 6. TESTING

### Current Coverage

- `lib/__tests__/finance.test.ts` - 3 tests ✅
- `lib/__tests__/inventoryAdjustments.test.ts` - 4 tests ✅

### ⚠️ Gaps

| Missing Tests                | Priority |
| ---------------------------- | -------- |
| `lib/sheets.ts` data parsing | High     |
| `lib/kpis.ts` calculations   | High     |
| API route handlers           | Medium   |
| Component rendering          | Low      |

---

## 7. PRIORITIZED ACTION ITEMS

### 🔴 P0 - Critical (Do Before Production)

1. [ ] Add authentication to all API routes
2. [ ] Implement mobile navigation
3. [ ] Remove/implement competitors page
4. [ ] Add rate limiting

### 🟠 P1 - High (Next Sprint)

5. [ ] Fix hardcoded month labels
6. [ ] Add pagination to data tables
7. [ ] Implement search functionality or remove
8. [ ] Add input validation to APIs

### 🟡 P2 - Medium (Backlog)

9. [ ] Refactor `getSales()` into smaller functions
10. [ ] Add error boundaries per page
11. [ ] Remove console.log statements
12. [ ] Add font-face declarations
13. [ ] Write tests for sheets.ts and kpis.ts

### 🟢 P3 - Low (Nice to Have)

14. [ ] Add dark mode toggle
15. [ ] Create custom data fetching hook
16. [ ] Consolidate DB strategy

---

## White-Label Storefronts Feature (Implemented)

### Overview
Clinics with PeptSci accounts can create subdomain-based white-label storefronts (e.g., drclinic.peptsci.com) to sell products to their end customers at custom retail prices. Orders auto-route through PeptSci backend for fulfillment.

### Architecture
- **Subdomain routing**: Middleware detects subdomain, rewrites to `/_storefront/` route group
- **Dynamic theming**: CSS variables injected from BrandingConfig (colors, fonts, logo, hero, footer)
- **Separate auth**: End customers use lightweight JWT auth (not Clerk) to avoid seat costs
- **Order flow**: RetailOrder -> auto-creates PeptSci Order under clinic's account at ClientPricing rates

### New Models (Prisma)
- Storefront, StorefrontProduct, StorefrontRetailPrice, EndCustomer, RetailOrder, RetailOrderItem
- Order.source enum (DIRECT | STOREFRONT) to distinguish origin

### Key Routes
- Admin: `/storefronts` (list/create/manage), `/storefronts/[id]` (detail)
- Clinic: `/shop/storefront-manage/**` (branding, products, pricing, orders)
- Public: `/_storefront/**` (catalog, PDP, cart, checkout, account)
- APIs: `/api/admin/storefronts`, `/api/clinic/storefront/**`, `/api/storefront/**`

### Remaining Work
- [ ] Stripe integration for end-customer payments
- [ ] Email notifications (order confirmation, shipping)
- [ ] DNS/Vercel wildcard subdomain configuration for production
- [ ] Image upload for logo/hero (currently URL-based)
- [ ] Prisma migration (`prisma migrate dev`)

---

## Stripe Connect — Production Incident (2026-06-02)

### Symptom
Vercel Observability: 98% error rate on `/api/webhooks/stripe` (98 reqs). Two errors:
`PrismaClientKnownRequestError` (83x) and `[STRIPE WEBHOOK] Not configured` (17x, pre-deploy).

### Root causes
1. **Platform-wide event flood**: endpoint is a Connect destination → received events for ALL
   connected accounts on the EONPro platform, not just `acct_1S34ayDhHXlGkLX4`.
2. **Missing migration in prod**: `stripe_payments` tables/columns were never applied to RDS.
   The build runs `next build` only; `prisma migrate deploy` can't run because prod uses RDS
   **IAM auth minted at runtime** (lib/db-url.ts) and the build env has no DB URL (resolves to a
   `localhost` placeholder → P1001 if migrate is in the build script).
3. One unguarded DB call (`webhookEvent.findUnique`) turned the missing-table error into a 500,
   which made Stripe retry → sustained storm.

### Fixes (deployed)
- Webhook: skip (200) events where `event.account !== STRIPE_CONNECTED_ACCOUNT_ID`; guard the
  dedup lookup so DB errors never 500. (commit: harden webhook)
- Reverted build script to `next build` (migrate-at-build fails under IAM auth).
- Added admin-only runtime migration runner `POST /api/admin/db/migrate` (+ GET probe) that applies
  prisma/migrations SQL via the live IAM connection, idempotently. Surfaced in `/settings/stripe`.

### Lessons
- With RDS IAM auth, migrations cannot run at build time. Apply them via the runtime connection
  (admin route) or an environment that can mint IAM tokens / reach RDS.
- Connect webhook endpoints receive events for every connected account; always filter by
  `event.account` before doing any work.
- Any DB call in a webhook handler must be guarded so it returns 2xx, never 500 (avoids retry storms).

### Action required (user)
Go to `/settings/stripe` → Database schema → **Check** then **Apply pending migrations**.

---

## Platform Maturity Assessment (Planner, 2026-06-11)

Benchmarked against `eonpro/eonpro` (which has GitHub Actions CI + security-scan + pre-deploy-check, Sentry, Vitest + Playwright, Docker, CONTRIBUTING/DEPLOYMENT docs, HIPAA audit docs).

### Scores (1-10)
| Area | Score | Headline |
|------|-------|----------|
| Database schema | 8 | Best-in-repo: normalized, indexed, snapshots, idempotency keys, audit models |
| API layer / security | 5.5 | Good new-route patterns; legacy read APIs miss admin RBAC; IDOR on /api/prices |
| Code structure | 7 | Clean lib/ separation, strict TS, only 2 `any`s; some dead code (validation.ts, ErrorBoundary) |
| UI/UX | 6 | Shop portal polished; admin console has no toasts, silent fetch errors, 400-650 line monoliths |
| Engineering ops | 5 | 12 unit test files, but no CI, no Sentry, no e2e; tracked `env.local` with live API key |

### Critical findings (P0)
1. `env.local` (no leading dot) tracked in git with a live Google Sheets API key → rotate + purge history.
2. Legacy APIs `/api/sales`, `/api/inventory`, `/api/competitors`, `/api/orders`, `/api/search` use `requireAuth()` only — any CLIENT can read full ops data. `/api/prices?clientId=` is an IDOR.
3. `requireSuperAdmin()` in lib/auth.ts is an alias of `requireAdmin()` (no-op elevation).
4. Clerk-missing fallback = full auth bypass (middleware + lib/auth.ts dev bypass).
5. `END_CUSTOMER_JWT_SECRET` falls back to a hardcoded dev secret in lib/end-customer-auth.ts.

### High-value gaps vs eonpro
- No GitHub Actions CI (eonpro: ci.yml, security-scan.yml, pre-deploy-check.yml, migrate.yml)
- No Sentry / error tracking (eonpro: sentry.client/server.config.ts)
- No e2e tests (eonpro: Playwright) and no component tests (eonpro: Vitest)
- In-memory rate limiting (single-instance only on Vercel)
- No /api/health endpoint; no toast system; ErrorBoundary + lib/validation.ts unused
- finance.test.ts imports deleted lib/sheets.ts → broken on current branch

### Proposed remediation order (pending user approval)
- P0 (security): rotate+purge env.local secret; add admin gate to 6 legacy APIs; fix /api/prices scoping; real requireSuperAdmin; fail-fast on missing Clerk/JWT secrets in prod
- P1 (ops): GitHub Actions (typecheck+lint+test), fix finance.test.ts, Sentry, /api/health
- P2 (UX): toast system, route-level loading/error boundaries, wire ErrorBoundary, empty states
- P3 (hardening): Upstash rate limit, AuditLog on imports/role changes/migrations, decompose 500+ line clients

### Executor — P0 security fixes (2026-06-12) ✅ COMPLETE
All P0 items implemented; `tsc --noEmit` clean; 96/96 unit tests pass.

1. **Secret hygiene** — `git rm --cached env.local` (file kept on disk, now gitignored via new `env.local` + `/env.local` rules). ⚠️ **User must still: (a) rotate the exposed `GOOGLE_SHEETS_API_KEY` in Google Cloud, (b) purge it from git history (BFG/`git filter-repo`) + force-push.** Untracking alone does NOT remove it from past commits.
2. **Legacy RBAC** — `/api/sales`, `/api/inventory`, `/api/competitors`, `/api/orders`, `/api/search` now `requireAdmin()` → 403 for non-admins (was any authenticated user). SearchCommand only renders in AdminHeader (legacy `components/Header.tsx` is unused), so no client breakage.
3. **/api/prices IDOR** — `?clientId=` branch now admin-only (403 otherwise); base SRP branch strips `unitCost`/margin for non-admins (shop storefront-manager only consumes `srp`). Admin dashboard/PO-generator still get full data.
4. **requireSuperAdmin()** — no longer an alias; forces `isAdmin=false` when caller is not SUPER_ADMIN. (No current callers, but now safe for future use.)
5. **Fail-closed secrets** — `lib/auth.ts` `requireAuth`/`requireAdmin` deny in production when Clerk unconfigured (dev bypass kept for local). `middleware.ts` returns 503 in prod when Clerk key missing. `lib/end-customer-auth.ts` resolves JWT secret at call time and throws in production if missing/default (build-safe — not evaluated at import).

Files changed: `.gitignore`, `lib/auth.ts`, `middleware.ts`, `lib/end-customer-auth.ts`, `app/api/{sales,inventory,competitors,orders,search,prices}/route.ts`.

Not done (needs user / out of P0 scope): key rotation + history purge, Upstash rate limiting, AuditLog expansion, PENDING/SUSPENDED enforcement at API layer.

P0 committed as `0303c31` (focused security commit; 11 files).

### Executor — P1 ops/observability (2026-06-12) ✅ COMPLETE
`tsc` clean, 96/96 tests pass, `next lint` clean (pre-existing warnings only).

1. **/api/health** — new public, unauthenticated probe (`app/api/health/route.ts`) that runs `SELECT 1`, returns 200 healthy / 503 degraded with db latency + commit sha. Added `/api/health` to middleware public routes.
2. **GitHub Actions CI** — `.github/workflows/ci.yml`: on push/PR to main, Node 22, `npm ci` → `prisma generate` → `typecheck` → `lint` → `test`. Concurrency-cancels superseded runs. Added `typecheck` script to package.json. (No `next build` step — needs DB/Clerk secrets.)
3. **Sentry** — installed `@sentry/nextjs@10.57`. Added `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts` (register + `onRequestError`), `instrumentation-client.ts`; wrapped `next.config.mjs` with `withSentryConfig`. All init calls `enabled: Boolean(dsn)` → zero overhead/no-op without DSN. Wired explicit capture in `app/error.tsx` and `components/ErrorBoundary.tsx`. Documented env vars in env-example.txt.

⚠️ Notes: `npm audit` reports 30 vulns (mostly transitive, surfaced by the Sentry dep tree) — review separately, did not run `npm audit fix` (risk of breaking changes). `next build` not run locally (needs env); CI covers typecheck/lint/test. Audit's "broken finance.test.ts" claim was stale — finance tests pass.

Files changed (P1, uncommitted): `app/api/health/route.ts`, `middleware.ts`, `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `next.config.mjs`, `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `app/error.tsx`, `components/ErrorBoundary.tsx`, `env-example.txt`.

P1 committed as `5715646`.

### Executor — Dependency vuln triage (2026-06-17) ✅ COMPLETE
`npm audit fix` (no --force). Result: **31 → 7 vulns; all 3 critical + 15 high + 2 low eliminated.** `tsc` clean, 96/96 tests pass, lint clean.

- Resolved (criticals): `@clerk/nextjs` auth-bypass, `jspdf` PDF injection. Highs: `next` (→15.5.19, DoS), `prisma` (→7.8.0), `lodash`, `minimatch`, `hono`, `js-cookie`, `flatted`, `defu`, `effect`, `picomatch`, plus moderates (dompurify, postcss-direct, svix, ajv, js-yaml, uuid, brace-expansion, chevrotain…).
- **Skew fix:** `npm audit fix` bumped `prisma` CLI to 7.8.0 but left `@prisma/client` at 7.2.0, which broke `prisma generate` (missing wasm runtime file). Realigned `@prisma/client` → ^7.8.0; `prisma generate` green. Only manifest change is that one line; everything else was lockfile-only.
- **Residual (7 moderate, accepted):** all require `npm audit fix --force` which would jump Next to a canary/major or break Prisma's dev CLI. They are (a) `@hono/node-server` under `@prisma/dev` (dev-only CLI tooling, not runtime) and (b) `postcss` bundled inside `next` (CSS-stringify XSS, not reachable with untrusted input at runtime). Re-evaluate when Next 16 stable / Prisma dev tooling ships fixes.

Dep fixes committed as `20cfbe0`; all P0/P1/dep commits now on `origin/main` (rebased under `d989ee4`).

### Executor — P2 UX (first increment, 2026-06-18) ✅
`tsc` clean, 96/96 tests pass, lint clean.

1. **Toast system** — installed `sonner`; `components/ui/sonner.tsx` wrapper (top-right, richColors, closeButton, Sofia font) mounted once in `components/Providers.tsx` (both Clerk-on and Clerk-off branches) so it works across dashboard + shop. Emit via `import { toast } from 'sonner'`.
2. **Route-level loading** — `app/(dashboard)/loading.tsx`: dark skeleton (title + 4 KPI cards + chart row + table) shown during segment navigation while the persistent header/footer stay mounted.
3. **Route-level error** — `app/(dashboard)/error.tsx`: dark error boundary with `Sentry.captureException`, dev-only error/digest detail, and a `reset()` retry.
4. **Toasts wired into silent handlers** — `DashboardClient`, `OrdersExpensesClient`, `PricingClient` refresh functions now return success booleans; manual refresh shows success/error toasts (background poll stays silent to avoid noise).
5. **Empty state** — `OrdersExpensesClient` orders table now renders a contextual empty row ("No distributor orders yet…" vs "No orders match this filter.").

### Executor — P2 UX (second increment, 2026-06-21) ✅
`tsc` clean, 96/96 tests pass, lint clean.

6. **Shop loading/error** — `app/shop/loading.tsx` (dark catalog skeleton) + `app/shop/error.tsx` (dark boundary, Sentry capture, retry).
7. **Storefront (sf) loading/error** — `app/sf/loading.tsx` + `app/sf/error.tsx`, theme-neutral via `currentColor`/`color-mix` so they adapt to each tenant's branding; retry button uses `--sf-primary`.
8. **ErrorBoundary activated** — wrapped `ChartCard`'s content in the (previously dead) `ErrorBoundary` with a "Chart unavailable" fallback; protects every chart across dashboard/competitors/P&L from taking down the page.
9. **Empty-state audit** — confirmed users/clients/products/client-pricing/CustomerPricing already handle loading+empty; the real gap (OrdersExpensesClient) was fixed in increment 1. DataTable has a built-in "No results." row.

Remaining P2 backlog (deferred, larger refactors): react-hook-form field-level validation, decompose 400–650 line client monoliths (shop/checkout 655, profit-loss 575, products 526, po-generator 495), shop/sf per-page granular skeletons.

### Executor — Email infrastructure (AWS SES) (2026-06-22) ✅
Decisions: AWS SES (matches eonpro), full account lifecycle, from `no-reply@peptsci.com`. `tsc` clean, 96/96 tests, lint clean.

**New module `lib/email/`:**
- `client.ts` — SES v2 driver (`@aws-sdk/client-sesv2`). `sendEmail()` never throws; returns `{ok,skipped,messageId,error}`. **Gated by `EMAIL_ENABLED==='true'`** — logs + skips otherwise (build/dev/preview safe). Lazy client construction; region from `EMAIL_AWS_REGION`→`AWS_REGION`→`us-east-1`; optional `EMAIL_REPLY_TO`, `EMAIL_CONFIGURATION_SET`.
- `templates.ts` — branded inline-style HTML + plain-text for: welcome, partnerApproved, partnerRejected (optional reason), partnerNeedsInfo (optional message). Shared `layout()` with PeptSci palette + CTA.
- `index.ts` — intent senders: `sendWelcomeEmail`, `sendPartnerApprovedEmail`, `sendPartnerRejectedEmail`, `sendPartnerNeedsInfoEmail`.

**Wired in:**
- `app/api/webhooks/clerk/route.ts` → welcome email on `user.created` (to primary email).
- `app/api/admin/users/[id]/approve/route.ts` → approved email (looks up user email/firstName from DB).
- `app/api/admin/clients/[id]/route.ts` PATCH → approved / rejected / needs-info based on `onboardingStatus`; recipients = practice `contactEmail` + linked user emails (deduped).

**Env (env-example.txt):** `EMAIL_ENABLED` (default false), `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_AWS_REGION`, `EMAIL_CONFIGURATION_SET`. AWS creds via standard provider chain; IAM needs `ses:SendEmail`.

⚠️ Go-live (user): verify the `peptsci.com` domain (or sender) in SES, move SES out of sandbox, grant `ses:SendEmail` to the deploy IAM principal, then set `EMAIL_ENABLED=true`. Until then sends are logged-and-skipped (no errors).

---

## P0 BACKBONE — In-app Notifications + Vercel Cron (Jun 28 2026) [PLANNER]

> **Grounded in the real `eonpro/eonpro` repo** (cloned to `../eonpro-ref`). EonPro is a HIPAA telehealth/pharmacy monorepo; we port only the commerce/fulfillment-relevant backbone and skip all Rx/telehealth (rx-queue, soap-note, dosespot, bloodwork, prescriber, appointments, affiliates). Email (AWS SES), FedEx labels, and package photos are **already built** in PeptSci. The remaining P0 gap from the roadmap is the **in-app Notification system + background jobs/Vercel Cron**.

### What EonPro actually does (reference patterns, verified by reading the code)
- **`Notification` model** (`prisma/schema/notification.prisma`): category enum (PRESCRIPTION/PATIENT/ORDER/SYSTEM/APPOINTMENT/MESSAGE/PAYMENT/REFILL/SHIPMENT), priority (LOW/NORMAL/HIGH/URGENT), title/message/actionUrl/metadata(Json), isRead/readAt, isArchived/archivedAt, **sourceType+sourceId for dedup/audit**, indexed by (userId,isRead), (userId,createdAt desc), (sourceType,sourceId). Plus an `EmailLog` with a full delivery lifecycle (QUEUED→SENT→DELIVERED→OPENED→CLICKED→BOUNCED→COMPLAINED→FAILED→SUPPRESSED).
- **`notificationService`** (`src/services/notification/notificationService.ts`): `createNotification` skips duplicates when `sourceType+sourceId` already exists; optional templated email send (non-blocking, gated by a user `emailNotificationsEnabled` flag); `notifyAdmins`/`notifyProviders` bulk broadcast; paginated `getUserNotifications` with unreadCount; `markAsRead`/`markManyAsRead`/`markAllAsRead`; `archive*`; `cleanupOldNotifications(90d)`. WebSocket push is best-effort/optional.
- **Cron auth** (`src/lib/cron/tenant-isolation.ts` → `verifyCronAuth(req)`): require `Authorization: Bearer ${CRON_SECRET}`; if `CRON_SECRET` unset in prod, fall back to trusting Vercel's `x-vercel-cron` header (logged as degraded). Each cron route: `export const dynamic='force-dynamic'`, `maxDuration`, GET+POST → `verifyCronAuth` → 401 if bad.
- **`vercel.json` `crons[]`**: e.g. `fedex-tracking` hourly `0 * * * *`, `shipment-reminders` `0 10 * * *`, `process-scheduled-emails` `*/5 * * * *`, `email-digest` weekly, `health-monitor` `*/5 * * * *`.
- **Outbox**: `WebhookDelivery` gains `idempotencyKey` (unique per webhook), `nextAttemptAt` (drain cursor), `movedToDlqAt`/`dlqReason` (DLQ), drained by `cron/outbound-webhook-drain`.

### Mapping onto PeptSci (decisions locked)
- **D-NOTIF-RECIPIENT** → Notifications target **admin `User`s** (role ADMIN/SUPER_ADMIN). Client-facing alerts stay email-only for now (clients already get SES emails). `userId` scopes to `User.id` (String cuid); optional `clientId` for future client-portal notifications.
- **D-NOTIF-CATEGORY** → trim to PeptSci domain: `ORDER`, `PAYMENT`, `SHIPMENT`, `INVENTORY`, `CLIENT`, `SYSTEM`. (Drop PRESCRIPTION/APPOINTMENT/REFILL — out of B2B scope.)
- **D-NOTIF-EMAIL** → reuse existing `lib/email` intent senders; notification service optionally fires an email (non-blocking, never throws). No new EmailLog table in this increment (defer delivery-event tracking to a follow-up); rely on SES configuration set + existing logging.
- **D-NOTIF-REALTIME** → **no WebSocket** (Vercel serverless). Admin bell **polls** `/api/admin/notifications/unread-count` every ~60s; full list on open. (WebSocket/SSE is a later optional upgrade.)
- **D-CRON-AUTH** → port `verifyCronAuth` verbatim (Bearer `CRON_SECRET` + `x-vercel-cron` safety net). Add `CRON_SECRET` to env-example.
- **D-MIGRATION** → idempotent SQL migration (`CREATE TABLE IF NOT EXISTS` + enum guard) consistent with existing runtime migrate runner `/api/admin/db/migrate`; extend its `probeSchema()` to report the `Notification` table.

### Phase 1 — Notification core (schema + service + APIs + bell UI)
1. **Schema + migration.** Add `Notification` model + `NotificationCategory`/`NotificationPriority` enums to `schema.prisma` (mirror EonPro, trimmed). Author idempotent `prisma/migrations/<ts>_add_notifications/migration.sql`. Extend `/api/admin/db/migrate` `probeSchema()` + `isSchemaUpToDate` for the new table. **Success:** `prisma generate` + `tsc` clean; migrate-runner reports the table.
2. **`lib/notifications/service.ts`.** Port `notificationService` (no WebSocket): `createNotification` (sourceType+sourceId dedup), `notifyAdmins`, `notifyUser`, `getUserNotifications` (paginated + unreadCount), `getUnreadCount`, `markAsRead`/`markManyAsRead`/`markAllAsRead`, `archive*`, `cleanupOldNotifications`. Optional non-blocking email hook. **TDD:** unit-test dedup + unread counting with a mocked prisma. **Success:** tests green.
3. **Admin APIs.** `GET /api/admin/notifications` (paginated list), `GET /api/admin/notifications/unread-count`, `POST /api/admin/notifications/mark-read` (ids[] | all), `POST /api/admin/notifications/[id]/archive`. All `requireAdmin()`-gated, scoped to the caller's `User.id`. **Success:** authz enforced; tsc clean.
4. **Bell UI.** Notification bell + dropdown in `components/AdminHeader.tsx` (unread badge from a 60s poll; mark-read on open; "view all" → list; actionUrl deep-links). Toasts via existing `sonner`. **Success:** badge updates; clicking marks read; deep-links work.

### Phase 2 — Vercel Cron jobs (the operational value)
5. **`lib/cron/auth.ts`** — port `verifyCronAuth`. Add `vercel.json` with the `crons[]` schedule. Add `CRON_SECRET` to `env-example.txt`. **Success:** unauthorized cron → 401; Vercel-triggered → runs.
6. **FedEx tracking poller** — add `trackShipment()` to `lib/fedex.ts` (FedEx Track API; degrades to 422 `FEDEX_UNCONFIGURED` when creds absent) + `lib/shipping/fedex-tracking-poller.ts` that selects non-terminal orders (`trackingNumber` set, `shippingStatus` not DELIVERED), updates `Order.shippingStatus`/`shippedAt`, and fires an `ORDER`/`SHIPMENT` notification (+ optional client email) on DELIVERED. Route `app/api/cron/fedex-tracking/route.ts` (`0 * * * *`). **TDD:** poller status-mapping + terminal-state guard. **Success:** sandbox tracking transitions an order to DELIVERED + notifies.
7. **Low-stock alert** — `app/api/cron/low-stock/route.ts` (`0 13 * * *`): scan `ProductVariant.inventoryOnHand <= reorderLevel` (active), dedup by `sourceId=variantId+yyyymmdd`, notify admins (`INVENTORY`). **Success:** below-threshold variants produce one notification/day.
8. **Expiring-BUD alert** — `app/api/cron/expiring-batches/route.ts` (`0 13 * * *`): scan `InventoryBatch.bud` within N days (RECEIVED, qtyOnHand>0), dedup per batch/window, notify admins (`INVENTORY`). **Success:** soon-to-expire batches notify once.

### Out of scope this increment (tracked for later)
- `EmailLog` delivery-event webhook (SES → bounce/complaint/open tracking) + email-analytics page.
- Webhook **outbox** (`WebhookDelivery` idempotency/DLQ + drain cron) — current Stripe webhook already idempotent via `WebhookEvent`; outbox is a hardening follow-up.
- SMS via Twilio (plugin available) — add once a transactional SMS use-case is confirmed.
- Client-portal (shop) notification center; WebSocket/SSE realtime.

### Global success criteria
`prisma generate` + `tsc --noEmit` + `next lint` + `npm test` all green; notifications are idempotent (sourceType+sourceId) and email sends never block/throw; crons are `CRON_SECRET`-guarded and visible via the admin notification log; degrade gracefully when FedEx/SES/CRON_SECRET unset.

### Status board
- [ ] P0-N1 Notification schema + idempotent migration + migrate-runner probe
- [ ] P0-N2 lib/notifications/service.ts (+ unit tests)
- [ ] P0-N3 Admin notification APIs (list/unread/mark-read/archive)
- [ ] P0-N4 Admin header notification bell + dropdown
- [ ] P0-N5 lib/cron/auth.ts (verifyCronAuth) + vercel.json + CRON_SECRET env
- [ ] P0-N6 FedEx tracking poller cron → DELIVERED + notify (+ trackShipment in lib/fedex.ts)
- [ ] P0-N7 Low-stock alert cron
- [ ] P0-N8 Expiring-BUD alert cron
