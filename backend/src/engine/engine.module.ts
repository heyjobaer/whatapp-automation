import { Global, Module } from '@nestjs/common';
import { EngineFactory } from './engine.factory';
import { BaileysStoredMessage } from './adapters/baileys-stored-message.entity';
import { BaileysMessageStoreService } from './adapters/baileys-message-store.service';
import { LidMapping } from './identity/lid-mapping.entity';
import { LidMappingStoreService } from './identity/lid-mapping-store.service';

@Global()
@Module({
  imports: [],
  providers: [EngineFactory, BaileysMessageStoreService, LidMappingStoreService],
  exports: [EngineFactory, LidMappingStoreService],
})
export class EngineModule {}
