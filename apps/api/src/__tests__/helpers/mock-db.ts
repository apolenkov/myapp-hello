import { randomUUID } from 'node:crypto'

import { vi } from 'vitest'

interface StoredUser {
  id: string
  username: string
  password_hash: string
  created_at: Date
}

interface StoredItem {
  id: string
  user_id: string
  title: string
  description: string | null
  status: string
  created_at: Date
  updated_at: Date
}

interface QueryResult {
  rows: unknown[]
  rowCount: number
}

const STATUS_DELETED = 'deleted'
const EMPTY: QueryResult = { rows: [], rowCount: 0 }
const one = (row: unknown): QueryResult => ({ rows: [row], rowCount: 1 })
const maybe = (row: unknown): QueryResult => (row ? one(row) : EMPTY)

const findActive = (items: StoredItem[], id: string, userId: string): StoredItem | undefined =>
  items.find((i) => i.id === id && i.user_id === userId && i.status !== STATUS_DELETED)

function handleUserQuery(
  sql: string,
  params: unknown[] | undefined,
  users: StoredUser[],
): QueryResult | null {
  if (sql.includes('INSERT INTO users')) {
    const username = params?.[0] as string
    if (users.find((u) => u.username === username)) {
      throw new Error('duplicate key value violates unique constraint')
    }
    const user: StoredUser = {
      id: randomUUID(),
      username,
      password_hash: params?.[1] as string,
      created_at: new Date(),
    }
    users.push(user)
    return one({ id: user.id, username: user.username })
  }

  if (sql.includes('SELECT') && sql.includes('FROM users')) {
    const user = users.find((u) => u.username === (params?.[0] as string))
    return maybe(user)
  }

  return null
}

function handleItemInsert(params: unknown[] | undefined, items: StoredItem[]): QueryResult {
  const item: StoredItem = {
    id: randomUUID(),
    user_id: params?.[0] as string,
    title: params?.[1] as string,
    description: (params?.[2] as string | null) ?? null,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  }
  items.push(item)
  return one(item)
}

function handleItemSoftDelete(params: unknown[] | undefined, items: StoredItem[]): QueryResult {
  const item = findActive(items, params?.[0] as string, params?.[1] as string)
  if (!item) return EMPTY
  item.status = STATUS_DELETED
  item.updated_at = new Date()
  return one(item)
}

function handleItemList(params: unknown[] | undefined, items: StoredItem[]): QueryResult {
  const userId = params?.[0] as string
  const userItems = items.filter((i) => i.user_id === userId && i.status !== STATUS_DELETED)
  const page = userItems.slice(
    params?.[2] as number,
    (params?.[2] as number) + (params?.[1] as number),
  )
  return {
    rows: page.map((i) => ({ ...i, full_count: String(userItems.length) })),
    rowCount: page.length,
  }
}

function handleItemQuery(
  sql: string,
  params: unknown[] | undefined,
  items: StoredItem[],
): QueryResult | null {
  if (sql.includes('INSERT INTO items')) return handleItemInsert(params, items)
  if (sql.includes("status = 'deleted'") && sql.includes('UPDATE'))
    return handleItemSoftDelete(params, items)

  if (sql.includes('UPDATE items') && sql.includes('RETURNING')) {
    const item = findActive(items, params?.[0] as string, params?.[1] as string)
    if (!item) return EMPTY
    item.updated_at = new Date()
    return one(item)
  }

  if (sql.includes('FROM items') && sql.includes('OVER()')) return handleItemList(params, items)

  if (sql.includes('FROM items') && sql.includes('WHERE id')) {
    return maybe(findActive(items, params?.[0] as string, params?.[1] as string))
  }

  return null
}

/** Create a mock query function simulating users + items tables in memory. */
export function createFullMockQuery(): ReturnType<typeof vi.fn> {
  const users: StoredUser[] = []
  const items: StoredItem[] = []

  return vi.fn().mockImplementation((sql: string, params?: unknown[]) => {
    return handleUserQuery(sql, params, users) ?? handleItemQuery(sql, params, items) ?? EMPTY
  })
}
