# PEPTSCI Dashboard

A production-ready Next.js 15 dashboard for PEPTSCI that integrates with Google Sheets API to provide real-time insights into sales, inventory, pricing, competitor analysis, and financial reporting.

## Features

- 📊 **Real-time Dashboard** - KPIs, charts, and analytics
- 👥 **Customer Management** - Track customer orders and lifetime value
- 📦 **Inventory Tracking** - Monitor stock levels with auto-depletion based on sales
- 💰 **Pricing Management** - View and export pricing sheets
- 🏆 **Competitor Analysis** - Compare prices with competitors
- 📈 **Profit & Loss Reporting** - Monthly and YTD financial statements with product contribution
- 🏦 **Balance Sheet** - Inventory valuation and distributor spend tracking
- 🔄 **Auto-refresh** - 5-minute cache with on-demand revalidation
- 📱 **Responsive Design** - Works on all devices
- 🎨 **Beautiful UI** - Custom branded theme with shadcn/ui

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: Recharts
- **Data Validation**: Zod
- **Date Handling**: date-fns
- **Icons**: Lucide React
- **Data Source**: Google Sheets API v4

## Prerequisites

- Node.js 18+
- npm or pnpm package manager
- Google Sheets API key
- Public Google Sheets or service account

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
# or
pnpm install
```

3. Configure environment variables:
   - The `.env.local` file should already exist with the required values
   - If not, create `.env.local` with:

```env
GOOGLE_SHEETS_API_KEY=your_api_key_here
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here
```

## Running the Application

### Development Mode

```bash
npm run dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### Production Build

```bash
npm run build
npm run start
# or
pnpm build
pnpm start
```

## Project Structure

```
peptsci-dashboard/
├── app/
│   ├── (auth)/             # Authentication routes (Clerk)
│   │   ├── sign-in/
│   │   └── sign-up/
│   ├── api/                # API routes
│   │   ├── sales/          # Sales data endpoint
│   │   ├── inventory/      # Inventory endpoint (with auto-adjustment)
│   │   ├── orders/         # Distributor orders
│   │   ├── prices/         # Price sheet
│   │   ├── competitors/    # Competitor data
│   │   └── revalidate/     # Cache revalidation
│   ├── dashboard/          # Main dashboard page
│   ├── customers/          # Customer management
│   ├── inventory/          # Inventory tracking
│   ├── pricing/            # Price sheet
│   ├── competitors/        # Competitor comparison
│   ├── profit-loss/        # P&L and balance sheet
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── Header.tsx          # Navigation header
│   ├── KPI.tsx             # KPI card component
│   ├── ChartCard.tsx       # Chart wrapper
│   ├── DataTable.tsx       # Data table with sorting
│   ├── CustomerAvatar.tsx  # Customer avatar
│   └── Logo.tsx            # Brand logo
├── lib/
│   ├── __tests__/          # Unit tests
│   │   ├── finance.test.ts
│   │   └── inventoryAdjustments.test.ts
│   ├── config.ts           # Centralized env validation
│   ├── finance.ts          # P&L and balance sheet calculations
│   ├── inventoryAdjustments.ts # Auto-decrement inventory by sales
│   ├── kpis.ts             # KPI calculations
│   ├── orders.ts           # Distributor order parsing
│   ├── sheets.ts           # Google Sheets integration
│   └── utils.ts            # Utility functions
└── public/                 # Static assets
```

## Data Schema

### Sales Tab

- Date, OrderID, CustomerName, CustomerEmail, CustomerPhone
- Address, City, State, Zip, TrackingNumber
- PaidAmount, Vials, AmountPerVial, Product, Notes

### Inventory Tab

- MedicationName, Dose, SRP
- InventoryOrdered, InventoryAvailable

### Price Sheet Tab

- Product, Dose, Cost, SRP, Notes

### Competitor Comparison Tab

- Competitor, Product, Dose
- TheirPrice, OurSRP, Diff

## Key Features

### Dashboard

- Total Sales, MTD Sales, Total Orders, Unique Clients
- MTD Daily Revenue Chart
- Revenue by Product Chart
- Top 10 Customers Chart
- Recent Orders Table

### Customers

- Customer list with search
- Customer detail pages
- Order history timeline
- Lifetime value tracking

### Inventory

- Stock level monitoring
- Low stock alerts (≤10 units)
- Inventory value at SRP
- Visual stock level chart

### Pricing

- Product pricing cards
- Margin calculations
- CSV export functionality
- Price comparison table

### Competitors

- Price comparison analysis
- Savings calculations
- Visual comparison charts
- Competitor summary cards

### Profit & Loss (`/profit-loss`)

- **Monthly P&L**: Revenue, COGS, gross profit, and net profit for each calendar month
- **YTD Summary**: Year-to-date aggregations with gross/net margin calculations
- **Product Contribution**: Revenue and profit breakdown by product
- **Monthly Trend**: 6-month historical comparison table
- **Balance Sheet Snapshot**: Current inventory valuation and distributor spend

