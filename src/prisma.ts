import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// catch all unhandled errors
prisma.$on('error', (e) => {
  console.error(e);
});

export default prisma;
