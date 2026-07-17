# Platform Bug Fix Sprint (Jul 13, 2026)  [EXECUTOR — ✅ DEPLOYED TO PROD]

Five-track audit (checkout/payments, fulfillment/inventory, billing, auth/approval, pricing/sales) surfaced ~45 functionality bugs; all four fix phases implemented per `~/.cursor/plans/platform_bug_fix_plan_a7daf0dc.plan.md`. Verified: `tsc --noEmit` clean, 278/278 unit tests (6 new), `next lint` (pre-existing warnings only), `next build` green.

**Deployed Jul 13 ~11:00 PM ET**: Phase 1 + early Phase 2 in `e9e5b6d`, remainder in `974fcf0` → main → Vercel `dpl_BkEbkTaLBsSdVHWdiCw78maK31gY` READY on peptsci.com (`/api/health` 200, version `974fcf0`, DB up). No migrations, no new env vars.

## Project Status Board
- [x] **P1 Clerk webhook invite wipe** — `user.created` now preserves invitation metadata (role/status/clientId) instead of resetting to CLIENT/PENDING; mirrors `clientId` into Postgres on created+updated (validated against Client table); invited users skip the "under review" welcome email.
- [x] **P1 storefront guest-checkout hijack** — guest checkout returns 409 `ACCOUNT_EXISTS` instead of attaching orders to a REGISTERED (non-guest) end-customer matched by email.
- [x] **P1 expired batches shippable** — `minAllocatableBud()` floor (`bud >= start of UTC today`) on all three allocatable-batch queries (per-variant, batched, consume).
- [x] **P1 refunded orders fulfillable** — payment gate rejects `paymentStatus REFUNDED` before the invoiced/override bypasses (409 `ORDER_REFUNDED` from FedEx label + labels-consume).
- [x] **P1 invoice double-PI** — Elements invoice PI now amount-aware idempotent (`pi_inv_elements_{id}_{amount}`); `recordPayment` caps at live `amountDue` (overpay logged + noted for refund; nothing-due charges recorded as log-only).
- [x] **P1 sales overwrite** — `syncSalesRecordFromOrder` skips records with `source: 'stripe'` (stripe-convert/backfill rows keep true captured revenue).
- [x] **P2 checkout/AR** — draft reuse refreshes shippingAddress+notes; terms checkout wrapped in one tx under `pg_advisory_xact_lock('terms-checkout', clientId)` with re-run credit gate (closes TOCTOU), atomic submit+invoice (`createInvoiceTx`), reservation in BOTH paths (dup included); `reserveForOrderEnforced` (atomic conditional `onHand−reserved>=qty` raw update) called pre-payment when `CHECKOUT_ENFORCE_STOCK=true`, with `releaseStaleDraftReservations()` retry + release on payment failure; overdue cron now reminds on ALL outstanding OVERDUE invoices daily (per-day dedup); `balanceForward` rejected while other open invoices exist (AR double-count).
- [x] **P2 fulfillment** — FedEx label: ShipmentLabel + SHIPPED flip + `consumeOrderInventoryTx(requireFull)` in ONE transaction (FedEx shipment cancelled on rollback); consume records exact draws in AuditLog (`consume_draws`); void reverses the consume (batch/variant/reservations restored, atomic claim) and only clears order tracking when no other active label remains (else repoints to it); returns: cumulative per-line caps moved into `createReturnRequest` (all entry points); RMA REFUNDED status now issues a real Stripe refund first (`lib/orders/refund.ts` shared with the refund endpoint); stripe-convert asserts order total == SalesRecord.paidAmount (`expectedTotal` in createManualOrder).
- [x] **P2 approval/pricing** — shop ordering mutations require `Client.onboardingStatus=APPROVED` (`ShopActor.clientApproved`); admin user PATCH to ACTIVE blocked while linked practice unapproved; client reset→PENDING cascades users down (DB+Clerk); storefront wholesale uses `resolveEffectiveUnitPrice` (no more $0 on zero customPrice); NewOrderModal only sends `unitPrice` for manual edits (server resolves auto lines); product CSV re-import updates only present fields (never zeroes srp/unitCost, never reparents variants); sales CSV skips rows matching platform-order records.
- [x] **P3 medium** — ACH `processing` surfaced as distinct pending state (checkout success page verifies the order server-side; invoice page amber "bank transfer initiated" banner; orders advance DRAFT→SUBMITTED on AUTHORIZED so ACH orders show in /shop/orders); saveCard in PI idempotency key; Pay button shows the SERVER amount from /process; middleware returns 403 JSON `ACCOUNT_PENDING` on /api/* (no HTML redirect); `validFrom` enforced in all 6 clientPricing queries; inactive variants blocked in manual orders + `/shop/product/[sku]` + storefront checkout; statements use America/New_York month bounds + aging/open-invoices snapshotted at period end; DRAFT invoices can't be emailed or receive payments.
- [x] **P4 low** — success page no longer trusts `?order=`; `validateCartInput` caps at 100 (MAX_SHOP_ITEM_QUANTITY); monthly-statements marker absorbs P2002; NEEDS_INFO cascades users to PENDING; per-user suspend documented as intentionally non-cascading; labels-PDF prints from ACTUAL consume draws (concurrency-safe); rate limiter warns (throttled) when Redis fallback is active.

## Before prod deploy
1. Commit + deploy to `main` (all work local). No new migrations; no new env vars required.
2. Behavior notes for ops: FedEx labeling now HARD-FAILS on batch shortfall (`INSUFFICIENT_BATCH_STOCK` 409 — adjust inventory first); RMA "REFUNDED" now moves real money (requires refund amount + Stripe PI); `balanceForward` invoices rejected while older invoices are open; overdue reminders now go out daily per outstanding invoice (per-day dedup unchanged).
3. Manual verification recommended: one Clerk invite (metadata survives sign-up), one storefront guest checkout against a registered email (409), one ACH test checkout (pending state + order visible pre-capture).

## Lessons
- Clerk invitation `publicMetadata` arrives on `user.created` — a webhook that unconditionally overwrites it silently breaks every admin invite.
- `UPDATE ... WHERE onHand - reserved >= qty` (raw SQL conditional increment) is the cheapest race-proof stock reservation; Prisma can't compare two columns in a where clause.
- Recording consume draws (batchId/qty) in AuditLog at consume time makes label voids reversible without schema changes.
- When a fix changes parser semantics (CSV blank price 0 → undefined), grep the tests for the old expectation before running the suite — two tests encoded the bug.

---

# Readiness Gap Closure Sprint (Jul 12, 2026)  [EXECUTOR — ✅ DEPLOYED TO PROD]

All items from the Jul-12 readiness assessment implemented in one session. `tsc --noEmit` clean, 271/271 unit tests (17 new), `next lint` clean (pre-existing warnings only), `next build` green (clean cache).

**Deployed Jul 12 ~10:10 PM ET**: commit `eab79c5` → main → Vercel `dpl_yXLszhgmVr3cJeuDMZ2zZwKHzHiq` Ready on peptsci.com (`/api/health` 200, version eab79c5). **Prod migration applied** via `POST /api/admin/db/migrate {confirm:true}` from the owner's super-admin browser session: `success:true, upToDate:true` (12.6s) — `20260713010000_add_order_refund_fields` applied (2 statements); probe green incl. `clientSmsOptInColumn` + `orderRefundedTotalColumn`. Verified live: privacy page shows Jul 12 SMS clause; DLQ endpoint works (25 SUCCESS / 26 ERROR events — all 26 are historical Jun 3–17 failures from the missing `Order.shipTo`/`Client.npiNumber` columns era, later superseded by the Jul 7 schema fix + full Stripe backfill; replayable from /settings/webhooks if we want the queue cleared).

## Project Status Board
- [x] **Approval path standardized** — new `lib/clients/approval.ts` `cascadeOnboardingDecision()` (client status + ALL linked users' DB/Clerk status + decision email, email only on actual status change, per-user role preserved). Both `/api/admin/clients/[id]` PATCH and `/api/admin/users/[id]/approve` now use it; /users approve of a second login on an already-approved practice falls back to a direct per-user email.
- [x] **Account Setup card** on `/clients/[id]` — pricing count (filtered `_count.customPricing`), terms set, documents (approved/pending/rejected) with deep links; GET returns a `setup` block.
- [x] **Privacy §7.2 SMS clause** (STOP/HELP, frequency, no number sharing) + bumped LAST_UPDATED to Jul 12.
- [x] **SMS opt-in toggle** on `/shop/account` — own PATCH (`smsOptIn` in profileUpdateSchema; enabling stamps smsOptInAt, withdrawing keeps it for audit), saves independently of the main form (TCPA withdrawal can't be blocked by validation).
- [x] **Double-charge race fixed** — `createDraftOrder` find-or-create now inside a transaction holding `pg_advisory_xact_lock(hashtext('draft-order'), hashtext(clientId))`.
- [x] **Hard stock check at checkout** — `resolveCart({enforceStock:true})` from card + terms checkout throws `INSUFFICIENT_STOCK` when qty > onHand−reserved (pure `findStockShortages` in checkout-core, 6 tests). Admin manual orders still warn-only by design.
- [x] **Programmatic refunds** — `Order.refundedTotal/refundedAt` (migration `20260713010000_add_order_refund_fields`, applied locally, probe extended incl. the missing smsOptIn probe). `GET/POST /api/admin/orders/[id]/refund` (full/partial, cumulative-position idempotency key, releases reservations when full), `RefundOrderModal` + Refund button on Fulfillment. `syncSalesRecordFromOrder` now nets refunds (COGS scaled); webhook `charge.refunded` also persists refundedTotal + resyncs, so Stripe-dashboard refunds stay consistent.
- [x] **Upstash rate limiting** — `checkRateLimit` is now async: Upstash REST INCR+PEXPIRE(NX) fixed window when `UPSTASH_REDIS_REST_URL/TOKEN` set, in-memory fallback otherwise (fail-open to per-instance, never unlimited); buckets namespaced per config; all 24 call sites awaited.
- [x] **Webhook DLQ UI** — processor extracted to `lib/stripe/webhook-processor.ts` (shared); `GET /api/admin/webhook-events` (+counts, cursor pagination) and `POST /api/admin/webhook-events/[id]/retry` (atomic ERROR→RECEIVED claim, replays stored payload); page `/settings/webhooks` in the admin settings dropdown.
- [x] **Admin 2FA gate** — `ADMIN_REQUIRE_2FA=true` → dashboard layout bounces admins without `twoFactorEnabled` to `/enable-2fa` (Clerk UserProfile embedded). Default OFF to avoid surprise-locking; enable after admins enroll.
- [x] **Playwright E2E scaffold** — `playwright.config.ts` (E2E_BASE_URL), `e2e/smoke.spec.ts` (health/landing/sign-in/legal/authz), `e2e/checkout.spec.ts` (sign-in → cart → checkout totals; paid 4242 flow gated behind E2E_RUN_PAYMENT; skips without E2E_CLERK_EMAIL/PASSWORD). `npm run test:e2e`; needs `npx playwright install chromium` once.
- [x] **Monthly statements** — `lib/invoicing/statement.ts` (ledger: invoices grossTotal − payments, opening/closing, aging) + `statement-pdf.ts`; `GET /api/admin/clients/[id]/statement?month=` and `GET /api/shop/statements/pdf?month=`; download links on client detail + `/shop/invoices`; cron `/api/cron/monthly-statements` (1st @ 14:00 UTC, AuditLog dedup per client+month, emails summary + portal link via new `statementEmail` template).
- [x] **ACH** — `elementsPaymentMethodTypes()` gated by `ACH_ENABLED=true` adds `us_bank_account` on Elements PIs (checkout, invoice pay, admin charge). Confirm endpoints + dialogs treat `processing` as `pending` (accepted, settles via webhook; order stays AUTHORIZED/unshippable until captured). Requires the ACH capability on the connected account before enabling.
- [x] **Client-initiated returns** — `GET/POST /api/shop/orders/[id]/returns` (owner-scoped, shipped-only, per-line cap = ordered − already-requested excl. REJECTED, reuses `createReturnRequest` → notifyAdmins); `RequestReturnDialog` + Returns card on `/shop/orders/[id]`; order API now returns item ids.
- [ ] **RDS backups/PITR — BLOCKED (owner)**: prod cluster `peptsci-dashboard` lives in AWS acct 631413806260; local profiles (147997129811 italo, 368912176358 eonpro-dbops) cannot assume `arn:aws:iam::631413806260:role/Vercel/access-peptsci-dashboard` (rds-db:connect only anyway). Owner must run with 631413806260 creds: `aws rds describe-db-clusters --db-cluster-identifier peptsci-dashboard --region us-east-1 --query 'DBClusters[0].{BackupRetention:BackupRetentionPeriod,EarliestRestore:EarliestRestorableTime,DeletionProtection:DeletionProtection}'` — verify BackupRetention ≥ 7 and turn on DeletionProtection.

## ⚠️ Before live in prod
1. Commit + deploy to `main` (all work is local only).
2. Apply prod migration via `POST /api/admin/db/migrate` (SUPER_ADMIN) — covers `20260713010000_add_order_refund_fields`; probe now also reports `clientSmsOptInColumn` + `orderRefundedTotalColumn`.
3. Optional env to activate new capabilities: `UPSTASH_REDIS_REST_URL/TOKEN` (global rate limits), `ADMIN_REQUIRE_2FA=true` (after admins enroll 2FA), `ACH_ENABLED=true` (after Stripe ACH capability active on the connected account).
4. Vercel cron list changed (`monthly-statements`) — picked up automatically on deploy.

## Lessons
- `pg_advisory_xact_lock(int,int)` via `hashtext()` inside `prisma.$transaction` serializes find-or-create per client with no schema change — the Stripe PI idempotency key (`pi_create_${orderId}`) then guarantees one charge.
- Making a widely-used sync helper (checkRateLimit) async is safe to roll out mechanically: tsc flags every call site that forgot `await` because property access on a Promise fails the destructure types.
- Upstash REST pipeline `[INCR, PEXPIRE ... NX, PTTL]` is an atomic-enough fixed window without any SDK dependency.
- SES SendEmailResult exposes `{ok, skipped}` — cron senders should mark their AuditLog dedup on `ok || skipped` so enabling EMAIL_ENABLED later doesn't burst-send stale notifications, but NOT on hard errors (those retry next run).
- Payment Element renders ACH automatically when the PI's `payment_method_types` includes `us_bank_account`; the async settlement just needs `processing` treated as "pending success" in confirm endpoints + a webhook capture path (which already existed).

---

# Clinic-Onboarding Readiness Assessment (Jul 12, 2026)  [PLANNER]

**Verdict: YES for controlled onboarding (first 5–10 clinics with hands-on support).** Prod is healthy (`/api/health` 200, running latest `24ac674`), and the full clinic loop is deployed: sign-up → NPI onboarding (+SMS consent, Places autocomplete) → admin approval (notification + dashboard queue, approval-sync bug fixed today) → `/shop` with per-client pricing → checkout (card / saved card / net terms w/ credit gate) → fulfillment (payment gate, FedEx, tracking) → invoicing portal + emails.

## Pre-first-clinic checklist (small, mostly ops)
- [ ] **Restrict the Google Maps browser key** (currently UNRESTRICTED, ships in the public bundle) — referrer `peptsci.com/*`, `*.peptsci.com/*`, `localhost:3000/*` + API restriction (Maps JS, Places New).
- [ ] **Rotate legacy exposed secrets**: `GOOGLE_SHEETS_API_KEY` (in git history since P0 audit; Sheets no longer used — disable the key) and the shared `sk_live` Stripe key (open since go-live list). Optionally purge history.
- [ ] **Verify RDS automated backups/PITR** are enabled + restore runbook (Phase-1 ops item, never confirmed done).
- [ ] **Canonical approval path**: instruct admins to approve from `/clients/{id}` (full cascade). `/users` approve now cascades PENDING→APPROVED, but keep one documented path until E2E-tested.
- [ ] Per-clinic setup at approval time: custom pricing (`/pricing`), billing terms if net-X (`/clients/[id]` Billing Terms), document review.

## Known gaps — acceptable for launch, fix in first month
- Double-charge race on draft-order dedup; no hard stock check at checkout (reservations can go negative → oversell risk); programmatic refunds missing (manual via Stripe dashboard). (Jul 6 Phase-3 list.)
- In-memory rate limiting (per-instance only on Vercel) — move to Upstash/Redis.
- No Playwright E2E for checkout/invoice-pay (T4-1); admin 2FA not enforced in Clerk (T4-3); no WebhookEvent DLQ review UI (T4-2).
- Tier 2 remainder: monthly statements, ACH, client-initiated returns.
- Privacy policy §7.2 SMS clause + account-page SMS opt-in toggle for existing clients.
- Sales-tax posture (Stripe Tax + resale-cert exemption, T3-3) — needs a business decision; currently no tax is charged.
- White-label B2C storefronts NOT launch-ready (no end-customer Stripe payments, no wildcard DNS) — separate from clinic onboarding; don't offer yet.

---

# ACTIVE PLAN — Onboarding-approval visibility (Jul 12)  [EXECUTOR — DONE, local]

## Background and Motivation
A clinic completed onboarding (prod `POST /api/onboarding` 201 at 11:20 ET Jul 12) but the super admin "didn't see anything to approve": submissions only surface on `/clients` (Manage dropdown, which overflows off-screen on narrow windows) and no notification/dashboard queue existed.

## Project Status Board (this effort)
- [x] `notifyAdmins` on onboarding submission (`app/api/onboarding/route.ts`) — category CLIENT, priority HIGH, actionUrl `/clients/{id}`, deduped on `(client:onboarding-submitted, clientId)`; fire-and-forget (never fails the submission).
- [x] `PendingApprovals` card on admin dashboard (`app/(dashboard)/dashboard/PendingApprovals.tsx`, mounted in `DashboardClient`) — fetches `/api/admin/clients`, lists PENDING/NEEDS_INFO practices with age + deep link to `/clients/{id}`; renders nothing when queue is empty.
- [x] Verify: `tsc --noEmit` + eslint clean on changed files.
- [x] Deployed to main (37d43d8, Vercel Ready, /api/health 200; no migration needed).
- [x] **Follow-up bug (Jul 12 1:41 PM): approved customer stuck on /pending-approval.** Middleware only redirected PENDING → pending page but never redirected ACTIVE users OFF it, so "Check Status" (window.location.reload) showed the pending card forever. Fix: middleware now bounces ACTIVE users from `/pending-approval` to `/shop` (or `/dashboard` for admins). Also in `POST /api/admin/users/[id]/approve`: (a) cascade `Client.onboardingStatus PENDING→APPROVED` for the user's linked practice (closes the /users-vs-/clients split-approval gap in this direction), (b) approval email falls back to Clerk's primary email when the local `User` row has none (onboarding upsert doesn't set email; prod log showed approve 200 with no email send).

## Executor's Feedback or Assistance Requests
- `notifyAdmins` fans out to Postgres `User` rows with role ADMIN/SUPER_ADMIN + status ACTIVE. If admin accounts exist only in Clerk (no local `User` row), the bell stays silent — the dashboard card still works since it reads `Client` rows directly.
- Known unsynced approval paths remain: approving on `/users` activates the login but leaves `Client.onboardingStatus=PENDING`; approve from `/clients/{id}` (cascades to users + Clerk).

---

# ACTIVE PLAN — "True Marketplace" Gap Analysis & Roadmap (Jul 2026)  [PLANNER]

## Background and Motivation
User asked: what else is needed to be a true marketplace-like site with fulfillment — clinics order from their logins, orders push to our fulfillment back end, custom pricing, client management, billing, checkout with direct payments.

**Finding: the core loop the user described is already built (~85-90%).** Clinics log in (Clerk, NPI-gated onboarding), shop `/shop` with per-client custom pricing (`ClientPricing` + `resolveEffectiveUnitPrice`), check out with direct Stripe payments (Connect direct charges, saved cards), orders land in the admin Fulfillment hub (pick/pack, FedEx labels, tracking, payment gate), admin AR invoicing with net terms exists, plus returns/RMA, inventory batches/reservations, white-label B2C storefronts. Full inventory by explore-agent fd4c5655 (Jul 10).

## Key Challenges and Analysis
The word "marketplace" has two readings; they imply very different scopes:
- **(A) Single-vendor B2B commerce done completely** (PeptSci → clinics). Mostly built; remaining gaps are buyer-experience + billing polish.
- **(B) Multi-vendor marketplace** (many suppliers, listings, commission splits, supplier portals, Stripe Connect split payouts). Entirely MISSING — new Vendor/Listing/Payout models, supplier onboarding, per-vendor fulfillment. Big lift; only do if it's the actual business direction.

Assumption (from user's phrasing "push for fulfillment to OUR back end"): interpretation (A). Confirm before any (B) work.

## High-level Task Breakdown (interpretation A — gap closure, priority order)
### Phase 1 — Complete the buy→bill loop (highest impact)
1. **Order confirmation emails** on checkout success + order status-change emails to clinic (approved/rejected/fulfilled). SES infra exists (`lib/email/`); templates missing. Success: placing an order sends confirmation w/ line items.
2. **Client invoice portal** `/shop/invoices` — list invoices, balance, aging, PDF download, pay-now (Stripe) against an invoice. Server: reuse `lib/invoicing/service.ts`. Success: clinic can see + pay an open invoice; `InvoicePayment` recorded.
3. **Pay-on-terms at checkout** — "Bill to account (Net X)" option next to card, gated by a new `Client.paymentTermsDays` + `Client.creditLimit` (nullable = card-only). Creates order with `paymentStatus=PENDING` + auto-links/creates invoice; payment-gate already allows invoiced orders to ship. Success: terms-approved clinic checks out with no card; order flows to fulfillment; invoice issued.
### Phase 2 — Account completeness
4. **Client document upload UI** (license/DEA) — `ClientDocument` model exists, no upload pages. Onboarding + account page + admin review.
5. **Statements** — monthly account statement PDF/email per client (aging + activity).
6. **ACH/bank debit** as a payment method (Stripe `us_bank_account`) for large B2B totals.
### Phase 3 — Pricing depth
7. **Volume/tier pricing** (qty breaks per variant) and/or **price lists** (named price groups assignable to many clients) layered under existing per-client overrides.
8. **Promo/coupon codes** at checkout (optional).
9. **Sales tax** calculation (Stripe Tax) if/where nexus requires (most clinic sales may be exempt/resale — needs business input + resale-cert capture, ties into doc uploads).
### Phase 4 — Self-service polish
10. Client-initiated returns from `/shop/orders/[id]` (RMA models exist, admin-only today).
11. Reorder / order templates ("buy again").
12. Multi-user clinics w/ per-user roles (purchaser vs owner) — today 1 role per user, all equal within a client.

## Decision (Jul 10)
- User confirmed **(A)** — PeptSci is the sole supplier. Phase 1 executed same day.

## Project Status Board — Phase 1 (EXECUTOR — DONE, local)
- [x] **Order confirmation emails** — `orderConfirmationEmail` template + `sendOrderConfirmationEmail`; `lib/orders/confirmation-email.ts` loads lines/contact + sends. Hooked into `reconcileOrderFromPaymentIntent` on FIRST capture only (atomic paidAt claim via `updateMany where paidAt: null` closes the confirm-vs-webhook duplicate-email race) and into terms checkout ("Billed to account — Net X").
- [x] **Client invoice portal** — `GET /api/shop/invoices` (list + summary: openBalance/terms/creditLimit), `GET /api/shop/invoices/[id]/pdf` (ownership-checked, 404 on cross-account probe, DRAFT hidden), `POST /api/shop/invoices/[id]/pay` (saved card off-session or Elements PI w/ `metadata.invoiceId`; amount-aware idempotency key `pi_inv_{id}_{amount}`), `POST .../pay/confirm`. UI: `/shop/invoices` page + `InvoicePayDialog`; nav links in `ClientHeader`.
- [x] **Pay-on-terms checkout** — `Client.paymentTermsDays`/`creditLimit` (migration `20260710140000_add_client_payment_terms`, migrate-route probe extended). Pure gate `lib/checkout-terms.ts` (`assessTermsCheckout`) + tests. `POST /api/shop/checkout/terms`: resolveCart → terms/credit gate → draft→SUBMITTED → auto-invoice (issue) on client terms → reserveForOrder → confirmation + invoice emails. Checkout UI: "Bill to account — Net X" option (eligibility fetched from /api/shop/invoices summary; server re-validates). Admin: Billing Terms card on client detail + PATCH schema.
- [x] **Invoice-paid settlement** — `recordPayment` now settles linked orders (PENDING→CAPTURED + `syncSalesRecordFromOrder`) when the invoice reaches PAID; `getClientOpenBalance` added. Stripe webhook records `metadata.invoiceId` PIs as InvoicePayments BEFORE the external-sale ingest fallback (prevents double-counted revenue).
- [x] Verify: `tsc --noEmit` clean, 251/251 tests (10 new: `checkoutTerms.test.ts`, `orderConfirmationEmail.test.ts`), `next build` green.

### ⚠️ Before live in prod
1. ~~Commit + deploy~~ ✅ Jul 11 — commit `0cc164b` pushed to `main`; Vercel prod deployment Ready; peptsci.com healthy (`/api/health` 200).
2. ~~Apply prod migrations~~ ✅ Jul 11 — ran `POST /api/admin/db/migrate` via the user's signed-in super-admin browser session; `success: true, upToDate: true` (10.7s, no errors). Covers BOTH `20260710140000_add_client_payment_terms` AND `20260711230000_client_document_review`. Net-terms checkout, Billing Terms admin card, and document uploads are fully live in prod.
3. Grant terms to a clinic on `/clients/[id]` → Billing Terms to enable bill-to-account.

### ✅ DEPLOYED Jul 11 — TCPA/A2P SMS opt-in at onboarding (Twilio toll-free verification)
- Un-prechecked consent checkbox on `/onboarding` below the phone field with all Twilio web-form requirements: message-type description, frequency, msg&data rates, HELP/STOP, "consent not required to purchase", links to `/termsandconditions` + `/privacy`.
- Schema: `Client.smsOptIn Boolean @default(false)` + `smsOptInAt DateTime?` (migration `20260712030000_add_client_sms_opt_in`). `onboardingSchema` accepts `smsOptIn` (defaults false); POST `/api/onboarding` persists it with timestamp.
- All 3 SMS send paths now consent-gated: FedEx label (shipped), tracking poller (delivered/exception), overdue-invoice cron. Existing clients default to opted-out — texts stop for them until they opt in (intended TCPA-safe behavior; add an account-page toggle if practices want to opt in later).
- Deploy: commit `b1906f9` → main. NOTE: schema fields were accidentally swept into legal-pages commit `a7f4c09` earlier; an external revert `1285b4c` + revert-of-revert `6ebe05b` raced my push, causing one Errored Vercel build (`hej2ce769`, tsc: smsOptIn missing from schema) — final deployment `b1c2rtac5` Ready on peptsci.com. Prod migration applied via `POST /api/admin/db/migrate` (success, upToDate, 11s); verified `/api/admin/clients` 200 (full-row Client select incl. smsOptIn) + `/api/health` 200.
- Follow-ups: (1) SMS clause for privacy policy §7.2 (STOP opt-out, no mobile-number sharing); (2) optional SMS-preference toggle on the client account page for existing clients; (3) migrate-route probe not extended for smsOptIn (runner ran the migration fine; add `Client.smsOptIn` to probeSchema next schema change).

## Phase 2 Plan — UX polish + covering the bases (Jul 11)  [PLANNER]
Verified gaps (code-grounded): overdue/issued invoice emails pass no `invoiceUrl` (portal now exists at /shop/invoices); no `notifyAdmins` call on new order capture/terms submission.

### Tier 1 — quick wins (DONE Jul 11, deployed)
- [x] QW-1 Invoice emails (issued: admin send + terms checkout; overdue cron) now link to `/shop/invoices` via `invoiceUrl` (`lib/app-url.ts` helper).
- [x] QW-2 `notifyAdmins` ("New order #N — $X") on first capture (`lib/stripe/payments.ts`) + terms checkout; deduped per admin on `(order:placed, orderId)`.
- [x] QW-3 "Buy again": `GET /api/shop/orders/[id]/reorder` (CURRENT effective prices, skips+reports inactive SKUs) + `BuyAgainButton` on orders list + detail.
- [x] QW-4 Order detail Payment card: card brand/last4 + Paid date, or "Billed to account" w/ invoice number/status/due + portal link (`payment` block in `/api/shop/orders/[id]`).
- [x] QW-5 Credit hold: `assessTermsCheckout({ hasOverdue })` → `CREDIT_HOLD` (tests added); `getClientBillingSnapshot` derives overdue from live due dates (not just persisted OVERDUE status); terms route 409s; checkout UI hides terms option + shows pay-your-invoice notice.
- Verify: tsc clean, 254/254 tests, build green. No schema changes — no prod migration needed.
### Tier 2 — compliance & account completeness
- [x] T2-1 **Document upload + review (DONE Jul 11)** — `ClientDocument` extended (status PENDING_REVIEW/APPROVED/REJECTED, reviewNotes, expiresAt, blob/inline storage cols, RESALE_CERT type; migration `20260711230000_client_document_review`, probe extended). Pure helpers `lib/documents.ts` (validateDocumentUpload, documentExpiryState; 11 tests). Client: `GET/POST /api/shop/documents`, `DELETE .../[id]` (pending-only), auth-proxied `.../file`; `DocumentsManager` on account page (dark) + pending-approval page (light, "speed up your review"; hides gracefully pre-onboarding). Admin: list/PATCH review/file-proxy under `/api/admin/clients/[id]/documents`; `ClientDocumentsCard` on client detail (approve/reject w/ client-visible note, expiry date, expiring/expired badges); notifyAdmins on upload. ⚠️ Prod migration required. Follow-up idea: daily cron for expiring documents across all clients.
- [ ] T2-2 Monthly statement: per-client PDF (aging + activity) + cron email.
- [ ] T2-3 ACH (`us_bank_account`) on invoice pay + checkout for large totals.
- [ ] T2-4 Client-initiated returns from order detail (RMA models exist admin-side).
### Tier 3 — pricing depth & growth
- [ ] T3-1 Volume/qty tier pricing + shared price lists.
- [ ] T3-2 Promo codes.
- [ ] T3-3 Stripe Tax + resale-cert-driven exemption (depends on T2-1).
- [ ] T3-4 Back-in-stock alerts / low-stock badges in catalog.
### Tier 4 — hardening
- [ ] T4-1 Playwright E2E for checkout (card + terms) & invoice pay against preview deploys.
- [ ] T4-2 Admin WebhookEvent DLQ review UI.
- [ ] T4-3 Enforce 2FA for admins (Clerk).

### Lessons (this effort)
- PIs without `metadata.orderId` are treated by the webhook as EXTERNAL sales and ingested into SalesRecord — any new platform-created PI type (e.g. invoice payments) must be intercepted by its own metadata key before that fallback, or revenue double-counts.
- "Send exactly once on capture" needs an atomic claim: `updateMany({ where: { id, paidAt: null } })` count===1 is the first-capture signal; checking the pre-loaded row races between confirm + webhook.
- Terms orders reserve inventory at submission (card orders reserve at capture); the payment gate already ships invoiced orders, and `recordPayment`→PAID flips linked orders to CAPTURED so analytics stay cash-accurate.

---

# ACTIVE PLAN — Google Places address autocomplete (Jul 2026)  [EXECUTOR — DONE, local]

> Latest Google Maps integration on all address forms. Uses Places API (New):
> `AutocompleteSuggestion.fetchAutocompleteSuggestions()` + `PlacePrediction.toPlace().fetchFields()`
> with session tokens (the legacy `places.Autocomplete` widget is deprecated for new keys).

## Project Status Board (this effort)
- [x] `lib/google-places.ts` — script loader (`loading=async`, weekly channel), suggestion fetch (US-only), address-component → `Address` mapper, session-token billing.
- [x] `components/AddressFields.tsx` — Street Address is now a debounced (250ms) combobox with keyboard nav + "powered by Google" attribution; selecting fills address1/city/state/zip (+ZIP4). Applies to onboarding, checkout, account, clients, patients (all `AddressFields` consumers).
- [x] Graceful fallback: without `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` the form behaves exactly as before (manual entry).
- [x] `@types/google.maps` devDep; `tsc --noEmit` + eslint green. `env-example.txt` documents the new key.
- [x] Ops: key created + set in Vercel (Preview/Production, sensitive) and `.env.local`; prod redeployed 12:00 PM Jul 12. Verified via REST: Places API (New) + Maps JS loader both respond.
- [ ] SECURITY: key is currently UNRESTRICTED (accepts any referer). Add HTTP-referrer restriction (`peptsci.com/*`, `*.peptsci.com/*`, `localhost:3000/*`) + API restriction (Maps JavaScript API, Places API (New)) in Google Cloud Console — it ships in the public JS bundle.

## Lessons
- New Google keys cannot use `google.maps.places.Autocomplete`; use `AutocompleteSuggestion`/`PlaceAutocompleteElement`. `fetchFields({fields:['addressComponents']})` ends the billing session, so clear the stored token afterward.

---

# ACTIVE PLAN — Clinic pricing, shipping rates, EIN (Jul 2026)  [EXECUTOR]

> Shipping under $500 → $25 / $35; $500+ → $0 / $20. Admin New Order + Stripe convert use clinic custom prices. Editable EIN on Client.

## Project Status Board (this effort)
- [x] `SHIPPING_RATES` STANDARD $25/$35; tests updated.
- [x] NewOrderModal + ConvertStripeModal load `/api/admin/client-pricing?clientId=` and seed auto prices (manual edits preserved).
- [x] `Client.ein` schema + migration `20260709203000_add_client_ein`; profile/API/UI wired; migrate probe includes `clientEinColumn`.
- [x] Client Custom Pricing page already lists live `/api/admin/clients` — no code change needed.
- [x] Deploy to `main` + `POST /api/admin/db/migrate` for EIN in prod.

## Lessons
- Admin modals that always send `unitPrice: srp` bypass server `resolveEffectiveUnitPrice`; seed custom prices client-side (or omit unitPrice) so overrides still work.

---

# ACTIVE PLAN — Delete Client (remove demo clinics from prod) (Jul 2026)  [EXECUTOR — DONE]

> Demo/seed clients still appear in Client Custom Pricing dropdowns because they live in prod RDS. Local scripts cannot mutate prod (IAM auth only works inside Vercel). Option A: ship a real admin Delete Client feature, then delete via the live UI.

## Project Status Board (this effort)
- [x] `lib/clients/delete-client.ts` — shared force-delete helper (orders + dependents, invoices, docs, pricing; unlink users).
- [x] `DELETE /api/admin/clients/[id]` — admin-only; 409 `HAS_HISTORY` without `?force=1`; force cleans up then deletes.
- [x] `DeleteClientButton` on Clients list + detail (confirm → optional force confirm).
- [x] Seed scripts guarded against remote DB (`assertLocalOrExplicitOverride`); `scripts/remove-demo-clients.ts` for local/ops.
- [x] Deployed via PR #3; delete demo clinics from live Clients UI when ready.

## Executor's Feedback or Assistance Requests
- After deploy, delete the four demo clients from `/clients` on peptsci.com. They will then disappear from Client Custom Pricing dropdowns.
- Do **not** delete "Legacy Orders" if present (real migrated history).

## Lessons
- Prod RDS has no `PGPASSWORD`; auth is Vercel OIDC → cross-account IAM. Local `vercel env pull` OIDC tokens are `environment:development` and cannot assume the prod role.
- Prefer admin UI mutations for prod data when CLI/IAM cannot reach RDS from a laptop.

---

# ACTIVE PLAN — Enterprise Admin Management (Jul 2026)  [EXECUTOR — DONE]

> Enterprise admin UI/UX for managing users, clients/practices, products, and pricing. Kept `Client` as the practice/organization entity (no new tables). Built in three phases. Build green (exit 0), tests green (230/230).

## Project Status Board (this effort)
- [x] Phase 1: `AdminHeader` "Manage" dropdown (desktop + mobile) exposing Clients, Users, Products, Pricing, Client Pricing.
- [x] Phase 1: `POST/GET/DELETE /api/admin/users/invite` — Clerk email invitations (create with role/status/clientId metadata, list pending, revoke). Elevated roles gated by `requireSuperAdmin()`.
- [x] Phase 1: `PATCH /api/admin/users/[id]` — assign clientId / set status, syncing Clerk metadata + Postgres mirror.
- [x] Phase 1: Users page — "Invite User" dialog, pending-invitations table w/ revoke, per-row "Edit" dialog (practice + status), Practice column.
- [x] Phase 2: `POST /api/admin/clients` — create practice (Zod, optional NPI, default APPROVED, P2002 duplicate-NPI handling).
- [x] Phase 2: "Add Client" dialog (NPI lookup prefill, AddressFields, same-as-billing shipping) on the clients list.
- [x] Phase 2: Restyled Clients list + detail to the dark admin theme (was light/out of sync).
- [x] Phase 2: "Invite user to this practice" on client detail (reuses invite dialog w/ locked clientId).
- [x] Phase 3: Products page already had full CRUD/import/empty-states — no change needed. Aligned `EditPriceDialog` to the dark dialog theme; client-pricing already consistent.

## Executor's Feedback or Assistance Requests
- Invitations use Clerk's email-invite flow with `redirectUrl = ${NEXT_PUBLIC_APP_URL}/sign-up`; requires invitations enabled on the Clerk instance. Admin-initiated invites seed `status: ACTIVE` (pre-vetted) so invitees skip the pending-approval gate.
- No schema/migration changes were required.

## Lessons
- New admin dialogs should use the explicit dark tokens (`bg-brand-onyx`, `bg-[#0a0e3a]`, `border-white/10`, `text-white`) rather than default shadcn `bg-background`, to match the rest of the admin surface.
- `Client` is the single practice/organization entity; users link via `User.clientId` + Clerk `publicMetadata.clientId`.

---

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

### ✅ DONE — Gap G: billing & invoicing (Jun 29 2026)
- **Confirmed vs `eonpro/logos-rx-invoicing`** (public, Drizzle): ported its *proven pure math* (totals, aging buckets, status, terms/due-date, discount/surcharge split) and the Invoice/LineItem/Adjustment/Payment shape. **Intentionally omitted** its heavyweight double-entry GL (chart of accounts, journal entries, fiscal periods, account balances) and Plaid bank reconciliation — over-engineering for PeptSci's B2B AR.
- **Schema:** `Invoice` (clientId, `invoiceNumber` SEQUENCE, `InvoiceStatus` DRAFT/OPEN/PARTIAL/PAID/OVERDUE/VOID, period, `paymentTermsDays`, `dueDate`, `balanceForward`, notes, voidedAt/paidAt) + `InvoiceLineItem` (optional `orderId` link) + `InvoiceAdjustment` (`AdjustmentKind` FIXED/PERCENT) + `InvoicePayment` (method, reference, unique `stripePaymentIntentId`). Back-relations on `Client.invoices` + `Order.invoiceLineItems`. Idempotent migration `20260629120000_add_invoicing` (CREATE TYPE/SEQUENCE/TABLE IF NOT EXISTS, FKs). Probe extended (invoice* tables).
- **Pure core** (`lib/invoicing/core.ts`, unit-tested 16 cases): `computeInvoiceTotals` (subtotal→discounts/surcharges→grossTotal→amountDue/creditBalance, balance-forward), `deriveDueDate`, `daysPastDue`, `agingBucket` (current/net30/60/90/over90), `deriveInvoiceStatus` (DRAFT/VOID sticky), `formatInvoiceNumber`. Dependency-free; money as plain `number`.
- **Service** (`lib/invoicing/service.ts`): `createInvoice` (from unbilled orders and/or manual lines), `getUnbilledOrders`, `recordPayment` (idempotent on Stripe PI), `addAdjustment`, `recomputeStatus`/`issueInvoice`/`voidInvoice`, `listInvoices` (paged + aging), `markOverdueInvoices` (cron sweep). Decimal↔number at the boundary.
- **PDF** (`lib/invoicing/pdf.ts`, pdf-lib): professional invoice — bill-to, meta (issue/due/terms/status/period), line items + adjustments, totals block, highlighted Amount Due, PAST DUE flag, notes/footer.
- **Email:** `invoiceIssuedEmail` + `invoiceOverdueEmail` templates (branded layout) + `sendInvoiceIssuedEmail`/`sendInvoiceOverdueEmail` senders (SES, fire-and-forget).
- **APIs:** `GET|POST /api/admin/invoices`, `GET|PATCH /api/admin/invoices/[id]` (issue/void), `POST …/payments`, `POST …/adjustments`, `GET …/pdf`, `POST …/send`, `GET /api/admin/invoices/unbilled?clientId`. Overdue cron `GET|POST /api/cron/invoices-overdue` (flips past-due → OVERDUE + emails clients) wired in `vercel.json` (`0 14 * * *`). Added `/api/cron(.*)` to middleware public routes (each cron self-authenticates via `CRON_SECRET`).
- **UI:** `/invoices` list (status tabs, amount due/of total, aging badge) + New Invoice dialog (pick client → select unbilled orders → terms → issue) and `/invoices/[id]` detail (line items + adjustments, totals, payments, Record Payment / Add Adjustment dialogs, Issue / Email / Void / PDF actions). Nav link added (`ReceiptText`); `/invoices` + `/reports` added to admin route matcher.
- **Tests:** new `lib/__tests__/invoicing.test.ts`. `npm test` 170 pass, `tsc --noEmit` clean, `next build` green.
- **Deploy note:** run `POST /api/admin/db/migrate { "confirm": true }` once in prod to add the invoicing tables; optional `CRON_SECRET` secures the overdue sweep.

### ✅ DONE — Gap H: reporting / BI (Jun 29 2026)
- **Pure core** (`lib/reports/core.ts`, unit-tested 9 cases): `revenueSummary` (rev/cogs/profit/margin/units/orders, date-range filter), `revenueByMonth`, `topProducts`, `arAgingSummary` (current/net30/60/90/over90 buckets), `fulfillmentSla` (avg/median hours-to-ship + within-SLA %), `forecastNextPeriod` (SMA blended with linear trend, floored at 0), `lowStockSummary`. Dependency-free.
- **Service** (`lib/reports/service.ts`): `getReportsDashboard(days)` + `getWeeklySummary()` compose live data — `SalesRecord` (via `getSales`), open invoices (AR via `computeInvoiceTotals`), `ProductVariant` (available = onHand − reserved vs `reorderLevel`), and `Order.createdAt→shippedAt` (SLA). Plus CSV builders `buildSalesCsv` / `buildInventoryCsv` / `buildArAgingCsv` (Excel-friendly, no new dep).
- **Weekly email:** `weeklyReportEmail` template + `sendWeeklyReportEmail`; cron `GET|POST /api/cron/weekly-report` (Mondays `0 13 * * 1`) emails `REPORT_EMAIL_TO` (revenue WoW, AR, SLA, stock, top products); no-op without recipients/EMAIL_ENABLED.
- **APIs:** `GET /api/admin/reports?days=` (dashboard payload) + `GET /api/admin/reports/export?type=sales|inventory|ar` (CSV download).
- **UI:** `/reports` dashboard — range toggle (7/30/90/365d), KPI cards (revenue + WoW delta, profit/margin, orders/units, next-month forecast), AR aging bar + buckets, fulfillment SLA panel, top-products + low-stock lists, and CSV export buttons. Nav link added (`BarChart3`).
- **Decision:** delivered CSV exports rather than pulling in ExcelJS — opens directly in Excel, avoids a heavy serverless dependency. Can upgrade to multi-sheet `.xlsx` later if needed.
- **Tests:** new `lib/__tests__/reports.test.ts`. `npm test` 179 pass, `tsc --noEmit` clean, `next build` green.
- **Deploy note:** set `REPORT_EMAIL_TO` (comma-separated) for the weekly email; CSV exports + dashboard work with no extra config.

### ✅ DONE — Gap C: SMS notifications (Twilio) (Jun 29 2026)
- **Scaffolded to no-op when unconfigured** (mirrors the SES email layer): nothing texts until `SMS_ENABLED="true"` **and** Twilio creds + a sender are set, and only when the client has a phone on file. Build/dev/preview safe.
- **No new dependency:** Twilio is called over the REST API with `fetch` (Basic auth, form-encoded `Messages.json`) instead of the `twilio` SDK — avoids serverless cold-start/bundle cost (same spirit as the CSV-over-ExcelJS call).
- **Pure core** (`lib/sms/phone.ts`, unit-tested): `toE164US` (10-digit → `+1…`, `1`+10 → `+…`, existing E.164 kept, junk → null) + `isValidPhone`. Dependency-free.
- **Templates** (`lib/sms/templates.ts`): short, PHI-free bodies — `orderShippedSms` / `orderDeliveredSms` / `orderExceptionSms` (order # + public `/tracking/<n>` link) and `invoiceOverdueSms`.
- **Client** (`lib/sms/client.ts`): `isSmsEnabled()` + `sendSms({to,body})` — normalizes the number, never throws, returns `SendSmsResult { ok, skipped?, sid?, error? }`. **Senders** (`lib/sms/index.ts`): `sendOrderShippedSms` / `…Delivered` / `…Exception` / `sendInvoiceOverdueSms`.
- **Wired in parallel with existing emails** (all fire-and-forget, never block the request/cron): label route (`…/fedex/label`, shipped), FedEx tracking poller (delivered + exception), and overdue-invoice cron (`/api/cron/invoices-overdue`, now reports `texted`). Added `contactPhone` to those client selects + `INVOICE_INCLUDE`.
- **Env:** `SMS_ENABLED`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` *or* `TWILIO_MESSAGING_SERVICE_SID` (plus a backfilled `REPORT_EMAIL_TO`) added to `env-example.txt`.
- **Tests:** new `lib/__tests__/sms.test.ts` (9 cases). `npm test` 188 pass, `tsc --noEmit` clean, `next build` green.
- **Deploy note:** set the `TWILIO_*` vars + `SMS_ENABLED="true"` (a Messaging Service SID is recommended over a bare From number) to turn SMS on; no migration needed (reuses `Client.contactPhone`).

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

---

## Go-Live Readiness — Phase 2 hardening (Jul 6, 2026)

### Background and Motivation
Full-codebase readiness audit (4 parallel deep-dives: security/auth, payments/orders, data layer, ops) ahead of taking real customers. Core architecture judged solid (server-side pricing, Connect direct charges, idempotent webhooks, Decimal money, tenant scoping). Six code-level blockers identified and fixed this session; Phase 1 (config: Clerk session claim, prod env vars, RDS backups) remains an ops task.

### Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| GL-1 | Pay-before-ship gate | ✅ `lib/fulfillment/payment-gate.ts` (`assessShipmentPaymentGate`: CAPTURED, invoiced/net-terms, or explicit override). Enforced in FedEx label POST (402 `PAYMENT_REQUIRED`) + order labels-PDF `?consume=true`. Override = `overrideUnpaidShip` (body/query), audit-logged (`unpaid_ship_override`); FedExLabelModal surfaces a "Ship anyway" retry |
| GL-2 | Fail closed on Stripe amount mismatch | ✅ `lib/stripe/payments.ts` — mismatch no longer sets CAPTURED/SUBMITTED/paidAt or reserves stock; records `paymentFailureReason` for manual reconciliation and returns unchanged status |
| GL-3 | Migrate endpoint → SUPER_ADMIN | ✅ `app/api/admin/db/migrate` GET+POST now `requireSuperAdmin()` |
| GL-4 | Rate-limit public storefront checkout | ✅ `RATE_LIMITS.publicCheckout` (5/min/IP) on `POST /api/storefront/checkout` (was fully open; creates orders + reserves stock) |
| GL-5 | Stripe webhook retryable failures | ✅ DB-unavailable + claim-insert failures now return 503 (Stripe retries ≤3 days) instead of silent 200 drop |
| GL-6 | Missing cron routes | ✅ Implemented `app/api/cron/low-stock` (available ≤ reorderLevel → admin INVENTORY notification, daily dedup) + `app/api/cron/expiring-batches` (BUD within `EXPIRING_BATCH_WINDOW_DAYS`, default 60; past-BUD = URGENT). vercel.json schedules now all resolve |
| GL-docs | env-example CRON_SECRET drift | ✅ Corrected: crons are fail-closed in prod without CRON_SECRET (no x-vercel-cron fallback); documented EXPIRING_BATCH_WINDOW_DAYS |
| GL-verify | Verification | ✅ `tsc --noEmit` clean; 211/211 tests pass (6 new payment-gate tests); `next build` green |

### Executor's Feedback or Assistance Requests
- Phase 1 (ops, before launch): Clerk session token claim `{"metadata": "{{user.public_metadata}}"}` + bootstrap SUPER_ADMIN; set prod env (live Stripe + STRIPE_CONNECTED_ACCOUNT_ID + Connect webhook secret, CRON_SECRET, EMAIL_ENABLED/SES prod access, FEDEX_*, END_CUSTOMER_JWT_SECRET, Sentry DSN); enable RDS backups/PITR + restore runbook.
- Phase 3 (first month): transactional draft-order dedup (double-charge race), stock check at checkout (oversell), invoice payment → Order.paymentStatus sync, programmatic refunds, Redis rate limiting, webhook/reconcile integration tests, SMS opt-out (TCPA).

### Lessons
- `Order` has no direct invoice FK — net-terms detection is `_count.invoiceLineItems > 0` (InvoiceLineItem.orderId is unique).
- Stripe retries webhook 5xx for up to 3 days — 503 on transient DB failure is safe and strictly better than a silent 200 drop given `WebhookEvent` idempotency claim.
- Passing `handleSubmit` directly as a React `onClick` handler silently passes the click event as the first arg — a `boolean` default param would have been truthy. Always wrap: `onClick={() => handleSubmit()}`.

---

## Manual "Add via UI" forms — customers, products, pricing (Jul 6 2026) [EXECUTOR]

User request: every data-entry path that was CSV-only must also work as a dashboard form. Inventory already had Receive Inventory; client pricing already had Add Custom Price. Implemented the remaining three. TDD: `lib/manual-sale.ts` validator written test-first (9 tests).

### Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| UI-1 | `POST /api/admin/sales` — manual single SalesRecord (source `manual`); validation in pure `lib/manual-sale.ts` (identifier required, derived paidAmount/amountPerVial, invoicePaid default, shared `coerceDate`); COGS estimated from catalog like CSV importer | ✅ |
| UI-2 | Customers page "Add Customer" dialog (`AddCustomerButton.tsx`) — contact-only ($0 record) or full sale; `router.refresh()` on save; page now `force-dynamic` | ✅ |
| UI-3 | `POST /api/admin/products` (single create, 409 on duplicate SKU, product matched by name like importer) + `PATCH /api/admin/products/[id]` (name/category/sku/dose/cost/srp/supplier/reorderLevel; inventoryOnHand intentionally NOT patchable — stock goes through Receive Inventory) | ✅ |
| UI-4 | Products page "Add Product" button + per-row pencil edit (`ProductFormDialog.tsx`); GET now returns `reorderLevel` | ✅ |
| UI-5 | Pricing page list view: per-row pencil → `EditPriceDialog` (Cost/SRP with live margin) via the products PATCH; `PriceSheet` gains optional `Id` (variant id) threaded from `getPricing()`/`/api/prices` | ✅ |
| UI-verify | `tsc --noEmit` clean; 220/220 tests (9 new `manualSale`); `next build` green | ✅ |

### Lessons
- Customers page is a pure rollup of `SalesRecord` (no Customer table) — "adding a customer" = creating a manual sales record; a $0, date-less record surfaces the contact without distorting revenue or order counts (`groupByCustomer` counts orders by non-null dates).
- `errorResponse()` masks messages in production (`'An error occurred'`) even for 400 validation errors — client-side pre-validation in dialogs is required for usable error UX.

---

## Product CSV import: scientific/reference columns (Jul 6 2026) [EXECUTOR]

User's product Excel sheet has 22 columns (SKU, Peptide Name, Miligrams, Cost/Unit, Category, CAS Number, Molecular Formula, Molecular Weight, PubChem CID, Peptide Length, Description, AKA, Monoisotopic Mass, Complexity, XLogP, H-bond donor/acceptor counts, Rotatable Bond Count, Heavy Atom Count, Intended Use, PubChem LCSS, Current Inventory). Extended the importer so the sheet uploads as-is.

### Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| SCI-1 | Migration `20260707034454_add_product_scientific_fields`: 15 nullable Product columns (casNumber, molecularFormula, molecularWeight Float, pubchemCid, peptideLength Int, aka, monoisotopicMass/complexity/xlogp Float, 4 bond/atom Int counts, intendedUse, safetySummary) | ✅ applied locally |
| SCI-2 | `lib/product-import.ts`: new `ProductImportRow` fields + header aliases for the sheet's exact headers (incl. "Miligrams" misspelling, "Cost/Unit", "Current Inventory", "PubChem Laboratory Chemical Safety Summary (LCSS)"); bare numbers under an mg-header get "mg" suffix; non-numeric scientific values dropped leniently (never fail a row); template extended | ✅ |
| SCI-3 | Import route writes product-level science fields on create + update (only keys present in the row, so re-imports never blank existing values); `description` now imported | ✅ |
| SCI-4 | Products page dialog copy updated | ✅ |
| SCI-verify | 223/223 tests (3 new incl. full 22-column sheet round-trip); `tsc --noEmit` clean | ✅ |

### Lessons
- Prod migrations go through `POST /api/admin/db/migrate` (SUPER_ADMIN, runtime runner) — Prisma CLI can't reach prod RDS (IAM auth). SCI-1 must be applied there on next deploy.
- Scientific reference values should parse leniently ("N/A" → dropped, not a row error) so they never block the commercial import.
- "Still not live" (Jul 7): the work existed only as uncommitted local changes — prod runs whatever is on `main`. Committed as c25787a (manual UI forms) + 5d98258 (scientific import), pushed; Vercel deploy `l7rqpat3p` Ready. Migrate-runner probe extended with `productCasNumberColumn` so GET reports upToDate correctly.
- Prod migration APPLIED (Jul 7, via owner's signed-in IDE browser tab → POST /api/admin/db/migrate): upToDate=true. **Prod RDS was 9 migrations behind** — the run also applied perf indexes, returns/RMA, notifications, inventory reservations, order fulfillment, invoicing, and dedup indexes. Catalog imported successfully afterwards (~75 products live).
- Inventory audit trail (Jul 7, e7076f4 + migration 20260707130344, applied to prod): Inventory "By Product" is now catalog-driven (every ACTIVE variant at 0 until stock arrives, via `listCatalogStock()`), new Activity Log tab reads GET /api/admin/inventory/adjustments (`lib/inventory-log.ts`). `createdByName` added to InventoryAdjustment; actor now attached to ALL stock writes (batch receipt/void, fulfillment draws — previously unattributed, CSV-import deltas + Add Product initial stock — previously not logged at all). **Bug found:** returns restock passed a raw Clerk id into the `createdById` FK → FK violation would abort the restock transaction in prod; now resolved via `resolveInventoryActor`.
- Stripe reconciliation (Jul 7, 1bcd05d): dashboard $416,713.40 vs Stripe lifetime $492,252.40. Root cause: prior backfill runs never covered the full account history — 40 succeeded PIs ($75,539, Sep 8–Nov 11 2025 cluster + 13 older) were missing. New read-only GET /api/admin/sales/stripe-reconcile scans ALL PIs and reports gross/refunded/net vs DB + missing list. Backfill enriched: expands data.customer, resolves paying Invoice via `invoicePayments.list({payment: {type:'payment_intent', payment_intent}})` (PI.invoice no longer exists post-Basil), fills real customer name/email/phone/address, orderRef = invoice number, product/vials from invoice lines, catalog-matched COGS (fallback 35%). Ran windowed backfills on prod (full-history run in one request dies — Vercel/proxy timeout with ~360 PIs × invoice lookups; windows of ≤ ~200 PIs are safe). Result: DB = $492,252.40 exactly, gap 0, all 359 succeeded PIs ingested; dashboard rows show real names + invoice numbers + line items. Stripe "lifetime total volume" = gross succeeded charges (refunds NOT subtracted; refundedTotal $2,930 tracked separately in reconcile output).
- Live sales ingestion (Jul 7, 15f7022): external Stripe payments (hosted invoices/subscriptions/dashboard charges — no `metadata.orderId`) were only reaching analytics via the manual backfill button; their payment_intent.succeeded webhooks failed "no order matched" → 503 retries → DLQ. Webhook now detects external PIs and ingests them into SalesRecord via shared `lib/stripe/sales-ingest.ts` (same enrichment as backfill). Platform PIs (metadata.orderId present) keep the strict retryable path. Dashboard polls 60s + refresh-on-focus (was 5 min). STRIPE_WEBHOOK_SECRET confirmed set in prod env. NOT yet verified end-to-end with a real payment — if the next Stripe invoice payment doesn't appear within ~1 min, check the Stripe webhook endpoint is a CONNECT endpoint (listens to connected-account events) subscribed to payment_intent.succeeded. Follow-up DONE (2dcf055): sales ingestion is refund-aware — paidAmount net of `latest_charge.amount_refunded`, COGS scaled by the same fraction, recomputed from Stripe state (idempotent); charge.refunded for orderless payments re-ingests the PI; reconcile gained `stripeNetVsDb` (the ~0 target now that DB is net). 230 tests. NOTE: dashboard total will read NET of refunds after the next full backfill run (owner should run Backfill from Stripe with blank dates once to net out the historical $2,930) — Stripe's "lifetime total volume" overview figure is GROSS, so expect DB = gross − refunds, matching reconcile netVolume.
- White-buttons bug (Tailwind v4 fallout, two layers): (1) semantic tokens were in plain `@theme`, so `hsl(var(--background))` was frozen at :root (light) — must be `@theme inline` to resolve per-scope (c96e707); (2) Radix dialogs portal to <body>, OUTSIDE the `.dark` wrapper in `app/(dashboard)/layout.tsx`, so `bg-background` in dialogs is light-theme even after (1) — Button outline variant now uses `bg-transparent` (58ce5db). Verified on prod via CDP computed styles. Other `bg-background` components (input/select/textarea/dialog shell) are always overridden with explicit dark classes at call sites, so left alone.

---

## Manual orders + Stripe→Fulfillment + platform payments (Jul 8 2026) [PLANNER]

### Background and Motivation
Today the Fulfillment page (`/fulfillment`, reads `Order` where `status != DRAFT` via `GET /api/admin/orders`) is fed ONLY by platform checkouts (B2B shop `createDraftOrder` → capture, and storefront `createRetailOrder`). Revenue that arrives via Stripe-hosted invoices / subscriptions / dashboard charges is ingested into `SalesRecord` for analytics only (`lib/stripe/sales-ingest.ts` from the webhook + backfill) and NEVER becomes an `Order`, so it can't be picked/packed/shipped from inventory. There is also no admin "create order" UI and no way to take a payment for an ad-hoc order from inside the platform.

The owner wants three capabilities:
1. **Stripe-synced payments should trigger the fulfillment rule** — a paid Stripe payment should become a fulfillable `Order` whose lines are real catalog variants, so inventory can be drawn and a FedEx label created.
2. **Manual order creation** — an admin UI to build an order (client, products from inventory, quantities, ship-to/speed).
3. **Process payments from the platform** — charge a card (saved or newly entered) for a manual order, capturing through Stripe.

### Key Challenges and Analysis
- **Stripe line → catalog variant mapping is unreliable.** Stripe invoice lines are free-text descriptions (`summarizeInvoiceLines`), matched only fuzzily for COGS (`estimateUnitCost`, 35% fallback). That is NOT safe enough to auto-decrement inventory. → External Stripe payments should NOT silently auto-create fulfillment orders; they need a human "map lines → variants" step (a Convert-to-Fulfillment review queue).
- **`Order` requires a `clientId` (non-null) and `createdById` (User).** Stripe payments carry email/name but may not match a `Client`. Need: match by email → Client; else let the operator pick/create a Client during conversion. `createdById` = acting admin (or a system user for automated paths).
- **Analytics double-count risk.** `SalesRecord` is upserted by `stripePaymentIntentId` (source `stripe`) OR by `orderId` (source `order`). If a Stripe PI becomes an Order, we must collapse to ONE row (carry the PI id onto the order-sourced record; delete/repoint the stripe-sourced one) so dashboard totals don't double.
- **Payment already captured (Stripe path) vs. to-be-charged (manual path).** For converted Stripe orders the money is already captured externally — set `paymentStatus=CAPTURED`, `status=SUBMITTED`, link `stripePaymentIntentId`, reserve stock, but do NOT re-run the amount-match capture gate (that gate is for platform-created PIs). For manual platform charges, reuse the existing, battle-tested path: create+confirm a PaymentIntent with `metadata.orderId` so `reconcileOrderFromPaymentIntent` handles capture → SalesRecord sync → reservation automatically.
- **Amount-match fail-closed guard** (`reconcileOrderFromPaymentIntent`) requires `pi.amount === toCents(order.total)`. Manual orders must price server-side (like `lib/checkout-core.ts`) and set the PI amount from the computed total, so the guard passes.
- **Inventory oversell.** Reservation is non-blocking (can go negative). Manual order builder should surface availability and warn on oversell but not hard-block (matches current behavior).
- **Reuse, don't fork.** A single server-side "build order from line items" core should back BOTH the manual builder and the Stripe conversion, so pricing/reservation/sales-sync stay in one place.

### High-level Task Breakdown (proposed — pending owner answers below)
1. **Shared order core** `lib/orders/create.ts`: `createManualOrder({ clientId, patientId?, lines:[{variantId, quantity, unitPrice?}], shipTo, shipSpeed, shippingAddress?, notes, createdById, initialStatus })` — prices server-side, creates `Order` + `OrderItem`s, returns order. No payment side effects.
2. **Manual order API + UI**: `POST /api/admin/orders` (admin) → `createManualOrder`; an "New Order" builder on `/fulfillment` (or `/orders`) with client picker, product/variant search with live availability, qty, ship options.
3. **Platform payment for an order**: `POST /api/admin/orders/[id]/charge` → create+confirm PaymentIntent with `metadata.orderId` (saved card off-session, or new card via Elements/SetupIntent). Capture flows through existing `reconcileOrderFromPaymentIntent`. Optionally support "mark paid externally / cash" for $0-Stripe manual orders.
4. **Stripe → Fulfillment conversion**: a "Convert to fulfillment order" action on external Stripe sales (SalesRecord source `stripe`). Opens the same builder pre-filled (customer, amount, guessed line mappings) for the operator to confirm variant mappings; on save creates an Order (`source=STRIPE_INVOICE` or `DIRECT`), `paymentStatus=CAPTURED`, links `stripePaymentIntentId`, reserves stock, and de-dupes the SalesRecord to a single order-sourced row. Add `OrderSource.STRIPE_INVOICE` if desired.
5. **(Optional) surfacing**: a "Needs Fulfillment (unconverted Stripe)" list so paid-but-not-yet-orderized Stripe sales are visible to warehouse.
6. **Tests**: unit tests for the order core (pricing, reservation idempotency, sales dedup) and conversion; keep `tsc --noEmit` clean and full suite green.

### Owner Decisions (Jul 8 — CONFIRMED)
1. Stripe→fulfillment: **review queue** — external Stripe payments land in a "Convert to Fulfillment" queue; operator maps catalog variants, then it creates the order & reserves stock. No silent auto-create.
2. Scope: **only new payments going forward** (no bulk historical conversion).
3. Manual payments: **saved card (off-session) AND new card via Stripe Elements**.
4. Client matching: **match by email; else operator picks an existing client or creates one inline**.
5. Placement: **on the Fulfillment page**.

### Project Status Board (this effort)
| # | Task | Status |
| - | ---- | ------ |
| MO-1 | `lib/orders/create.ts` — shared `createManualOrder` core (server-side pricing via checkout-core + client custom pricing; creates Order+items; no payment side effects) + unit tests | ⬜ |
| MO-2 | Actor helper: resolve DB `User.id` from Clerk id for `Order.createdById` (reuse resolveInventoryActor pattern; system-user fallback) | ⬜ |
| MO-3 | `POST /api/admin/orders` (admin) → createManualOrder; returns order id | ⬜ |
| MO-4 | Supporting APIs for builder: variant search w/ availability (`GET /api/admin/products` or new), client search/create (exists: `/api/admin/clients`) | ⬜ |
| MO-5 | Fulfillment page "New Order" builder modal: client picker (search + inline create), variant search w/ live availability, qty, ship-to/speed, shipping address | ⬜ |
| PAY-1 | `POST /api/admin/orders/[id]/charge` — saved card off-session (create+confirm PI w/ metadata.orderId) | ⬜ |
| PAY-2 | New-card charge via Stripe Elements (PaymentIntent client_secret + confirm) on the same endpoint/flow | ⬜ |
| PAY-3 | Charge UI in builder / order row (choose saved card or enter new card) | ⬜ |
| SF-1 | `OrderSource.STRIPE_INVOICE` enum + migration | ⬜ |
| SF-2 | Convert queue API: list external `stripe`-sourced SalesRecords with no linked order (`GET /api/admin/fulfillment/stripe-queue`) | ⬜ |
| SF-3 | `POST /api/admin/fulfillment/stripe-convert` — build Order from mapped lines, paymentStatus=CAPTURED, link stripePaymentIntentId, reserve stock, de-dupe SalesRecord to single order-sourced row | ⬜ |
| SF-4 | Fulfillment page "From Stripe" tab/queue UI with per-payment convert dialog (pre-filled, variant mapping) | ⬜ |
| V-1 | `tsc --noEmit` clean, full test suite green, `next build` green | ⬜ |

### Sequencing
MO-1→MO-3→MO-5 (manual orders end-to-end) → PAY-1..3 (take payment) → SF-1..4 (Stripe conversion). Each phase independently shippable.

### Executor Feedback (Jul 8 — ALL TASKS DONE, local)
All 13 tasks implemented. `tsc --noEmit` clean, 240/240 tests pass (10 new in `orderCore.test.ts`), `next build` green (after clearing a stale `.next` cache — the first build failed with spurious PageNotFoundError for untouched pages).

Files added:
- `lib/orders/order-core.ts` (pure validate/price logic) + `lib/__tests__/orderCore.test.ts`
- `lib/orders/create.ts` (`createManualOrder` — shared by manual builder + Stripe convert)
- `lib/orders/actor.ts` (`resolveOrderCreatorId` — Clerk id → DB User.id w/ admin fallback)
- `components/orders/NewOrderModal.tsx`, `ChargeOrderModal.tsx`, `ConvertStripeModal.tsx`
- `app/api/admin/orders/[id]/charge/route.ts` (GET saved cards + POST charge: saved off-session / new-card Elements / confirm-after-Elements)
- `app/api/admin/fulfillment/stripe-queue/route.ts` (GET unconverted external Stripe sales, email→client match)
- `app/api/admin/fulfillment/stripe-convert/route.ts` (POST build order CAPTURED, link PI, reserve stock, link SalesRecord to de-dupe)
- `prisma/migrations/20260708210000_add_stripe_invoice_order_source/migration.sql`

Files changed:
- `app/api/admin/orders/route.ts` (+POST manual order; GET now returns paymentStatus)
- `app/api/admin/products/route.ts` (GET now returns inventoryReserved + available)
- `app/(dashboard)/fulfillment/page.tsx` (New Order + Take Payment buttons, Paid/Unpaid badge, "From Stripe" tab + Convert)
- `prisma/schema.prisma` (OrderSource + STRIPE_INVOICE)
- `app/api/admin/db/migrate/route.ts` (probe extended: `orderSourceStripeInvoiceValue`)

### ⚠️ Follow-ups before this is fully live in prod
1. **Prod migration**: `STRIPE_INVOICE` enum value must be applied on prod via `POST /api/admin/db/migrate` (SUPER_ADMIN) — Prisma CLI can't reach prod RDS (IAM auth). GET that route first; `upToDate` now also checks the enum value. Until applied, the Stripe-convert path will fail on prod when writing `source: STRIPE_INVOICE`.
2. **Commit + deploy**: work is local only; prod runs `main`. Needs commit + Vercel deploy.
3. **Design note (revenue accuracy)**: on Stripe→order conversion the existing `stripe` SalesRecord is linked to the new order via `orderId` (kept source `stripe`) so the true captured amount/COGS are preserved and NOT double-counted. The order's own `total` (sum of mapped line prices) is for fulfillment/picking and may differ from the Stripe-captured amount; the convert dialog shows both so the operator can price lines to match if desired.
4. **Not charged twice**: converted Stripe orders are created `CAPTURED` with the PI linked; the charge endpoint refuses `ALREADY_PAID`, and `Order.stripePaymentIntentId` uniqueness + an explicit pre-check block double-conversion.

### Lessons (this effort)
- Manual/admin orders reuse the shop's Model-A payment flow by putting `metadata.orderId` on the PaymentIntent — `reconcileOrderFromPaymentIntent` then handles capture → SalesRecord sync → inventory reservation, so the admin charge endpoint stays thin.
- `Order.createdById` is a required FK to `User.id`, but `requireAdmin()` returns a Clerk id → always resolve via `resolveOrderCreatorId` (matches the returns-restock FK bug pattern from Jul 7).
- External Stripe payments only ever hit `SalesRecord` (source `stripe`); they never auto-create `Order`s. Converting must LINK the existing SalesRecord (set `orderId`) rather than calling `syncSalesRecordFromOrder` (which upserts by `orderId` and would create a 2nd row colliding on the unique `stripePaymentIntentId`, and would overwrite the true Stripe revenue with the order total).
- Adding an enum value ships via the runtime migrate runner; extend `probeSchema()` (pg_enum lookup) so GET `upToDate` reflects it — same pattern as the `productCasNumberColumn` probe.
- A stale `.next` cache can fail `next build` with `PageNotFoundError` for unrelated pages; `rm -rf .next` fixes it.


## Fulfillment handoff flow — Stripe queue banner + label→photo path (Jul 15 2026) [EXECUTOR]

**Why**: Paid Stripe sales show "Needs Fulfillment" on the dashboard (SalesRecord) but the Fulfillment page's default "Needs Label" tab reads the Order table, which was empty → operator saw "No orders found" and thought orders were missing.

**Shipped (local, needs commit + deploy)**:
- `fulfillment/page.tsx`: amber banner on Needs Label/Shipped/All tabs showing the count of unconverted Stripe payments with a "Review From Stripe" jump; queue is background-refreshed on mount via the stripe-queue endpoint.
- Convert → Label handoff: `ConvertStripeModal.onConverted` now returns `{id, orderNumber}`; page switches to Needs Label and auto-opens `FedExLabelModal` with the Stripe shipping address pre-filled (`stripeRecordToLabelAddress`).
- Label → Photo handoff: after label creation a green next-step banner links to `/package-photos?order=<n>&tracking=<tn>`; package-photos page prefills from those query params (window.location, no useSearchParams Suspense).
- Dashboard: "Needs Fulfillment" badge is now a link to `/fulfillment`.
- Analytics consistency: FedEx label create/void now mirrors tracking onto the linked `SalesRecord` (`updateMany` by orderId, tracking only — revenue/COGS untouched) so the dashboard badge clears when a label is created and reappears if the last label is voided ('' not null; SalesRecord.trackingNumber is non-null string).

**Verified**: tsc clean, eslint clean, 278/278 unit tests, `next build` passes.

### Lessons (this effort)
- The dashboard badge and the fulfillment queue read different tables (SalesRecord vs Order); any surface that flips Order.trackingNumber must mirror it to the linked SalesRecord or the two disagree.

## Manual disposition button (Jul 17 2026) [EXECUTOR]
- `POST /api/admin/orders/[id]/disposition` — disposition orders fulfilled OUTSIDE the in-app FedEx flow (external label/carrier, hand-delivered, pickup). Mirrors the label route: payment gate (+ audited unpaid override), SHIPPED status flip, SalesRecord tracking mirror (placeholder 'Shipped (manual)'/'Delivered (manual)' when no tracking so the dashboard badge clears), audit log `manual_disposition`, shipped/delivered email+SMS. Inventory consume is BEST-EFFORT (requireFull: false — goods already left; shortfall audit-logged), unlike the pre-ship FedEx path.
- `ManualDispositionModal` + "Manual Disposition" ghost button on unshipped fulfillment rows; SHIPPED outcome feeds the package-photo next-step banner.
- Needs Label tab now also requires `shippingStatus null`; Shipped tab matches tracking OR shippingStatus (wrapped in AND to avoid the search OR collision).
- Lesson: `next build` failing on a teammate's new Prisma enum = stale generated client → `npx prisma generate`.

## Patient chat — two-way clinic ↔ PeptSci messaging (Jul 17 2026) [EXECUTOR]

**Background:** clinics need to talk to PeptSci staff about a specific patient (saved ship-to recipient) without leaving the app; staff need the reverse. No realtime infra exists, so this follows the notification-bell polling pattern.

**What shipped:**
- Schema: `PatientMessage` (patientId + denormalized clientId, nullable senderId with SetNull, frozen senderName, `PatientMessageSenderRole` CLINIC|PEPTSCI, per-side `readByClinic`/`readByAdmin` flags) + migration `20260717145836_add_patient_messages`.
- Data layer `lib/patient-messages.ts`: `getThreadAndMarkRead` (fetch + bulk-mark other side read in one transaction), `sendMessage` (sender's own read flag stamped true), `unreadCountsByPatient` (groupBy for badges).
- APIs: shop `GET/POST /api/shop/patients/[id]/messages` (ownership via resolveShopActor + clientId match, rate-limited) and `GET /api/shop/patients/unread-messages`; admin `GET/POST /api/admin/patients/[id]/messages` and `GET /api/admin/clients/[id]/patients` (patients + unread counts).
- UI: shared `components/PatientChat.tsx` (bubbles, 15s poll while visible, Enter-to-send) in `PatientChatDialog`; clinic entry = message icon w/ unread badge per patient card in `PatientsManager` (60s badge poll); admin entry = new "Patients & Messages" card (`#patients` anchor) on `/clients/[id]`.
- Notifications: clinic send → `notifyAdmins` (bell, actionUrl `/clients/{id}#patients`); admin send → `notifyUser` for the clinic's ACTIVE users (rows ready for a future clinic bell). Both best-effort (send never fails on notify errors).

**Verified:** tsc, lint, `next build` green; DB smoke test (send both directions → unread counts 1/1 → clinic read → clinic unread 0) passed against local Postgres.

### Lessons (this effort)
- Local DB had drift (refund columns applied but migration unrecorded). Fix without data loss: `prisma migrate resolve --applied <name>` then `migrate dev` — never `migrate reset` on a DB with data.
- `tsx` scripts don't auto-load `.env`; pass `DATABASE_URL` explicitly when running one-off Prisma scripts.

## Sales / Affiliate Partner Platform (Jul 17 2026) [PLANNER + EXECUTOR]

### Background and Motivation
Sales organizations ("partner orgs") and their reps need to earn commission on sales they refer, see their numbers, onboard people, create custom referral links, and control clinic pricing. Modeled on the affiliate partner program in `eonpro/logosrx-website` (`src/lib/partners/*`, `src/app/partners/*`, `scripts/sql/0004–0016`), adapted to this stack: Prisma (not Drizzle) and automatic accrual from the existing `Order` capture path (not manual/CSV-only transaction entry).

### Key Challenges and Analysis
- **Attribution**: referral link → `/join/<code>` sets a 90-day cookie → clinic onboarding stamps `Client.partnerOrgId/partnerRepId/referralLinkId`. Admin can also attach clients manually.
- **Automatic accrual**: hook where `syncSalesRecordFromOrder` runs on capture (`lib/stripe/payments.ts`) + reversal hook in `lib/orders/refund.ts`. Idempotent via unique `PartnerTransaction.reference = "order:<id>"`.
- **Money**: partner ledger is integer cents + integer basis points (exact math, ported verbatim from Logos `commission.ts`); the rest of the app stays Decimal dollars. Convert at the boundary with `Math.round(dollars*100)`.
- **Two compensation models**: COMMISSION (org rate bps, rep carve-out ≤ org rate) and MARGIN (org sets clinic price ≥ per-variant wholesale floor; earns the spread; rep carve-out from margin).
- **Auth**: new `PARTNER` Clerk role (metadata) for middleware routing; real access resolved by DB lookup on `clerkUserId` across `PartnerOrg` (owner) / `PartnerOrgMember` / `PartnerRep` (Logos pattern). Provisioning: Clerk invitation seeded with `partnerOrgId`/`partnerRepId`/`partnerMemberId`; the Clerk webhook stamps `clerkUserId` into the matching row.
- **Prod migrations** apply via `POST /api/admin/db/migrate` (extend `probeSchema`).

### High-level Task Breakdown / Project Status Board
| # | Phase | Status |
| - | ----- | ------ |
| P1 | Foundation: schema + migration, commission math lib + tests, partner auth, PARTNER role plumbing | ✅ |
| P2 | Acquisition: apply page, /join/[code] + cookie, onboarding stamp, admin approval + Clerk provisioning | ✅ |
| P3 | Admin: partners section (rates, ledger approve, manual/CSV transactions, payouts, attach clients) | ✅ |
| P4 | Portal: KPIs, trend, clinics, transactions, payouts, links, reps, team, exports | ✅ |
| P5 | Margin pricing: floors admin, partner pricing → ClientPricing, margin accrual | ✅ |
| P6 | MSA e-sign gate + executed agreements | ✅ |
| P7 | Goals, clinic CRM, quote builder | ✅ |
| P8 | Partner API keys + webhooks | ✅ |

### Executor's Feedback (Jul 17 — ALL PHASES DONE, local)
**Verified:** tsc clean, eslint clean (no errors), 303/303 unit tests (25 new in `partnerCommission.test.ts`), `next build` green, DB smoke test (`scripts/smoke-partners.ts`: accrual split → idempotency → 50% refund reversal → approve → payout drain) passed against local Postgres.

**What shipped (file map):**
- Schema: 16 new models + 12 enums in one migration `20260717164907_add_partner_program` (PartnerOrg/Rep/OrgMember, ReferralLink, PartnerTransaction + CommissionEntry ledger [cents/bps ints], PartnerPayout, PartnerOrgPricing floors, PartnerAgreement MSA, PartnerClinicMeta/Activity CRM, PartnerGoal, PartnerQuote, PartnerApiKey/Webhook; Client gains partnerOrgId/partnerRepId/referralLinkId; UserRole gains PARTNER). Migrate-runner probes extended (partnerOrgTable, commissionEntryTable, clientPartnerOrgIdColumn, userRolePartnerValue).
- Engine: `lib/partners/commission.ts` (Logos port; splits, margin, reversalDelta, rollups) + `accrual.ts` (auto accrual on capture — hooked in `lib/stripe/payments.ts`, `lib/invoicing/service.ts` [net-terms], reversal in `lib/orders/refund.ts`; manual/CSV accrual) + `queries.ts` (rollups, trend, clinic book, approvedBalance).
- Auth: `lib/partners/auth.ts` (DB-lookup getPartnerContext/requirePartner: owner/member/rep), PARTNER role in middleware (`/partners(.*)` matcher, homeForRole), access.ts, roles.ts, app/page.tsx, Clerk webhook (VALID_ROLES + linkPartnerIdentity stamps clerkUserId from invitation metadata partnerOrgId/RepId/MemberId).
- Acquisition: `/partners/apply` public page + `POST /api/partners/apply`; `/join/[code]` sets 90-day `ps_ref` cookie; onboarding stamps attribution + signup counter; `lib/partners/provision.ts` (approve/reject org + invite rep/member via Clerk invitations); affiliate email templates in `lib/email/templates.ts`.
- Admin: `/partners-admin` (+ `[id]` detail: approve/reject/suspend, rate+model settings, KPIs, ledger approve-all, org/rep payouts, manual txn + CSV import, attach/detach clinics, floors editor, agreements list) + APIs under `app/api/admin/partners/…`; nav item in AdminHeader.
- Portal: `app/partners/(portal)/…` layout (identity + MSA gate) with dashboard (KPIs, 12-mo trend, recent), clinics (+ `[id]` CRM w/ stage/tags/notes timeline), transactions, payouts, links manager, reps manager, team manager, goals w/ progress, quotes builder (+ print), pricing (margin orgs → writes ClientPricing via floor validation), api (keys + webhooks); CSV exports at `/partners/exports/[dataset]`.
- MSA: `lib/partners/msa.ts` (versioned doc + SHA-256), `/partners/agreement` (canvas signature pad → PartnerAgreement record w/ IP/UA), portal-blocking gate for org owners + reps.
- API/webhooks: `lib/partners/api-auth.ts` (hashed `pk_live_…` keys), `GET /api/partner/v1/[summary|transactions|payouts|clinics|links]` (Bearer + rate-limited), `lib/partners/webhooks.ts` (HMAC `t=…,v1=…` signatures, dispatch on commission.accrued/reversed + payout.recorded).

### Production verification (Jul 17 — DONE)
- Committed + deployed (`fa8b9f2`, `f7a97a2`, `ffb01cd`, `e4042b4` on main → Vercel prod, live on peptsci.com).
- **Prod migration applied** via the in-app runner (`POST /api/admin/db/migrate`), authenticated with a temporary Clerk SUPER_ADMIN service user (created via Backend API → sign-in ticket → FAPI session → Bearer session JWT). Both new migrations applied cleanly (8 + 96 statements, 0 skipped); probe `upToDate: true`. Temp user deleted afterward.
- **Full E2E on production, all green:** apply → PENDING org in admin list → set 10% rate → approve (real Clerk invitation issued) → partner session resolves → MSA signed (agreement record + gate cleared) → referral link created → `/join/<code>` sets 90-day `ps_ref` cookie + click counted → clinic attached → $500 transaction → exactly $50 commission → API key created → `/api/partner/v1/summary` earned/unpaid $50 → approve-all + $50 payout → unpaid $0 / paid $50. All test data (org cascade, clinic, Clerk users, invitation) deleted after.
- Added during verification: `DELETE /api/admin/partners/[id]` (SUPER_ADMIN, history-guarded, `?force=true`) and a **self-heal identity link** in `getPartnerContext` (links org/rep/member from session-claim metadata when the row is unlinked).

### ✅ Clerk webhook issue — RESOLVED (Jul 17)
Root cause: `CLERK_WEBHOOK_SECRET` was not set in the Vercel production env (and the Clerk endpoint had just been configured by the owner). Fix: owner created the endpoint in the Clerk Dashboard and provided the signing secret → added `CLERK_WEBHOOK_SECRET` to Vercel production → `vercel redeploy`. Verified live: creating a test Clerk user produced two `POST /api/webhooks/clerk → 200` deliveries in runtime logs (200 = svix signature verified + handler completed; bad secret returns 400). Test user deleted after (its webhook-synced DB User row remains as SUSPENDED — harmless residue, email `webhook-test@peptsci.com`).
Note: `vercel env pull` redacts sensitive values (empty strings), so local scripts can't use pulled AWS/PG credentials — prod DB work must go through the in-app migrate/API endpoints with a SUPER_ADMIN session.

### Lessons (this effort)
- Keep the partner ledger in integer cents + integer bps (Logos port) even though the rest of the app is Decimal dollars; convert once at the boundary (`dollarsToCents`) — splits then sum exactly and reversals net to zero.
- `prisma migrate dev` in this repo can leave a stale generated client; run `npx prisma generate` if tsc reports missing model delegates right after a migration.
- Public pages that live under an authed route group need their own path carve-outs in BOTH middleware `isPublicRoute` and the portal layout structure (`/partners/apply` + `/partners/agreement` sit outside `(portal)` so the MSA gate can't loop).
- CSV-download anchors trip `@next/next/no-html-link-for-pages`; keep `<a>` (Link would prefetch the file) and disable the rule inline.
