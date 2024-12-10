import dotenv from 'dotenv';

dotenv.config();

export const serverConfig = {
  dev: process.env.DEV,
  bodyLimit: '10mb',
  sentryDSN: process.env.SENTRY_DSN,
  domain: process.env.DOMAIN_URL,
  screenshotChannel: process.env.SCREENSHOTS_CHANNEL_ID,
  internWebsocketToken: process.env.INTERN_WEBSOCKET_TOKEN,
  websiteUrl: process.env.WEBSITE_URL,
  ports: {
    website: 53134,
    panel: 53135,
    api: 53136,
    verify: 53137,
    websocket: 53139,
  },
  version: 'v0.4.7',
};

export const discordConfig = {
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  guildID: process.env.DISCORD_GUILD_ID,
  botToken: process.env.DISCORD_BOT_TOKEN,
  oauthPanel: process.env.OAUTH_PANEL_URL,
  oauthPanelRedirect: process.env.OAUTH_REDIRECT_URL,
  invite: process.env.DISCORD_BOT_INVITE_URL,
  barerTokenRelay: process.env.BARER_DISCORD_RELAY,
  premiumRoleID: process.env.DISCORD_GUILD_PREMIUM_ROLE_ID,
  gmodStorePremiumRoleID: process.env.DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID,
  discordPremiumRoleID: process.env.DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID,
  subscriptionSKUID: process.env.DISCORD_SUBSCRIPTION_SKU_ID,
};

export const steamConfig = {
  apiKey: process.env.STEAM_API_KEY,
};

export const gmodStoreConfig = {
  apiKey: process.env.GMODSTORE_API_KEY,
  signingSecretKey: process.env.SIGNING_SECRET_WEBHOOK,
  secretWebhook: process.env.GMODSTORE_SECRET_WEBHOOK,
};
