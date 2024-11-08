import { PrismaClient } from '@prisma/client';
import { connectToMongoDB } from './config/mongo';

const prisma = new PrismaClient();

async function main() {
  await connectToMongoDB();
  console.log('Connected to both MySQL and MongoDB');
}

main().catch(console.error);

export default prisma;
