import { Module } from '@nestjs/common';
import { MortgagesService } from './mortgages.service';
import { MortgagesController } from './mortgages.controller';

@Module({
  providers: [MortgagesService],
  controllers: [MortgagesController],
  exports: [MortgagesService],
})
export class MortgagesModule {}
