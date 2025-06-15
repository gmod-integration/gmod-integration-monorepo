import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const ConfigSchema = z.object({
  DEV: z.enum(['true', 'false']),
  SENTRY_DSN: z.string().url().optional(),
  SCREENSHOTS_CHANNEL_ID: z.string(),

  WEBSITE_URL: z.string().url(),
  DOMAIN_URL: z.string().url(),

  DISCORD_CLIENT_ID: z.string(),
  DISCORD_CLIENT_SECRET: z.string(),
  DISCORD_GUILD_ID: z.string(),
  DISCORD_BOT_TOKEN: z.string(),
  DISCORD_BOT_INVITE_URL: z.string().url(),

  OAUTH_PANEL_URL: z.string().url(),
  OAUTH_REDIRECT_URL: z.string().url(),
  BARER_DISCORD_RELAY: z.string(),

  DISCORD_GUILD_PREMIUM_ROLE_ID: z.string(),
  DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID: z.string(),
  DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID: z.string(),
  DISCORD_SUBSCRIPTION_SKU_ID: z.string(),

  STEAM_API_KEY: z.string(),

  GMODSTORE_API_KEY: z.string(),
  SIGNING_SECRET_WEBHOOK: z.string(),
  GMODSTORE_SECRET_WEBHOOK: z.string(),
});

export type ConfigInput = z.infer<typeof ConfigSchema>;
