import type { Address, AddressInput, AddressPatch, ListQuery } from './schemas'

const SEARCH_FIELDS = ['name', 'email', 'phone', 'street', 'city', 'state', 'postalCode', 'country', 'notes'] as const

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export class AddressStore {
  private readonly items = new Map<string, Address>()

  list(query: ListQuery): { data: Address[]; total: number } {
    const needle = query.q?.toLowerCase()
    const matches = [...this.items.values()].filter((a) => {
      if (query.favorite !== undefined && a.favorite !== query.favorite) return false
      if (!needle) return true
      return SEARCH_FIELDS.some((f) => a[f]?.toLowerCase().includes(needle))
    })

    const dir = query.order === 'desc' ? -1 : 1
    matches.sort((a, b) => {
      if (query.favoritesFirst && a.favorite !== b.favorite) return a.favorite ? -1 : 1
      return dir * collator.compare(a[query.sortBy], b[query.sortBy])
    })

    const start = (query.page - 1) * query.limit
    return { data: matches.slice(start, start + query.limit), total: matches.length }
  }

  get(id: string): Address | undefined {
    return this.items.get(id)
  }

  create(input: AddressInput): Address {
    const now = new Date().toISOString()
    const address: Address = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
    this.items.set(address.id, address)
    return address
  }

  replace(id: string, input: AddressInput): Address | undefined {
    const existing = this.items.get(id)
    if (!existing) return undefined
    const address: Address = {
      ...input,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }
    this.items.set(id, address)
    return address
  }

  patch(id: string, patch: AddressPatch): Address | undefined {
    const existing = this.items.get(id)
    if (!existing) return undefined
    const address: Address = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    this.items.set(id, address)
    return address
  }

  delete(id: string): boolean {
    return this.items.delete(id)
  }
}
