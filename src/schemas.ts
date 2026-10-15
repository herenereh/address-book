import { z } from '@hono/zod-openapi'

const trimmed = (max: number) => z.string().trim().max(max)

const optionalText = <T extends z.ZodType>(schema: T, example: string) =>
  z
    .preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional())
    .openapi({ example, description: 'Optional; send an empty string to leave it unset' })

const addressFields = {
  name: trimmed(120).min(1).openapi({ example: 'Jane Doe' }),
  email: optionalText(z.email().max(254), 'jane@example.com'),
  phone: optionalText(trimmed(40), '+1 555 123 4567'),
  street: trimmed(200).min(1).openapi({ example: '221B Baker Street' }),
  city: trimmed(100).min(1).openapi({ example: 'London' }),
  state: optionalText(trimmed(100), 'Greater London'),
  postalCode: trimmed(20).min(1).openapi({ example: 'NW1 6XE' }),
  country: trimmed(100).min(1).openapi({ example: 'United Kingdom' }),
  notes: optionalText(trimmed(1000), 'Ring twice'),
}

export const AddressInputSchema = z
  .object({
    ...addressFields,
    favorite: z.boolean().default(false).openapi({ example: false }),
  })
  .openapi('AddressInput')

export const AddressPatchSchema = z
  .object({
    ...addressFields,
    favorite: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one known field is required' })
  .openapi('AddressPatch')

export const AddressSchema = z
  .object({
    id: z.uuid().openapi({ example: '3f1c2a9e-8f7b-4c1d-9a2e-5b6c7d8e9f01' }),
    ...addressFields,
    favorite: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Address')

export const SORT_FIELDS = ['name', 'city', 'country', 'postalCode', 'createdAt', 'updatedAt'] as const

const booleanQuery = z.enum(['true', 'false'])
const toBool = (v: 'true' | 'false') => v === 'true'

// No `example` on the filters: Swagger UI pre-fills examples, which would silently filter results.
export const ListQuerySchema = z.object({
  q: z.string().trim().max(200).optional().openapi({
    description: 'Case-insensitive search across name, email, phone, street, city, state, postal code, country and notes',
  }),
  favorite: booleanQuery.transform(toBool).optional().openapi({ description: 'Filter by favorite status' }),
  sortBy: z.enum(SORT_FIELDS).default('name').openapi({ description: 'Field to sort by' }),
  order: z.enum(['asc', 'desc']).default('asc').openapi({ description: 'Sort direction' }),
  favoritesFirst: booleanQuery
    .default('false')
    .transform(toBool)
    .openapi({ description: 'Put favorites before non-favorites' }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const AddressListSchema = z
  .object({
    data: z.array(AddressSchema),
    total: z.number().int().openapi({ description: 'Total matches before pagination' }),
    page: z.number().int(),
    limit: z.number().int(),
  })
  .openapi('AddressList')

export const IdParamSchema = z.object({
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, description: 'The `id` returned when the address was created' }),
})

export const ErrorSchema = z
  .object({
    error: z.string(),
    details: z.unknown().optional(),
  })
  .openapi('Error')

export type Address = z.infer<typeof AddressSchema>
export type AddressInput = z.infer<typeof AddressInputSchema>
export type AddressPatch = z.infer<typeof AddressPatchSchema>
export type ListQuery = z.infer<typeof ListQuerySchema>
