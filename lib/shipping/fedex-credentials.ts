/**
 * FedEx credential resolution.
 *
 * Ship/Rate live on one developer project. Basic Integrated Visibility (Track)
 * cannot share that project — FedEx requires a dedicated BIV project and keys.
 * Pure helpers (no network) so unit tests can pass a fake env.
 */

export type FedExCredentials = {
  clientId: string
  clientSecret: string
  accountNumber: string
}

export type FedExCredentialEnv = {
  FEDEX_CLIENT_ID?: string
  FEDEX_CLIENT_SECRET?: string
  FEDEX_ACCOUNT_NUMBER?: string
  FEDEX_TRACK_CLIENT_ID?: string
  FEDEX_TRACK_CLIENT_SECRET?: string
  FEDEX_TRACK_ACCOUNT_NUMBER?: string
}

function present(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Ship + Rate project keys. */
export function resolveShipCredentials(env: FedExCredentialEnv): FedExCredentials | null {
  if (
    !present(env.FEDEX_CLIENT_ID) ||
    !present(env.FEDEX_CLIENT_SECRET) ||
    !present(env.FEDEX_ACCOUNT_NUMBER)
  ) {
    return null
  }
  return {
    clientId: env.FEDEX_CLIENT_ID,
    clientSecret: env.FEDEX_CLIENT_SECRET,
    accountNumber: env.FEDEX_ACCOUNT_NUMBER,
  }
}

/**
 * Track / BIV project keys. Never falls back to the Ship project — that is
 * what produced production 403 FORBIDDEN on /track/v1/trackingnumbers.
 */
export function resolveTrackCredentials(env: FedExCredentialEnv): FedExCredentials | null {
  if (!present(env.FEDEX_TRACK_CLIENT_ID) || !present(env.FEDEX_TRACK_CLIENT_SECRET)) {
    return null
  }
  const accountNumber = env.FEDEX_TRACK_ACCOUNT_NUMBER || env.FEDEX_ACCOUNT_NUMBER || ''
  return {
    clientId: env.FEDEX_TRACK_CLIENT_ID,
    clientSecret: env.FEDEX_TRACK_CLIENT_SECRET,
    accountNumber,
  }
}
