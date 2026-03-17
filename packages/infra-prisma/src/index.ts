import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { connectToMongoDB } from '@gmod/infra-mongo'

const adapter = new PrismaMariaDb({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 50,
})

const prisma = new PrismaClient({ adapter })

async function main() {
  await connectToMongoDB()
  await prisma.$connect()
  console.log('Prisma Client connected')
}

main().catch(console.error)

export default prisma

export async function gracefulShutdownPrisma() {
  await prisma.$disconnect()
}
