require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Room = require('../src/models/Room');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  const rooms = await Room.find({});
  for (let room of rooms) {
    let updated = false;
    if (!room.price2Hours && (room.weekdayPrice || room.weekendPrice || room.price)) {
      room.price2Hours = room.weekendPrice || room.weekdayPrice || room.price;
      updated = true;
    }
    // Set 1-hour and 3-hour prices to 0 if not set so they show "Price unavailable"
    if (room.price1Hour === undefined) { room.price1Hour = 0; updated = true; }
    if (room.price3Hours === undefined) { room.price3Hours = 0; updated = true; }
    
    if (updated) {
      await room.save();
      console.log(`Updated room: ${room.name}`);
    }
  }
  console.log('Migration complete');
  process.exit(0);
}
migrate();
