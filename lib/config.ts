import { z } from 'zod'

const resolveEnv = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

const googleSheetsEnvSchema = z.object({
  spreadsheetId: z.string().min(1, 'GOOGLE_SHEETS_SPREADSHEET_ID is required'),
  apiKey: z.string().min(1, 'GOOGLE_SHEETS_API_KEY is required'),
})

export type GoogleSheetsConfig = z.infer<typeof googleSheetsEnvSchema>

let cachedGoogleSheetsConfig: GoogleSheetsConfig | null | undefined
let loggedMissingConfig = false

export const getGoogleSheetsConfig = (): GoogleSheetsConfig | null => {
  if (cachedGoogleSheetsConfig !== undefined) {
    return cachedGoogleSheetsConfig
  }

  const rawConfig = {
    spreadsheetId: resolveEnv('GOOGLE_SHEETS_SPREADSHEET_ID', 'SPREADSHEET_ID'),
    apiKey: resolveEnv('GOOGLE_SHEETS_API_KEY', 'SHEETS_API_KEY'),
  }

  const parsed = googleSheetsEnvSchema.safeParse(rawConfig)

  if (parsed.success) {
    cachedGoogleSheetsConfig = parsed.data
    return cachedGoogleSheetsConfig
  }

  if (!loggedMissingConfig) {
    console.warn(
      '[GoogleSheets] Missing configuration. Set GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_API_KEY env vars.'
    )
    loggedMissingConfig = true
  }

  cachedGoogleSheetsConfig = null
  return null
}
