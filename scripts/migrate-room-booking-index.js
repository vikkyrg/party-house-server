require('dotenv').config();
const mongoose = require('mongoose');
const Booking = require('../src/models/Booking');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const indexes = await Booking.collection.indexes();
  const legacy = indexes.find((index) => index.name === 'theater_1_date_1_timeSlot_1');
  if (legacy) {
    await Booking.collection.dropIndex(legacy.name);
    console.log(`Dropped legacy booking index: ${legacy.name}`);
  } else {
    console.log('Legacy theater booking index was not found.');
  }
  await Booking.syncIndexes();
  await mongoose.disconnect();
  console.log('Room booking indexes are ready.');
}

migrate().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
