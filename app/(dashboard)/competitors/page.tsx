import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getCompetitors } from '@/lib/competitors'
import CompetitorsTable from './CompetitorsTable'
import CompetitorChart from './CompetitorChartLazy'
import { CompetitorImportButton } from '@/components/admin/CompetitorImportButton'

interface CompetitorEntry {
  name: string
  price: number
  diff: number
}

interface ProductComparison {
  product: string
  ourPrice: number
  competitors: CompetitorEntry[]
}

export default async function CompetitorsPage() {
  const competitors = await getCompetitors()

  // Calculate statistics
  const stats = {
    totalProducts: new Set(competitors.map((c) => c.Product)).size,
    totalCompetitors: new Set(competitors.map((c) => c.Competitor)).size,
    betterPriceCount: competitors.filter((c) => {
      const diff = c.Diff !== undefined ? c.Diff : c.OurSRP - c.TheirPrice
      return diff < 0
    }).length,
    averageSavings: 0,
  }

  const savings = competitors
    .map((c) => {
      const diff = c.Diff !== undefined ? c.Diff : c.OurSRP - c.TheirPrice
      return diff < 0 ? Math.abs(diff) : 0
    })
    .filter((s) => s > 0)

  if (savings.length > 0) {
    stats.averageSavings = savings.reduce((a, b) => a + b, 0) / savings.length
  }

  // Group by product for comparison
  const productComparison = competitors.reduce<Record<string, ProductComparison>>((acc, item) => {
    if (!acc[item.Product]) {
      acc[item.Product] = {
        product: item.Product,
        ourPrice: item.OurSRP,
        competitors: [],
      }
    }
    acc[item.Product].competitors.push({
      name: item.Competitor,
      price: item.TheirPrice,
      diff: item.Diff !== undefined ? item.Diff : item.OurSRP - item.TheirPrice,
    })
    return acc
  }, {})

  // Find products where we have the best price
  const bestPrices = Object.values(productComparison).filter((product) => {
    return product.competitors.every((comp) => comp.diff <= 0)
  })

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Competitor Analysis</h2>
          <p className="text-muted-foreground">Price comparison and market positioning</p>
        </div>
        <CompetitorImportButton />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">Being tracked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Competitors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCompetitors}</div>
            <p className="text-xs text-muted-foreground">Being monitored</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Better Prices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.betterPriceCount}</div>
            <p className="text-xs text-muted-foreground">Products we price better</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats.averageSavings.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">When we have better price</p>
          </CardContent>
        </Card>
      </div>

      {/* Products with Best Price */}
      {bestPrices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Market Leading Prices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {bestPrices.map((product) => (
                <Badge key={product.product} className="bg-green-100 text-green-800">
                  {product.product} - ${product.ourPrice}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Competitor Price Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Price Comparison by Product</CardTitle>
          <p className="text-sm text-muted-foreground">
            How our prices compare across all products
          </p>
        </CardHeader>
        <CardContent>
          <CompetitorChart
            data={Object.values(productComparison).map((item) => ({
              name: item.product,
              ourPrice: item.ourPrice,
              theirPrice: Math.round(
                item.competitors.reduce((sum, c) => sum + c.price, 0) / item.competitors.length
              ),
              competitor: 'Average',
            }))}
          />
        </CardContent>
      </Card>

      {/* Detailed Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <CompetitorsTable data={competitors} />
        </CardContent>
      </Card>
    </div>
  )
}
