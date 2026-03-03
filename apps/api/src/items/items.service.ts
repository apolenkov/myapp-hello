import { Injectable, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../database/database.service'
import type { CreateItemDto } from './dto/create-item.dto'
import type { UpdateItemDto } from './dto/update-item.dto'
import { ITEM_NOT_FOUND, ITEM_STATUS_DELETED } from './items.constants'
import type { Item, PaginatedItems } from './items.types'

interface ItemRow {
  id: string
  user_id: string
  title: string
  description: string | null
  status: string
  created_at: Date
  updated_at: Date
  full_count?: string
}

const toItem = (row: ItemRow): Item => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description,
  status: row.status as Item['status'],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

@Injectable()
export class ItemsService {
  constructor(private readonly db: DatabaseService) {}

  async create(userId: string, dto: CreateItemDto): Promise<Item> {
    const result = await this.db.query(
      `INSERT INTO items (user_id, title, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, dto.title, dto.description ?? null],
    )
    return toItem(result.rows[0] as ItemRow)
  }

  async findAll(userId: string, page: number, limit: number): Promise<PaginatedItems> {
    const offset = (page - 1) * limit
    const result = await this.db.query(
      `SELECT *, COUNT(*) OVER() AS full_count
       FROM items
       WHERE user_id = $1 AND status != '${ITEM_STATUS_DELETED}'
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    )
    const rows = result.rows as ItemRow[]
    const firstRow = rows[0]
    const total = firstRow ? parseInt(firstRow.full_count ?? '0', 10) : 0

    return {
      data: rows.map(toItem),
      total,
      page,
      limit,
    }
  }

  async findOne(userId: string, id: string): Promise<Item> {
    const result = await this.db.query(
      `SELECT * FROM items WHERE id = $1 AND user_id = $2 AND status != '${ITEM_STATUS_DELETED}'`,
      [id, userId],
    )
    const row = result.rows[0] as ItemRow | undefined
    if (!row) throw new NotFoundException(ITEM_NOT_FOUND)
    return toItem(row)
  }

  async update(userId: string, id: string, dto: UpdateItemDto): Promise<Item> {
    const fields: string[] = []
    const values: unknown[] = []
    const addField = (name: string, value: unknown): void => {
      values.push(value)
      fields.push(`${name} = $${String(values.length + 2)}`)
    }

    if (dto.title !== undefined) addField('title', dto.title)
    if (dto.description !== undefined) addField('description', dto.description)
    if (dto.status !== undefined) addField('status', dto.status)

    if (fields.length === 0) {
      return this.findOne(userId, id)
    }

    addField('updated_at', new Date())

    const result = await this.db.query(
      `UPDATE items SET ${fields.join(', ')}
       WHERE id = $1 AND user_id = $2 AND status != '${ITEM_STATUS_DELETED}'
       RETURNING *`,
      [id, userId, ...values],
    )
    const row = result.rows[0] as ItemRow | undefined
    if (!row) throw new NotFoundException(ITEM_NOT_FOUND)
    return toItem(row)
  }

  async remove(userId: string, id: string): Promise<Item> {
    const result = await this.db.query(
      `UPDATE items SET status = '${ITEM_STATUS_DELETED}', updated_at = $3
       WHERE id = $1 AND user_id = $2 AND status != '${ITEM_STATUS_DELETED}'
       RETURNING *`,
      [id, userId, new Date()],
    )
    const row = result.rows[0] as ItemRow | undefined
    if (!row) throw new NotFoundException(ITEM_NOT_FOUND)
    return toItem(row)
  }
}
