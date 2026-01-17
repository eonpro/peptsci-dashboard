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

## Support

For issues or questions, please contact the PEPTSCI development team.
