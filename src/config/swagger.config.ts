import { DocumentBuilder, OpenAPIObject } from '@nestjs/swagger';

/**
 * Security scheme name for the JWT bearer token, used both when defining the scheme and when applying
 * it as a global requirement so Swagger UI sends the Authorization header.
 */
export const BEARER_SECURITY_SCHEME = 'bearer';

/**
 * Builds the OpenAPI document configuration for the OpenWA API.
 */
export function createSwaggerConfig(): Omit<OpenAPIObject, 'paths'> {
  // Source the API version from package.json so it tracks releases automatically — no manual bump, no drift.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { version } = require('../../package.json') as { version: string };
  return (
    new DocumentBuilder()
      .setTitle('OpenWA API')
      .setDescription('Open Source WhatsApp API Gateway - Free, Self-Hosted HTTP API')
      .setVersion(version)
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_SECURITY_SCHEME)
      // Apply the scheme globally so Swagger UI sends the token with every request
      // (mirrors the global JwtAuthGuard). Without this, "Authorize" is cosmetic.
      .addSecurityRequirements(BEARER_SECURITY_SCHEME)
      .addTag('sessions', 'WhatsApp session management')
      .addTag('messages', 'Send and manage messages')
      .addTag('webhooks', 'Webhook configuration')
      .addTag('contacts', 'Contact management')
      .addTag('groups', 'Group management')
      .addTag('labels', 'Label management (WhatsApp Business)')
      .addTag('channels', 'Channel/Newsletter management')
      .addTag('health', 'Health check endpoints')
      .build()
  );
}
