import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublicTracking } from '@/lib/shipping/tracking'
import {
  describeShippingStatus,
  trackingTimeline,
  isExceptionStatus,
} from '@/lib/shipping/fedex-status'
import { TrackingLookupForm } from '../TrackingLookupForm'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const metadata: Metadata = {
  title: 'Track your shipment — PeptSci',
  robots: { index: false, follow: false },
}

function formatDate(d: Date | null): string | null {
  if (!d) return null
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ trackingNumber: string }>
}) {
  const { trackingNumber } = await params
  const decoded = decodeURIComponent(trackingNumber)
  const info = await getPublicTracking(decoded)

  return (
    <main className="min-h-screen bg-[#F2F0EA] px-4 py-12 text-[#1a1a2e]">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-wide text-[#050722]">PEPTSCI</span>
        </div>

        {!info ? (
          <div className="rounded-3xl bg-white p-8 shadow-[0_18px_60px_-30px_rgba(33,60,239,0.35)]">
            <h1 className="mb-2 text-xl font-semibold">Shipment not found</h1>
            <p className="mb-6 text-sm text-gray-500">
              We couldn&rsquo;t find a shipment for tracking number{' '}
              <span className="font-medium text-[#1a1a2e]">{decoded}</span>. Double-check the number,
              or look it up directly with the carrier.
            </p>
            <TrackingLookupForm initialValue={decoded} />
            <a
              href={`https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(decoded)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm font-medium text-[#213cef] hover:underline"
            >
              Track on FedEx.com →
            </a>
          </div>
        ) : (
          <div className="rounded-3xl bg-white p-8 shadow-[0_18px_60px_-30px_rgba(33,60,239,0.35)]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Order #{info.orderNumber}</p>
                <h1 className="mt-1 text-2xl font-semibold">
                  {describeShippingStatus(info.shippingStatus)}
                </h1>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  info.shippingStatus === 'DELIVERED'
                    ? 'bg-green-100 text-green-700'
                    : isExceptionStatus(info.shippingStatus)
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-[#213cef]'
                }`}
              >
                {info.carrier}
              </span>
            </div>

            <dl className="mb-6 grid grid-cols-1 gap-y-3 rounded-2xl bg-[#F2F0EA] px-5 py-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Tracking #</dt>
                <dd className="font-medium break-all">{info.trackingNumber}</dd>
              </div>
              {formatDate(info.shippedAt) && (
                <div>
                  <dt className="text-gray-500">Shipped</dt>
                  <dd className="font-medium">{formatDate(info.shippedAt)}</dd>
                </div>
              )}
            </dl>

            {isExceptionStatus(info.shippingStatus) ? (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                There&rsquo;s a delay with this shipment. Check the carrier for the latest detail —
                this usually resolves on its own within a day or two.
              </div>
            ) : (
              <ol className="mb-6 space-y-4">
                {trackingTimeline(info.shippingStatus).map((step) => (
                  <li key={step.status} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                        step.reached
                          ? 'border-[#213cef] bg-[#213cef]'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {step.reached && (
                        <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
                      )}
                    </span>
                    <span
                      className={`text-sm ${
                        step.current
                          ? 'font-semibold text-[#1a1a2e]'
                          : step.reached
                            ? 'text-[#1a1a2e]'
                            : 'text-gray-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <a
              href={info.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl bg-[#213cef] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1a30c0]"
            >
              View live detail on {info.carrier}.com
            </a>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          Need help?{' '}
          <Link href="mailto:support@peptsci.com" className="text-[#213cef] hover:underline">
            support@peptsci.com
          </Link>
        </p>
      </div>
    </main>
  )
}
