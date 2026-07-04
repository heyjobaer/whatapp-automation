import { Module, DynamicModule, Type } from '@nestjs/common';
import { Webhook } from './entities/webhook.entity';
import { WebhookDeliveryFailure } from './entities/webhook-delivery-failure.entity';
import { WebhookService } from './webhook.service';
// Controllers temporarily disabled (kept in code) — the /webhooks HTTP endpoints are removed, but
// WebhookService stays exported so SessionModule / AgentToolsModule keep dispatching webhooks.
// import { WebhookController } from './webhook.controller';
// import { WebhooksListController } from './webhooks-list.controller';
import { EngineModule } from '../../engine/engine.module';

// Only import QueueModule if explicitly enabled to avoid Redis connection errors
const queueModules: Array<Type | DynamicModule> = [];
if (process.env.QUEUE_ENABLED === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const queueModule = require('../queue/queue.module') as {
    QueueModule: Type;
  };
  queueModules.push(queueModule.QueueModule);
}

@Module({
  imports: [EngineModule, ...queueModules],
  controllers: [/* WebhookController, WebhooksListController — temporarily disabled */],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhookModule {}
