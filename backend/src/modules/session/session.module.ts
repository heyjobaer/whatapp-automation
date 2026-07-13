import { Module } from '@nestjs/common';
import { Session } from './entities/session.entity';
import { Message } from '../message/entities/message.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { WebhookModule } from '../webhook/webhook.module';
import { AiModule } from '../ai/ai.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  // WebhookModule does not import SessionModule back, so the dependency is one-directional —
  // no forwardRef() needed. AiModule provides the auto-reply generator used in onMessage;
  // LeadsModule provides LeadService for the per-chat AI on/off toggle.
  imports: [WebhookModule, AiModule, LeadsModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
