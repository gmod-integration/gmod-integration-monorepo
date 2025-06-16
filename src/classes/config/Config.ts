import dotenv from 'dotenv';
import { ConfigInput, ConfigSchema } from '../../schemas/config/ConfigSchema.js';
import { ZodError } from 'zod';

dotenv.config();

let config: ConfigInput;

try {
  config = ConfigSchema.parse(process.env);
} catch (err) {
  if (err instanceof ZodError) {
    console.error('❌  Invalid environment variables:\n');

    for (const issue of err.errors) {
      console.error(`  → ${issue.path.join('.')} [${issue.code}]: ${issue.message}`);
    }

    console.error('\nFix the environment variables and try again.\n');
    process.exit(1);
  }

  throw err;
}

export { config };

export const ConfigServer = {
  dev: config.DEV === 'true',
  bodyLimit: '10mb',
  sentryDSN: config.SENTRY_DSN,
  domain: config.DOMAIN_URL,
  screenshotChannel: config.SCREENSHOTS_CHANNEL_ID,
  websiteUrl: config.WEBSITE_URL,
  ports: {
    website: 53134,
    panel: 53135,
    api: 53136,
    verify: 53137,
    websocket: 53139,
  },
  version: 'v0.4.9',
};

export const ConfigDiscord = {
  clientID: config.DISCORD_CLIENT_ID,
  clientSecret: config.DISCORD_CLIENT_SECRET,
  guildID: config.DISCORD_GUILD_ID,
  botToken: config.DISCORD_BOT_TOKEN,
  oauthPanel: config.OAUTH_PANEL_URL,
  oauthPanelRedirect: config.OAUTH_REDIRECT_URL,
  invite: config.DISCORD_BOT_INVITE_URL,
  barerTokenRelay: config.BARER_DISCORD_RELAY,
  premiumRoleID: config.DISCORD_GUILD_PREMIUM_ROLE_ID,
  gmodStorePremiumRoleID: config.DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID,
  discordPremiumRoleID: config.DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID,
  subscriptionSKUID: config.DISCORD_SUBSCRIPTION_SKU_ID,
  gmodIntegrationLogo: 'https://gmod-integration.com/src/assets/brand/logo.png',
  embedColor: 0x393a41,
};

export const ConfigSteam = {
  apiKey: config.STEAM_API_KEY,
};

export const ConfigGmodStore = {
  apiKey: config.GMODSTORE_API_KEY,
  signingSecretKey: config.SIGNING_SECRET_WEBHOOK,
  secretWebhook: config.GMODSTORE_SECRET_WEBHOOK,
};

export const ConfigMinIO = {
  endpoint: config.MINIO_ENDPOINT,
  accessKey: config.MINIO_ACCESS_KEY,
  secretKey: config.MINIO_SECRET_KEY,
  region: config.MINIO_REGION,
};