## Financial Reporting

The `lib/finance.ts` module provides finance-ready calculations:

### Monthly Profit & Loss

```typescript
import { calculateMonthlyProfitLoss } from '@/lib/finance'

const monthlySummaries = calculateMonthlyProfitLoss(sales)
// Returns: MonthlyProfitLoss[] with revenue, COGS, margins, and product breakdown
```

### Year-to-Date Summary

```typescript
import { calculateYearToDateProfitLoss } from '@/lib/finance'

const ytd = calculateYearToDateProfitLoss(sales, 2025, 6) // through June 2025
// Returns: YearToDateProfitLoss with aggregated metrics
```

### Balance Sheet

```typescript
import { calculateBalanceSheet } from '@/lib/finance'

const balance = calculateBalanceSheet(inventory, distributorOrders, { year: 2025 })
// Returns: BalanceSheetSummary with inventory valuation and spend
```

### Key Assumptions

- **Cash Basis**: Only orders with `PaidAmount > 0` contribute to P&L
- **COGS**: Derived from the `COGS` field on each sale record
- **Inventory Valuation**: On-hand units × unit cost from inventory data
- **Distributor Spend**: Aggregates `total` from distributor order records

## Inventory Auto-Adjustment

The `/api/inventory` endpoint automatically reduces on-hand counts based on sales data:

```typescript
import { adjustInventoryWithSales } from '@/lib/inventoryAdjustments'

const adjusted = adjustInventoryWithSales(inventory, sales)
// InventoryAvailable is reduced by matching product sales
```

Products are matched using flexible normalization (case-insensitive, dose matching, SKU fallback).

## API Endpoints

- `GET /api/sales` - Fetch sales data (with paid/unpaid orders)
- `GET /api/inventory` - Fetch inventory data (auto-adjusted by sales)
- `GET /api/orders` - Fetch distributor orders (for balance sheet)
- `GET /api/prices` - Fetch price sheet
- `GET /api/competitors` - Fetch competitor data
- `POST /api/revalidate` - Trigger cache revalidation

## Caching Strategy

- All data routes use 5-minute ISR caching
- Manual revalidation available via `/api/revalidate`
- Supports tag-based and path-based revalidation

## Payments (Stripe)

The B2B shop checkout (`/shop/checkout`) is powered by Stripe using **Model A
(inline pricing)**: we never create Products/Prices in Stripe. The Postgres
catalog (`ProductVariant`) and per-client pricing (`ClientPricing`) are the sole
source of truth, and Stripe only ever receives the **server-computed amount**.
Raw card data never touches our server (PCI DSS SAQ A) — all card entry happens
in Stripe Elements / the embedded Payment Element.

### Stripe Connect (platform → connected account)

PeptSci runs as a **Stripe Connect platform**. Live funds settle into a
**connected account** (e.g. `acct_1S34ayDhHXlGkLX4` = "Como RX LLX") via
**Direct charges**: the server uses the platform key plus the `stripeAccount`
request header, so Customers, PaymentIntents, SetupIntents, and PaymentMethods
are all created **on the connected account** (`lib/stripe/connect.ts`). The
browser routes Stripe.js to the same account through `loadStripe(pk,
{ stripeAccount })`. Configure with `STRIPE_CONNECTED_ACCOUNT_ID`; set an
optional platform fee with `STRIPE_APPLICATION_FEE_BPS` (basis points). Leaving
`STRIPE_CONNECTED_ACCOUNT_ID` blank falls back to a standalone account (dev).
Use a **Connect webhook endpoint** so connected-account events (with
`event.account`) reach `/api/webhooks/stripe`.

### Pricing rules

- **No sales tax.**
- **Shipping:** free at/above `$500`, otherwise a flat `$25`.
- Unit prices are resolved server-side per client (`lib/checkout-core.ts` +
  `lib/stripe/checkout.ts`); client-sent cart amounts are ignored.

### Flow

1. `POST /api/shop/checkout/process` — auth + rate-limit, resolves the cart,
   ensures a Stripe Customer for the client, persists a `DRAFT` order, and
   creates a PaymentIntent. New cards return a `clientSecret` for Elements;
   a chosen saved card is charged off-session immediately.
2. Stripe Elements confirms the payment client-side (`confirmPayment`).
3. `POST /api/shop/checkout/confirm` — reconciles the order's `paymentStatus`,
   advances `DRAFT → SUBMITTED` on capture, and persists the saved card.
4. `POST /api/webhooks/stripe` — bulletproof reconciliation (never 500),
   idempotent via the `WebhookEvent` table, source of truth for final state.

### Saved cards (off-session)

