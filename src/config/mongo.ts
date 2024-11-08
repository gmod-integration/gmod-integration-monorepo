import { MongoClient } from 'mongodb';

const uri = 'mongodb://localhost:27017';
const mongoClient = new MongoClient(uri);

async function connectToMongoDB() {
  try {
    await mongoClient.connect();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

export { mongoClient, connectToMongoDB };
