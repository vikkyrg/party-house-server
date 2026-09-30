require('dotenv').config();
const mongoose = require('mongoose');
const Room = require('./src/models/Room');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const rooms = await Room.find().select('name location googleMapLink');
    console.log(rooms);
    mongoose.disconnect();
  })
  .catch(console.error);
