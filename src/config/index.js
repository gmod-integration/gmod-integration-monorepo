import dotenv from 'dotenv';

dotenv.config();

export const databaseConfig = {
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: process.env.DATABASE_PORT,
  connectTimeout: 60000,
  charset: 'utf8mb4_unicode_ci',
  multipleStatements: true,
};

export const serverConfig = {
  production: process.env.PRODUCTION,
  bodyLimit: '10mb',
  sentryDSN: process.env.SENTRY_DSN,
  domain: process.env.DOMAIN_URL,
  internWebsocketToken: process.env.INTERN_WEBSOCKET_TOKEN,
  debug: process.env.DEBUG,
  websiteUrl: process.env.WEBSITE_URL,
  ports: {
    website: 53134,
    panel: 53135,
    api: 53136,
    verify: 53137,
    websocket: 53139,
  },
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
};

export const steamConfig = {
  apiKey: process.env.STEAM_API_KEY,
};

export const gmodStoreConfig = {
  apiKey: process.env.GMODSTORE_API_KEY,
  signingSecretKey: process.env.SIGNING_SECRET_WEBHOOK,
};
