import { Client, GatewayIntentBits, Partials } from 'discord.js';

async function testLogin(token: string) {
  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });

    await client.login(token);
    await client.destroy();
    process.exit(0);
  } catch (error) {
    console.error('Login failed:', error);
    process.exit(1);
  }
}

process.on('message', async (token: string) => {
  await testLogin(token);
});
