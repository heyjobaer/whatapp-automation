import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { WebhookResponseDto } from './dto';
import { WebhookDeliveryFailure } from './entities/webhook-delivery-failure.entity';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/entities/role.entity';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksListController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get('delivery-failures')
  @RequireRole(UserRole.ADMIN)
  @ApiOperation({ summary: 'List recently-failed webhook deliveries (all retries exhausted)' })
  @ApiResponse({ status: 200, description: 'Permanently-failed webhook deliveries, most recent first' })
  @ApiQuery({ name: 'sessionId', required: false, description: 'Filter to a single session' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max records to return (1-1000, default 1000)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of records to skip (for paging)' })
  async deliveryFailures(
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<WebhookDeliveryFailure[]> {
    return this.webhookService.listDeliveryFailures({
      sessionId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get()
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'List all webhooks' })
  @ApiResponse({
    status: 200,
    description: 'List of webhooks',
    type: [WebhookResponseDto],
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Max webhooks to return (1-1000, default 1000)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Number of webhooks to skip (for paging)' })
  async findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<WebhookResponseDto[]> {
    return WebhookResponseDto.fromEntities(
      await this.webhookService.findAll(null, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      }),
    );
  }
}
