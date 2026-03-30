import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'

const isDev = process.env.DEV === 'true'
const configuredConnectionLimit = Number.parseInt(process.env.MARIA_CONNECTION_LIMIT || (isDev ? '10' : '50'), 10)
const connectionLimit = isDev ? Math.min(configuredConnectionLimit, 10) : configuredConnectionLimit

const adapter = new PrismaMariaDb({
  host: process.env.MARIA_HOST,
  user: process.env.MARIA_USER,
  password: process.env.MARIA_PASSWORD,
  database: process.env.MARIA_NAME,
  connectionLimit,
})

const prisma = new PrismaClient({ adapter })
let connectPromise: Promise<void> | null = null

export async function connectPrisma() {
  if (!connectPromise) {
    connectPromise = prisma
      .$connect()
      .then(() => {
        console.log(`Prisma Client connected (connectionLimit=${connectionLimit})`)
      })
      .catch((error) => {
        connectPromise = null
        throw error
      })
  }

  await connectPromise
}

export default prisma

export async function gracefulShutdownPrisma() {
  connectPromise = null
  await prisma.$disconnect()
}
