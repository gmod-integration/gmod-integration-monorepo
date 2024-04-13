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
    multipleStatements: true
}

export const serverConfig = {
    production: process.env.PRODUCTION,
    bodyLimit: '10mb',
    domain: process.env.DOMAIN_URL,
    internWebsocketToken: process.env.INTERN_WEBSOCKET_TOKEN,
    ports: {
        website: process.env.PORT_WEBSITE || 53134,
        panel: 53135,
        api: process.env.PORT_API || 53136,
        verify: 53137,
        websocket: 53139
    }
}

export const discordConfig = {
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    botToken: process.env.DISCORD_BOT_TOKEN,
    oauth: process.env.OAUTH_VERIF_URL,
    invite: process.env.DISCORD_BOT_INVITE_URL
}

export const steamConfig = {
    apiKey: process.env.STEAM_API_KEY
}

export const gmodStoreConfig = {
    apiKey: process.env.GMODSTORE_API_KEY,
    signingSecretKey: process.env.SIGNING_SECRET_WEBHOOK
}