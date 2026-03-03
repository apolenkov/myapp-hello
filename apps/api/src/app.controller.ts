import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common'
import { ApiOperation, ApiResponse } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'

import { AppService } from './app.service'
import { Public } from './auth/public.decorator'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @Version(VERSION_NEUTRAL)
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async getHealth(): Promise<{ status: string; db?: string }> {
    return this.appService.getHealth()
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Hello World with system info' })
  @ApiResponse({ status: 200, description: 'Hello World response with environment details' })
  async getHello(): Promise<{
    message: string
    app: string
    timestamp: string
    env?: string
    db?: string
  }> {
    return this.appService.getHello()
  }
}
