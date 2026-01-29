import { PrismaClient } from '../../prisma/generated/prisma/client.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { connectToMongoDB } from '../mongo/index.js';

const adapter = new PrismaMariaDb({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  await connectToMongoDB();
  console.log('Connected to MySQL');
  await prisma.$connect();
  console.log('Prisma Client connected');
}

main().catch(console.error);

export default prisma;

export async function gracefulShutdownPrisma() {
  await prisma.$disconnect();
}
