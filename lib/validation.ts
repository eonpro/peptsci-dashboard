import { z } from 'zod'

/**
 * Common validation schemas for API request parameters.
 */

// Pagination parameters
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

// Date range base schema (without refine for merging)
const dateRangeBaseSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
})

// Date range with validation
export const dateRangeSchema = dateRangeBaseSchema.refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate
    }
    return true
  },
  { message: 'startDate must be before or equal to endDate' }
)

// Sort parameters
export const sortSchema = z.object({
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// Search parameters
export const searchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
})

// Combined query parameters for list endpoints
export const listQuerySchema = paginationSchema
  .merge(dateRangeBaseSchema)
  .merge(sortSchema)
  .merge(searchSchema)
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate
      }
      return true
    },
    { message: 'startDate must be before or equal to endDate' }
  )

// Revalidation parameters
export const revalidateSchema = z.object({
  tag: z.string().min(1).max(50).optional(),
  path: z.string().min(1).max(200).optional(),
})

// Customer ID parameter
export const customerIdSchema = z.object({
  id: z.string().min(1).max(100),
})

// Product filter parameters
export const productFilterSchema = z.object({
  product: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
}).refine(
  (data) => {
    if (data.minPrice !== undefined && data.maxPrice !== undefined) {
      return data.minPrice <= data.maxPrice
    }
    return true
  },
  { message: 'minPrice must be less than or equal to maxPrice' }
)

/**
 * Validates query parameters from a URL search params object.
 * Returns the validated data or throws a ZodError.
 */
export function validateQueryParams<T extends z.ZodSchema>(
  schema: T,
  searchParams: URLSearchParams
): z.infer<T> {
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    params[key] = value
  })
  return schema.parse(params)
}

/**
 * Safely validates query parameters, returning null on failure.
 */
export function safeValidateQueryParams<T extends z.ZodSchema>(
  schema: T,
  searchParams: URLSearchParams
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    params[key] = value
  })
  const result = schema.safeParse(params)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

/**
 * Formats Zod validation errors into a user-friendly message.
 */
export function formatValidationErrors(error: z.ZodError): string {
  return error.errors
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join('; ')
}
