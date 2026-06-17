// Next.js instrumentation hook. Loads the Sentry server/edge SDK based on the
// active runtime. Both configs no-op when SENTRY_DSN is unset.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown in React Server Components / route handlers so they
// reach Sentry with full request context.
export { captureRequestError as onRequestError } from '@sentry/nextjs'
