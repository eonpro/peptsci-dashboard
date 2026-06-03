/**
 * Migration script: Google Sheets -> PostgreSQL (Vercel Postgres)
 *
 * This script migrates data from Google Sheets to the PostgreSQL database.
 * Run with: npx ts-node scripts/migrate-to-postgres.ts
 *
 * Prerequisites:
 * 1. DATABASE_URL must be set in .env.local
 * 2. Prisma migrations must be run: npx prisma migrate deploy
 * 3. Google Sheets credentials must be configured
 */

import { PrismaClient } from '@prisma/client'

// Types from sheets - inline to avoid import issues with ts-node
interface SheetSale {
  Date: Date | null
  OrderID: string
  CustomerName: string
  CustomerEmail: string
  CustomerPhone: string
  Address: string
  City: string
  State: string
  Zip: string
  TrackingNumber: string
  InvoicePaid: boolean
  PaidAmount: number
  Vials: number
  AmountPerVial: number
  Product: string
  Notes: string
  COGS: number
  Profit: number
  ProfitMargin: number
  Markup: number
}

interface SheetInventory {
  SKU: string
  MedicationName: string
  Dose: string
  SRP: number
  Cost: number
  InventoryOrdered: number
  InventoryAvailable: number
}

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting migration from Google Sheets to PostgreSQL...\n')

  // Check database connection
  try {
    await prisma.$connect()
    console.log('✅ Database connection established\n')
  } catch (error) {
    console.error('❌ Failed to connect to database:', error)
    console.error('\nMake sure DATABASE_URL is set in your environment.')
    process.exit(1)
  }

  // Import sheets functions dynamically (they use ESM)
  console.log('📊 Fetching data from Google Sheets...\n')

  // Since we can't easily import ESM modules from CommonJS,
  // we'll make HTTP requests to our own API endpoints
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  let inventory: SheetInventory[] = []
  let sales: SheetSale[] = []

  try {
    // Fetch inventory
    const invResponse = await fetch(`${baseUrl}/api/inventory`)
    if (invResponse.ok) {
      inventory = await invResponse.json()
      console.log(`  📦 Found ${inventory.length} inventory items`)
    } else {
      console.warn('  ⚠️  Could not fetch inventory from API')
    }

    // Fetch sales
    const salesResponse = await fetch(`${baseUrl}/api/sales`)
    if (salesResponse.ok) {
      sales = await salesResponse.json()
      console.log(`  💰 Found ${sales.length} sales records`)
    } else {
      console.warn('  ⚠️  Could not fetch sales from API')
    }
  } catch (error) {
    console.error('❌ Failed to fetch data from API. Is the dev server running?')
    console.error('   Run: npm run dev')
    console.error('   Then run this script again.')
    process.exit(1)
  }

  console.log('\n')

  // Step 1: Migrate Products and Variants
  console.log('📦 Migrating products and variants...')

  const productMap = new Map<string, string>() // SKU -> Product ID
  const variantMap = new Map<string, string>() // variant key -> Variant ID

  for (const item of inventory) {
    // Extract base product name (first word)
    const baseName = item.MedicationName.split(' ')[0]

    // Check if product exists
    let product = await prisma.product.findFirst({
      where: { name: baseName },
    })

    if (!product) {
      // Create product
      product = await prisma.product.create({
        data: {
          sku: baseName.toUpperCase().substring(0, 10),
          name: baseName,
          category: baseName,
          status: 'ACTIVE',
        },
      })
      console.log(`  ✅ Created product: ${baseName}`)
    }

    productMap.set(baseName, product.id)

    // Create variant
    const variantKey = `${item.MedicationName}-${item.Dose}`

    // Check if variant exists
    let variant = await prisma.productVariant.findFirst({
      where: {
        productId: product.id,
        dose: item.Dose,
      },
    })

    if (!variant) {
      variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: item.SKU || `${baseName.substring(0, 3).toUpperCase()}-${item.Dose}`,
          dose: item.Dose,
          unitCost: item.Cost,
          srp: item.SRP,
          inventoryOnHand: item.InventoryAvailable,
          reorderLevel: 10,
          status: 'ACTIVE',
        },
      })
      console.log(`  ✅ Created variant: ${item.MedicationName} ${item.Dose}`)
    } else {
      // Update existing variant with latest inventory
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          inventoryOnHand: item.InventoryAvailable,
          unitCost: item.Cost,
          srp: item.SRP,
        },
      })
      console.log(`  🔄 Updated variant: ${item.MedicationName} ${item.Dose}`)
    }

    variantMap.set(variantKey, variant.id)
  }

  console.log(`\n  Total: ${productMap.size} products, ${variantMap.size} variants\n`)

  // Step 2: Create a system user for legacy orders
  console.log('👤 Ensuring system user exists...')

  let systemUser = await prisma.user.findFirst({
    where: { email: 'system@peptsci.com' },
  })

  if (!systemUser) {
    systemUser = await prisma.user.create({
      data: {
        clerkUserId: 'system',
        email: 'system@peptsci.com',
        firstName: 'System',
        lastName: 'Import',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    })
    console.log('  ✅ Created system user\n')
  } else {
    console.log('  ✓ System user already exists\n')
  }

  // Step 3: Create clients from unique customers
  console.log('🏢 Creating clients from sales data...')

  const clientMap = new Map<string, string>() // email/name -> Client ID
  const uniqueCustomers = new Map<
    string,
    { name: string; email: string; phone: string; city: string; state: string }
  >()

  // Extract unique customers
  for (const sale of sales) {
    const key = sale.CustomerEmail?.toLowerCase() || sale.CustomerName?.toLowerCase() || 'unknown'
    if (!uniqueCustomers.has(key) && key !== 'unknown') {
      uniqueCustomers.set(key, {
        name: sale.CustomerName,
        email: sale.CustomerEmail,
        phone: sale.CustomerPhone,
        city: sale.City,
        state: sale.State,
      })
    }
  }

  for (const [key, customer] of uniqueCustomers) {
    let client = await prisma.client.findFirst({
      where: {
        OR: [{ contactEmail: customer.email }, { organizationName: customer.name }],
      },
    })

    if (!client) {
      client = await prisma.client.create({
        data: {
          organizationName: customer.name || 'Unknown Organization',
          contactName: customer.name,
          contactEmail: customer.email || undefined,
          contactPhone: customer.phone || undefined,
          shippingAddress: customer.city
            ? {
                city: customer.city,
                state: customer.state,
              }
            : undefined,
          onboardingStatus: 'APPROVED',
        },
      })
      console.log(`  ✅ Created client: ${customer.name}`)
    }

    clientMap.set(key, client.id)
  }

  console.log(`\n  Total: ${clientMap.size} clients\n`)

  // Step 4: Migrate sales as archived orders
  console.log('📝 Migrating sales to orders (as historical archive)...')

  let ordersCreated = 0
  let ordersSkipped = 0

  // Get a default client for orders without customer info
  let defaultClient = await prisma.client.findFirst({
    where: { organizationName: 'Legacy Orders' },
  })

  if (!defaultClient) {
    defaultClient = await prisma.client.create({
      data: {
        organizationName: 'Legacy Orders',
        contactName: 'Legacy Import',
        onboardingStatus: 'APPROVED',
      },
    })
  }

  for (const sale of sales) {
    // Skip if no meaningful data
    if (!sale.PaidAmount && !sale.Product) {
      ordersSkipped++
      continue
    }

    // Find or create client
    const customerKey =
      sale.CustomerEmail?.toLowerCase() || sale.CustomerName?.toLowerCase() || 'unknown'
    const clientId = clientMap.get(customerKey) || defaultClient.id

    // Check if order already exists (by order ID)
    const existingOrder = await prisma.order.findFirst({
      where: {
        notes: { contains: sale.OrderID },
      },
    })

    if (existingOrder) {
      ordersSkipped++
      continue
    }

    // Find variant for this product
    const productName = sale.Product.split(' ')[0]
    let variantId: string | null = null

    // Try to find a matching variant
    const variant = await prisma.productVariant.findFirst({
      where: {
        OR: [
          { sku: sale.Product },
          {
            product: {
              name: { contains: productName },
            },
          },
        ],
      },
    })

    if (variant) {
      variantId = variant.id
    }

    // Create the order
    try {
      const order = await prisma.order.create({
        data: {
          clientId,
          createdById: systemUser.id,
          status: sale.InvoicePaid ? 'COMPLETED' : 'SUBMITTED',
          paymentStatus: sale.InvoicePaid ? 'CAPTURED' : 'PENDING',
          subtotal: sale.PaidAmount,
          total: sale.PaidAmount,
          notes: `Legacy import: ${sale.OrderID}`,
          internalNotes: `Imported from Google Sheets. Original tracking: ${sale.TrackingNumber || 'N/A'}`,
          createdAt: sale.Date || new Date(),
          submittedAt: sale.Date || undefined,
          fulfilledAt: sale.InvoicePaid ? sale.Date || undefined : undefined,
          items: variantId
            ? {
                create: {
                  variantId,
                  quantity: sale.Vials || 1,
                  unitPrice: sale.AmountPerVial || sale.PaidAmount,
                  totalPrice: sale.PaidAmount,
                },
              }
            : undefined,
        },
      })

      ordersCreated++

      if (ordersCreated % 50 === 0) {
        console.log(`  ... ${ordersCreated} orders migrated`)
      }
    } catch (error) {
      console.error(`  ⚠️  Failed to create order for ${sale.OrderID}:`, error)
      ordersSkipped++
    }
  }

  console.log(`\n  ✅ Created ${ordersCreated} orders`)
  console.log(`  ⏭️  Skipped ${ordersSkipped} (duplicates or invalid)\n`)

  // Summary
  console.log('═'.repeat(50))
  console.log('✅ Migration complete!\n')
  console.log('Summary:')
  console.log(`  • ${productMap.size} products`)
  console.log(`  • ${variantMap.size} variants`)
  console.log(`  • ${clientMap.size} clients`)
  console.log(`  • ${ordersCreated} orders`)
  console.log('\nNext steps:')
  console.log('  1. Verify data in Supabase/Vercel Postgres dashboard')
  console.log('  2. Set up Airtable for product content')
  console.log('  3. Update API routes to read from Postgres')
  console.log('  4. Keep Google Sheets as read-only archive')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
