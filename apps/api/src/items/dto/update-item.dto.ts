import { ApiProperty } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateItemDto {
  @ApiProperty({ example: 'Updated title', required: false, minLength: 1, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string

  @ApiProperty({ example: 'Updated description', required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string

  @ApiProperty({ example: 'archived', required: false, enum: ['active', 'archived'] })
  @IsOptional()
  @IsEnum(['active', 'archived'] as const)
  status?: 'active' | 'archived'
}
