import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import {
  AddressInputSchema,
  AddressListSchema,
  AddressPatchSchema,
  AddressSchema,
  ErrorSchema,
  IdParamSchema,
  ListQuerySchema,
} from './schemas'
import { AddressStore } from './store'

const TAG = 'Addresses'

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
})

const notFound = json(ErrorSchema, 'Address not found')
const badRequest = json(ErrorSchema, 'Validation error')

const listRoute = createRoute({
  method: 'get',
  path: '/api/addresses',
  tags: [TAG],
  summary: 'List, search, filter and sort addresses',
  request: { query: ListQuerySchema },
  responses: { 200: json(AddressListSchema, 'Paginated addresses'), 400: badRequest },
})

const getRoute = createRoute({
  method: 'get',
  path: '/api/addresses/{id}',
  tags: [TAG],
  summary: 'Get an address',
  request: { params: IdParamSchema },
  responses: { 200: json(AddressSchema, 'The address'), 404: notFound },
})

const createAddressRoute = createRoute({
  method: 'post',
  path: '/api/addresses',
  tags: [TAG],
  summary: 'Create an address',
  request: { body: { ...json(AddressInputSchema, 'New address'), required: true } },
  responses: { 201: json(AddressSchema, 'Created'), 400: badRequest },
})

const replaceRoute = createRoute({
  method: 'put',
  path: '/api/addresses/{id}',
  tags: [TAG],
  summary: 'Update an address (full replacement)',
  description: 'Replaces every field. Optional fields that are omitted are cleared.',
  request: { params: IdParamSchema, body: { ...json(AddressInputSchema, 'Replacement address'), required: true } },
  responses: { 200: json(AddressSchema, 'Updated'), 400: badRequest, 404: notFound },
})

const patchRoute = createRoute({
  method: 'patch',
  path: '/api/addresses/{id}',
  tags: [TAG],
  summary: 'Edit an address (partial update)',
  description: 'Only the fields sent are changed.',
  request: { params: IdParamSchema, body: { ...json(AddressPatchSchema, 'Fields to change'), required: true } },
  responses: { 200: json(AddressSchema, 'Updated'), 400: badRequest, 404: notFound },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/api/addresses/{id}',
  tags: [TAG],
  summary: 'Delete an address',
  request: { params: IdParamSchema },
  responses: { 204: { description: 'Deleted' }, 404: notFound },
})

const favoriteRoute = createRoute({
  method: 'put',
  path: '/api/addresses/{id}/favorite',
  tags: [TAG],
  summary: 'Mark an address as favorite',
  request: { params: IdParamSchema },
  responses: { 200: json(AddressSchema, 'Favorited'), 404: notFound },
})

const unfavoriteRoute = createRoute({
  method: 'delete',
  path: '/api/addresses/{id}/favorite',
  tags: [TAG],
  summary: 'Remove an address from favorites',
  request: { params: IdParamSchema },
  responses: { 200: json(AddressSchema, 'Unfavorited'), 404: notFound },
})

export function createApp(store = new AddressStore()) {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        const details = result.error.issues.map((i) => ({ field: i.path.join('.') || null, message: i.message }))
        const summary = details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('; ')
        return c.json({ error: `Validation failed: ${summary}`, details }, 400)
      }
    },
  })

  app.use('/api/*', cors())

  const missing = { error: 'Address not found' } as const

  app.openapi(listRoute, (c) => {
    const query = c.req.valid('query')
    return c.json({ ...store.list(query), page: query.page, limit: query.limit }, 200)
  })

  app.openapi(getRoute, (c) => {
    const address = store.get(c.req.valid('param').id)
    return address ? c.json(address, 200) : c.json(missing, 404)
  })

  app.openapi(createAddressRoute, (c) => {
    const address = store.create(c.req.valid('json'))
    return c.json(address, 201, { Location: `/api/addresses/${address.id}` })
  })

  app.openapi(replaceRoute, (c) => {
    const address = store.replace(c.req.valid('param').id, c.req.valid('json'))
    return address ? c.json(address, 200) : c.json(missing, 404)
  })

  app.openapi(patchRoute, (c) => {
    const address = store.patch(c.req.valid('param').id, c.req.valid('json'))
    return address ? c.json(address, 200) : c.json(missing, 404)
  })

  app.openapi(deleteRoute, (c) => {
    return store.delete(c.req.valid('param').id) ? c.body(null, 204) : c.json(missing, 404)
  })

  app.openapi(favoriteRoute, (c) => {
    const address = store.patch(c.req.valid('param').id, { favorite: true })
    return address ? c.json(address, 200) : c.json(missing, 404)
  })

  app.openapi(unfavoriteRoute, (c) => {
    const address = store.patch(c.req.valid('param').id, { favorite: false })
    return address ? c.json(address, 200) : c.json(missing, 404)
  })

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Address Book API',
      version: '1.0.0',
      description: 'Create, edit, update, delete, search, sort and favorite addresses. Data is held in memory only.',
    },
  })

  app.get('/docs', swaggerUI({ url: '/openapi.json' }))
  app.get('/', (c) => c.redirect('/docs'))

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}
