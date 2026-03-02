export type ItemStatus = 'active' | 'archived' | 'deleted'

export interface Item {
  id: string
  userId: string
  title: string
  description: string | null
  status: ItemStatus
  createdAt: Date
  updatedAt: Date
}

export interface PaginatedItems {
  data: Item[]
  total: number
  page: number
  limit: number
}
