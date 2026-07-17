const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    // Modern mongoose (8.x) doesn't need most legacy options, but these are
    // harmless and make intent explicit.
    serverSelectionTimeoutMS: 10000,
  });

  console.log(`[db] connected to MongoDB (${mongoose.connection.name})`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  return mongoose.connection;
}

module.exports = { connectDB, mongoose };
