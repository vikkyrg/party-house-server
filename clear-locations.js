const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Location = require('./src/models/Location');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('Connected to MongoDB');
  await Location.deleteMany({});
  console.log('Cleared all locations');
  mongoose.disconnect();
}).catch(console.error);
