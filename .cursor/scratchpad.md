# PeptSci Dashboard - Financial Reporting Enhancements

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
| Component | Status | Notes |
|-----------|--------|-------|
| Data Audit | ✅ Complete | Verified sheet outputs for paid sales, inventory, and distributor orders |
| Aggregation Helpers | ✅ Complete | `lib/finance.ts` with unit coverage via Node test runner |
| P&L UI Update | ✅ Complete | Month/YTD cards, product contribution, trend table |
| Balance Sheet UI | ✅ Complete | Inventory valuation + spend summary integrated |
| Inventory Auto-Decrement | ✅ Complete | API returns inventory reduced by sold vials via `adjustInventoryWithSales` |
| Config Hardening | ✅ Complete | Centralized env validation in `lib/config.ts`; no public API key fallbacks |
| Tests & Docs | ✅ Complete | Unit tests and README/JSDoc documentation updated |

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

| Category | Score | Status |
|----------|-------|--------|
| Code Quality | 7/10 | Good |
| Security | 5/10 | ⚠️ Needs Work |
| Functionality | 7/10 | Good |
| UI/UX | 6/10 | Moderate |
| Testing | 6/10 | Moderate |

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

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| `getSales()` is 160+ lines | Medium | `lib/sheets.ts:118-283` | Refactor into smaller functions |
| Hardcoded "November" | Medium | `app/dashboard/page.tsx:125` | Use dynamic month name |
| Console.log in production | Low | `lib/sheets.ts:277,324,447` | Remove or use logger |
| Duplicated data fetching pattern | Low | Multiple pages | Create custom hook `useDataFetch` |
| Missing error boundaries | Medium | Page components | Add granular error boundaries |

---

## 2. SECURITY

### ✅ Strengths
- Clerk authentication integrated
- Environment variables validated via Zod (`lib/config.ts`)
- `.gitignore` excludes `.env*.local`, `.clerk/`
- No hardcoded secrets in codebase
- Webhook signature verification in `app/api/webhooks/clerk/route.ts`

### 🚨 Critical Issues

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| **API routes unprotected** | 🔴 Critical | `app/api/*` | Add Clerk `auth()` checks |
| No rate limiting | High | All API routes | Implement rate limiting middleware |
| Error messages expose internals | Medium | API error responses | Return generic messages |
| No input validation | Medium | API query params | Add Zod validation |
| CORS not configured | Medium | API routes | Add explicit CORS headers |

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

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| Competitors page empty | High | `lib/sheets.ts:463-466` | Implement or remove route |
| Search bar non-functional | Medium | `components/Header.tsx:63-68` | Implement search or remove |
| No pagination | Medium | Large data tables | Add pagination for >50 rows |
| PO Generator status unknown | Medium | `app/po-generator/page.tsx` | Verify functionality |
| Missing data validation | Medium | Sheet data parsing | Add Zod schemas |

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

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| Header overflows on mobile | High | `components/Header.tsx` | Add hamburger menu |
| No mobile navigation | High | Header component | Implement responsive nav |
| Font may not load | Medium | `globals.css:6-8` | Add @font-face or use fallback |
| No dark mode toggle | Low | UI | Add toggle (theme support exists) |
| KPI hardcoded month | Medium | Dashboard | Dynamic month label |
| Search placeholder only | Medium | Header | Implement or remove |

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
| Issue | Severity | Recommendation |
|-------|----------|----------------|
| Schema unused | Medium | Either migrate to DB or remove Prisma |
| No migrations | Medium | Run `prisma migrate dev` if using DB |
| Dual data sources | Medium | Consolidate on one source of truth |

---

## 6. TESTING

### Current Coverage
- `lib/__tests__/finance.test.ts` - 3 tests ✅
- `lib/__tests__/inventoryAdjustments.test.ts` - 4 tests ✅

### ⚠️ Gaps
| Missing Tests | Priority |
|---------------|----------|
| `lib/sheets.ts` data parsing | High |
| `lib/kpis.ts` calculations | High |
| API route handlers | Medium |
| Component rendering | Low |

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