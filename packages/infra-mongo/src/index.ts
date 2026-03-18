import { MongoClient } from 'mongodb'

const mongoHost = process.env.MONGO_HOST || '127.0.0.1'
const mongoPort = process.env.MONGO_PORT || '27017'
const uri = process.env.MONGO_URI || `mongodb://${mongoHost}:${mongoPort}`
const mongoClient = new MongoClient(uri)

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
