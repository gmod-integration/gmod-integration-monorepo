import { PrismaClient } from '@prisma/client';
import { connectToMongoDB } from '../../config/mongo.js';

const prisma = new PrismaClient();

async function main() {
  await connectToMongoDB();
  console.log('Connected to both MySQL and MongoDB');
}

main().catch(console.error);

export default prisma;

export async function gracefulShutdownPrisma() {
  await prisma.$disconnect();
}
