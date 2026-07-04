import { Module } from '@nestjs/common';
import { LeadService } from './lead.service';
import { LeadController } from './lead.controller';

@Module({
  providers: [LeadService],
  controllers: [LeadController],
  exports: [LeadService],
})
export class LeadsModule {}
