import { ApiProperty } from '@nestjs/swagger'
import { IsString } from 'class-validator'

export class LoginDto {
  @ApiProperty({ example: 'johndoe' })
  @IsString()
  username!: string

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  password!: string
}
