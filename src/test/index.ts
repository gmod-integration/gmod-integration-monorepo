// Test Data Seeding
import prisma from '../services/prisma/index.js';
import { v4 } from 'uuid';
import testData from './config.test.js';

async function seedDatabase() {
  console.log('🌱 Starting seed...');

  // Clean up existing data
  console.log('🗑️  Cleaning up existing test data...');
  await prisma.gm_panelToken.deleteMany({
    where: { discordID: testData.user.discordID },
  });
  await prisma.gm_server.deleteMany({
    where: { id: testData.server.id },
  });
  await prisma.gm_guild.deleteMany({
    where: { guild: testData.guild.id },
  });

  // Create guild
  console.log('📋 Creating test guild...');
  const guild = await prisma.gm_guild.create({
    data: {
      guild: testData.guild.id,
      name: 'Test Guild',
      language: 'en',
      member: 10,
    },
  });
  console.log('✅ Guild created:', guild);

  // Create server linked to guild
  console.log('🖥️  Creating test server...');
  const server = await prisma.gm_server.create({
    data: {
      id: testData.server.id,
      token: testData.server.token,
      guild: testData.guild.id,
      name: 'Test Gmod Server',
      ip: '127.0.0.1',
      port: '27015',
      verified: true,
      isPublic: true,
    },
  });
  console.log('✅ Server created:', server);

  // Create panel token for test user
  console.log('🔑 Creating test panel token...');
  const panelToken = await prisma.gm_panelToken.create({
    data: {
      id: v4(),
      discordID: testData.user.discordID,
      accessToken: 'test-token-' + v4(),
      os: 'Linux',
      ip: '127.0.0.1',
      country: 'FR',
      browser: 'Test Browser',
    },
  });
  console.log('✅ Panel token created:', panelToken);

  console.log('✨ Seed completed successfully!');
  console.log(`
📊 Test Configuration:
  - Guild: ${testData.guild.id}
  - Server: ${testData.server.id}
  - User Discord ID: ${testData.user.discordID}
  - User Steam ID: ${testData.user.steamID}
  - Panel Token: ${panelToken.accessToken}
  `);
}

// Seed and then run tests
await seedDatabase();

// Testing - only run after seed is complete
import('./api/mainController.test.js');
import('./api/serverController.test.js');
import('./api/userController.test.js');
