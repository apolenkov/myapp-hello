import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'

import { CurrentUser } from '../auth/current-user.decorator'
import type { JwtPayload } from '../auth/request-with-user'
import { CreateItemDto } from './dto/create-item.dto'
import { UpdateItemDto } from './dto/update-item.dto'
import { DEFAULT_LIMIT, DEFAULT_PAGE, ITEM_NOT_FOUND, MAX_LIMIT } from './items.constants'
import { ItemsService } from './items.service'
import type { Item, PaginatedItems } from './items.types'

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: 201, description: 'Item created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateItemDto): Promise<Item> {
    return this.items.create(user.sub, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List items with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated list of items' })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(DEFAULT_PAGE), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(DEFAULT_LIMIT), ParseIntPipe) limit: number,
  ): Promise<PaginatedItems> {
    const safePage = Math.max(1, page)
    const safeLimit = Math.min(MAX_LIMIT, Math.max(1, limit))
    return this.items.findAll(user.sub, safePage, safeLimit)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single item by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Item found' })
  @ApiResponse({ status: 404, description: ITEM_NOT_FOUND })
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Item> {
    return this.items.findOne(user.sub, id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an item' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Item updated' })
  @ApiResponse({ status: 404, description: ITEM_NOT_FOUND })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
  ): Promise<Item> {
    return this.items.update(user.sub, id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an item' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Item deleted' })
  @ApiResponse({ status: 404, description: ITEM_NOT_FOUND })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Item> {
    return this.items.remove(user.sub, id)
  }
}
