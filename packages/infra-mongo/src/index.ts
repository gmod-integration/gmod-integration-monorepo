import { MongoClient } from 'mongodb'
import { getMongoConfig } from '@gmod/config/infrastructure.js'

const mongoClient = new MongoClient(getMongoConfig().uri)

async function connectToMongoDB() {
  try {
    await mongoClient.connect()
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

export { mongoClient, connectToMongoDB }
