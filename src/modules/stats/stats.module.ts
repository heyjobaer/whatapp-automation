import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { Session } from '../session/entities/session.entity';
import { Message } from '../message/entities/message.entity';

@Module({
  imports: [],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
