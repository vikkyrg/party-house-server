require('dotenv').config();
const mongoose = require('mongoose');
const Room = require('./src/models/Room');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  try {
    const result = await Room.updateMany({}, { $unset: { couple: 1 } });
    console.log('Unset couple on all rooms', result);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
});
