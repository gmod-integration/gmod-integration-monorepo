import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { connectToMongoDB } from '@gmod/infra-mongo'

const adapter = new PrismaMariaDb({
  host: process.env.MARIA_HOST,
  user: process.env.MARIA_USER,
  password: process.env.MARIA_PASSWORD,
  database: process.env.MARIA_NAME,
  connectionLimit: parseInt(process.env.MARIA_CONNECTION_LIMIT || '50', 50),
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