- `POST /api/shop/payment-methods/setup-intent` — add a card without a purchase.
- `GET/POST/DELETE /api/shop/payment-methods` — list / save / detach a client's
  cards (scoped to the client's own Stripe Customer).

### Setup & verification

```bash
# Configure keys in .env.local (see env-example.txt), then verify connectivity:
npm run stripe:check

# Forward webhooks in local dev:
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Admin-only runtime diagnostics:
GET /api/stripe/diagnostics
```

Use a **restricted key (`rk_...`)** scoped to PaymentIntents, Customers,
SetupIntents, and PaymentMethods. Test card: `4242 4242 4242 4242`.

## Running Tests

The project uses Node.js built-in test runner for unit tests:

```bash
# Run all tests
npx tsx --test lib/__tests__/*.test.ts

# Run specific test file
npx tsx --test lib/__tests__/finance.test.ts
```

## Configuration

Environment variables are validated at runtime via `lib/config.ts` using Zod:

```typescript
import { getGoogleSheetsConfig } from '@/lib/config'

const config = getGoogleSheetsConfig()
if (!config) {
  // Handle missing configuration gracefully
}
```

Required variables:

- `GOOGLE_SHEETS_SPREADSHEET_ID` - Google Sheets document ID
- `GOOGLE_SHEETS_API_KEY` - Google Sheets API key

## Important Notes

1. **Google Sheets Access**: The Google Sheets API key can only access public sheets. If your sheet is private, you'll need to:
   - Make the sheet public (view-only), OR
   - Use a service account with proper permissions

2. **Data Format**: Ensure your Google Sheets columns match the expected schema for proper parsing

3. **Time Zone**: All date/time calculations use America/New_York timezone

4. **Environment Variables**: Never commit `.env.local` to version control

5. **Config Validation**: Missing or invalid environment variables are logged once and the app falls back to mock data where available

## Troubleshooting

### Sheet Not Found

- Verify the spreadsheet ID is correct
- Ensure the sheet is publicly accessible
- Check tab names match exactly (case-sensitive)

### Invalid Data

- Check column headers match expected schema
- Verify date formats are parseable
- Ensure numeric values don't contain special characters

### Performance Issues

- Use the revalidation endpoint to refresh cache
- Check network latency to Google Sheets API
- Consider implementing pagination for large datasets

## License

Proprietary - PEPTSCI

## Inventory Batches & Label Generation

Admins (and super-admins) record inbound inventory and print research-use-only
(RUO) vial labels from **Inventory → Receive Inventory**.

- **Single-step intake** (`/inventory`): enter product name, dose (mg), vial
  size, BUD, amount, and received-on date. On save the system:
  - auto-generates the **batch number** — `<FIRST 3 LETTERS><MG#>-<BUD MM><BUD YYYY>`
    (e.g. Tesamorelin 10mg, BUD 07/11/2027 → `TES10-072027`; numeric suffix on
    collision), which is also the **Code 128 barcode** payload;
  - increments on-hand stock (Postgres is the source of truth) and writes an
    audit trail (`InventoryBatchEvent` + `InventoryAdjustment`).
- **Labels**: print a full OL4891LP sheet (2"×0.75", 36/sheet) or a single proof
  per batch. Engine: `lib/labels/peptsciLabelPdf.ts` (`pdf-lib` + `jsbarcode`),
  adapted from the LogosRx model. It uses the **real PeptSci artwork** as the
  label background — the supplied `public/labels/PEPTSCI LABEL SAMPLE.svg`
  (viewBox = the label in points, with the dynamic fields marked `display:none`)
  is rasterized to `public/labels/peptsci-label-template.png` via
  `npm run labels:template`, and the engine overlays only the dynamic fields
  (BUD date, dose, Code 128 barcode, product name, batch number) at the exact
  SVG placeholder coordinates, using the artwork's **brand fonts** (American
  Typewriter for BUD/batch, Sofia Pro for dose/name) embedded + subset via
  `@pdf-lib/fontkit` from `public/fonts/labels/` (Standard-14 fallback). A
  programmatic vector label is the fallback if the template asset is missing
  (see `public/labels/README.md` and `public/fonts/README.md`).
- **Order labels (on command)**: `POST /api/admin/orders/[id]/labels/pdf` draws
  the required vials per line item from batches FIFO (soonest BUD first) and
  emits one label per vial; `?consume=true` decrements stock as fulfilled.

### Key files

| Area | Path |
| ---- | ---- |
| Batch number | `lib/batch-number.ts` |
| Intake service | `lib/inventory-batches.ts` (+ pure `lib/inventory-batches-core.ts`) |
| Label engine | `lib/labels/peptsciLabelPdf.ts` |
| APIs | `app/api/admin/inventory/batches/**`, `app/api/admin/inventory/labels/pdf`, `app/api/admin/orders/[id]/labels/pdf` |
| UI | `app/(dashboard)/inventory/page.tsx`, `ReceiveInventoryModal.tsx` |
| Schema | `prisma/schema.prisma` (`InventoryBatch`, `InventoryBatchEvent`) |

Tests: `node --import ts-node/register --test lib/__tests__/batchNumber.test.ts lib/__tests__/inventoryBatches.test.ts`

## Support

For issues or questions, please contact the PEPTSCI development team.
