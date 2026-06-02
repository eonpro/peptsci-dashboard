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
