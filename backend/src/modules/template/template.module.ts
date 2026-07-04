import { Module } from '@nestjs/common';
import { Template } from './entities/template.entity';
import { TemplateService } from './template.service';
// Controller temporarily disabled (kept in code) — the /templates HTTP endpoints are removed, but
// TemplateService stays exported so MessageModule keeps sending templated messages.
// import { TemplateController } from './template.controller';

@Module({
  imports: [],
  controllers: [/* TemplateController — temporarily disabled */],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}
