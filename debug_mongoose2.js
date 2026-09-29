const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
const Room = require('./src/models/Room');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    const room = await Room.findOne();
    if (!room) return process.exit(0);
    
    room.set('image', null);
    room.set('galleryImages', []);
    
    await room.save();
    
    const reloaded = await Room.findById(room._id);
    console.log('Reloaded image:', reloaded.image);
    console.log('Reloaded galleryImages length:', reloaded.galleryImages.length);
    process.exit(0);
  })
  .catch(console.error);
