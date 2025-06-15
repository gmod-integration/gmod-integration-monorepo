import { PrismaClient } from '@prisma/client';
import { connectToMongoDB } from '../mongo/index.js';

const index = new PrismaClient();

async function main() {
  await connectToMongoDB();
  console.log('Connected to both MySQL and MongoDB');
}

main().catch(console.error);

export default index;

export async function gracefulShutdownPrisma() {
  await index.$disconnect();
}
