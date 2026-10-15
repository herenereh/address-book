/// <reference types="bun" />
import { beforeEach, describe, expect, test } from 'bun:test'
import { createApp } from '../src/app'

let app: ReturnType<typeof createApp>

const base = {
  name: 'Jane Doe',
  street: '221B Baker Street',
  city: 'London',
  postalCode: 'NW1 6XE',
  country: 'United Kingdom',
}

const send = (method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })

const create = async (overrides: Record<string, unknown> = {}) => {
  const res = await send('POST', '/api/addresses', { ...base, ...overrides })
  expect(res.status).toBe(201)
  return res.json() as Promise<any>
}

const list = async (qs = '') => (await (await send('GET', `/api/addresses${qs}`)).json()) as any

beforeEach(() => {
  app = createApp()
})

describe('create and read', () => {
  test('creates an address with defaults', async () => {
    const a = await create()
    expect(a.id).toBeString()
    expect(a.favorite).toBe(false)
    expect(a.createdAt).toBe(a.updatedAt)
    const res = await send('GET', `/api/addresses/${a.id}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(a)
  })

  test('rejects missing required fields and bad email, naming the field', async () => {
    expect((await send('POST', '/api/addresses', { name: 'x' })).status).toBe(400)
    const res = await send('POST', '/api/addresses', { ...base, email: 'nope' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as any).error).toContain('email')
  })

  test('ignores unknown fields and treats empty optional strings as unset', async () => {
    const a = await create({ id: 'x', createdAt: 'y', foo: 1, email: '', phone: '  ' })
    expect(a.id).not.toBe('x')
    expect(a.foo).toBeUndefined()
    expect(a.email).toBeUndefined()
    expect(a.phone).toBeUndefined()
  })

  test('rejects malformed JSON', async () => {
    expect((await send('POST', '/api/addresses', '{bad')).status).toBe(400)
  })

  test('404 for unknown id', async () => {
    expect((await send('GET', '/api/addresses/missing')).status).toBe(404)
  })
})

describe('update, edit and delete', () => {
  test('PUT replaces and clears omitted optional fields', async () => {
    const a = await create({ phone: '123', notes: 'hi' })
    const res = await send('PUT', `/api/addresses/${a.id}`, { ...base, city: 'Paris' })
    expect(res.status).toBe(200)
    const b = (await res.json()) as any
    expect(b.city).toBe('Paris')
    expect(b.phone).toBeUndefined()
    expect(b.createdAt).toBe(a.createdAt)
  })

  test('PATCH changes only sent fields', async () => {
    const a = await create({ phone: '123' })
    const b = (await (await send('PATCH', `/api/addresses/${a.id}`, { city: 'Berlin' })).json()) as any
    expect(b).toMatchObject({ city: 'Berlin', phone: '123', name: 'Jane Doe' })
  })

  test('PATCH rejects an empty body', async () => {
    const a = await create()
    expect((await send('PATCH', `/api/addresses/${a.id}`, {})).status).toBe(400)
    expect((await send('PATCH', `/api/addresses/${a.id}`, { foo: 1 })).status).toBe(400)
  })

  test('PATCH with an empty string clears an optional field', async () => {
    const a = await create({ phone: '123' })
    const b = (await (await send('PATCH', `/api/addresses/${a.id}`, { phone: '' })).json()) as any
    expect(b.phone).toBeUndefined()
    expect(b.name).toBe('Jane Doe')
  })

  test('DELETE removes the address', async () => {
    const a = await create()
    expect((await send('DELETE', `/api/addresses/${a.id}`)).status).toBe(204)
    expect((await send('GET', `/api/addresses/${a.id}`)).status).toBe(404)
    expect((await send('DELETE', `/api/addresses/${a.id}`)).status).toBe(404)
  })
})

describe('favorites', () => {
  test('favorite and unfavorite', async () => {
    const a = await create()
    expect(((await (await send('PUT', `/api/addresses/${a.id}/favorite`)).json()) as any).favorite).toBe(true)
    expect((await list('?favorite=true')).total).toBe(1)
    expect(((await (await send('DELETE', `/api/addresses/${a.id}/favorite`)).json()) as any).favorite).toBe(false)
    expect((await list('?favorite=true')).total).toBe(0)
    expect((await send('PUT', '/api/addresses/missing/favorite')).status).toBe(404)
  })
})

describe('search, sort and paginate', () => {
  beforeEach(async () => {
    await create({ name: 'charlie', city: 'Ankara', country: 'Turkey' })
    await create({ name: 'Alice', city: 'Berlin', country: 'Germany', email: 'alice@example.com' })
    await create({ name: 'bob', city: 'Cairo', country: 'Egypt', favorite: true })
  })

  test('search is case-insensitive across fields', async () => {
    expect((await list('?q=BERLIN')).data.map((a: any) => a.name)).toEqual(['Alice'])
    expect((await list('?q=example.com')).total).toBe(1)
    expect((await list('?q=zzz')).total).toBe(0)
  })

  test('sorts by name case-insensitively, both directions', async () => {
    expect((await list()).data.map((a: any) => a.name)).toEqual(['Alice', 'bob', 'charlie'])
    expect((await list('?order=desc')).data.map((a: any) => a.name)).toEqual(['charlie', 'bob', 'Alice'])
    expect((await list('?sortBy=country')).data.map((a: any) => a.country)).toEqual(['Egypt', 'Germany', 'Turkey'])
  })

  test('favoritesFirst puts favorites on top', async () => {
    expect((await list('?favoritesFirst=true')).data.map((a: any) => a.name)).toEqual(['bob', 'Alice', 'charlie'])
  })

  test('paginates', async () => {
    const page = await list('?limit=2&page=2')
    expect(page).toMatchObject({ total: 3, page: 2, limit: 2 })
    expect(page.data.map((a: any) => a.name)).toEqual(['charlie'])
  })

  test('rejects invalid query values', async () => {
    expect((await send('GET', '/api/addresses?sortBy=foo')).status).toBe(400)
    expect((await send('GET', '/api/addresses?limit=1000')).status).toBe(400)
  })
})

describe('docs', () => {
  test('serves OpenAPI spec and Swagger UI', async () => {
    const spec = (await (await send('GET', '/openapi.json')).json()) as any
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/api/addresses', '/api/addresses/{id}', '/api/addresses/{id}/favorite']),
    )
    const ui = await send('GET', '/docs')
    expect(ui.status).toBe(200)
    expect(await ui.text()).toContain('swagger')
  })
})
