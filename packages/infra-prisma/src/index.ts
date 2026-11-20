import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { getMariaDbConfig } from '@gmod/config/infrastructure.js'

const config = getMariaDbConfig()
const { connectionLimit } = config

const adapter = new PrismaMariaDb(config)

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
