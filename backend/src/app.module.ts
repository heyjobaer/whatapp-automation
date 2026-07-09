import { Module, DynamicModule, Type } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { SessionModule } from './modules/session/session.module';
import { MessageModule } from './modules/message/message.module';
import { MortgagesModule } from './modules/mortgages/mortgages.module';
import { LeadsModule } from './modules/leads/leads.module';
// Temporarily disabled (kept in code). Template/Webhook are still wired internally via
// MessageModule / SessionModule / AgentToolsModule; their HTTP controllers are commented out in
// their own module files, so no /templates or /webhooks endpoints are exposed.
// import { TemplateModule } from './modules/template/template.module';
// import { WebhookModule } from './modules/webhook/webhook.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { EngineModule } from './engine/engine.module';
import { LoggerModule } from './modules/shared/logger.module';
import { SettingsModule } from './modules/settings/settings.module';
// Temporarily disabled (kept in code, not registered — removes the /infra endpoints).
// import { InfraModule } from './modules/infra/infra.module';
import { EventsModule } from './modules/events/events.module';
import { ContactModule } from './modules/contact/contact.module';
import { GroupModule } from './modules/group/group.module';
import { LabelModule } from './modules/label/label.module';
import { ChannelModule } from './modules/channel/channel.module';
import { StorageModule } from './common/storage/storage.module';
import { StatsModule } from './modules/stats/stats.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { StatusModule } from './modules/status/status.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { HooksModule } from './core/hooks';
import { PluginsModule } from './core/plugins';
// Plugins management API disabled. Kept for reference — re-enable by uncommenting this import
// and its entry in the imports array below. (The core PluginsModule above must stay: the WhatsApp
// engines are loaded through its PluginLoaderService.)
// import { PluginsApiModule } from './modules/plugins/plugins.module';
import { AgentToolsModule } from './core/agent-tools/agent-tools.module';
import { DatabaseModule } from './modules/database/database.module';
import { CacheModule } from './modules/cache/cache.module';

// Only import QueueModule if explicitly enabled to avoid Redis connection errors
const queueModules: Array<Type | DynamicModule> = [];
if (process.env.QUEUE_ENABLED === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const queueModule = require('./modules/queue/queue.module') as {
    QueueModule: Type;
  };
  queueModules.push(queueModule.QueueModule);
}

// Serve the bundled dashboard SPA from this same NestJS process/port when a build is
// present (the production image copies dashboard/dist in). In local dev the build is
// absent, so this stays inert and the Vite dev server (:2886) handles the UI. Opt out
// explicitly with SERVE_DASHBOARD=false. The path + flags are exported so main.ts can
// log a clear status line (served / disabled / build missing) at startup.
// The dashboard is an Angular app (../frontend), built to frontend/dist/dashboard-ng/browser.
// __dirname is the compiled backend dist/ dir; depending on the layout the frontend build sits
// either as a sibling of the backend (local dev: backend/ + frontend/) or copied alongside the
// backend inside the production image. Probe the known locations and use the first that actually
// contains a built index.html; the last two entries keep pre-split / legacy checkouts serving a UI.
const DASHBOARD_DIST_CANDIDATES = [
  path.resolve(__dirname, '..', '..', 'frontend', 'dist', 'dashboard-ng', 'browser'), // local dev: backend/ & frontend/ are siblings
  path.resolve(__dirname, '..', 'frontend', 'dist', 'dashboard-ng', 'browser'), // prod image: frontend/ copied under the app root
  path.resolve(__dirname, '..', 'dashboard-ng', 'dist', 'dashboard-ng', 'browser'), // legacy pre-split monorepo layout
  path.resolve(__dirname, '..', 'dashboard', 'dist'), // legacy React build
];
export const DASHBOARD_DIST =
  DASHBOARD_DIST_CANDIDATES.find((p) => fs.existsSync(path.join(p, 'index.html'))) ?? DASHBOARD_DIST_CANDIDATES[0];
export const dashboardServingEnabled = process.env.SERVE_DASHBOARD !== 'false';
export const dashboardBuildPresent = fs.existsSync(path.join(DASHBOARD_DIST, 'index.html'));

const serveStaticModules: Array<Type | DynamicModule> = [];
if (dashboardServingEnabled && dashboardBuildPresent) {
  serveStaticModules.push(
    ServeStaticModule.forRoot({
      rootPath: DASHBOARD_DIST,
      exclude: ['/api/{*splat}', '/socket.io/{*splat}'],
    }),
  );
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),

    DatabaseModule,

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: configService.get<number>('api.rateLimit.shortTtl', 1000),
            limit: configService.get<number>('api.rateLimit.shortLimit', 10),
          },
          {
            name: 'medium',
            ttl: configService.get<number>('api.rateLimit.mediumTtl', 60000),
            limit: configService.get<number>('api.rateLimit.mediumLimit', 100),
          },
          {
            name: 'long',
            ttl: configService.get<number>('api.rateLimit.longTtl', 3600000),
            limit: configService.get<number>('api.rateLimit.longLimit', 1000),
          },
        ],
      }),
    }),


    HooksModule,
    PluginsModule,
    LoggerModule,
    CacheModule,
    StorageModule,
    AuditModule,
    EventsModule,
    ...queueModules,
    AuthModule,
    EngineModule,
    SessionModule,
    MessageModule,
    MortgagesModule,
    LeadsModule,
    // Temporarily disabled (kept in code): Template/Webhook/Infra removed from the app module.
    // TemplateModule,
    // WebhookModule,
    HealthModule,
    SettingsModule,
    // InfraModule,
    ContactModule,
    GroupModule,
    LabelModule,
    ChannelModule,
    StatsModule,
    MetricsModule,
    StatusModule,
    CatalogModule,

    AgentToolsModule,
    ...serveStaticModules,
  ],
})
export class AppModule { }
