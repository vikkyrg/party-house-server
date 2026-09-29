const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });
const Room = require('./src/models/Room');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    const room = await Room.findById('6aae3eae22a8d1745735a342');
    if (!room) {
      console.log('Room not found');
      return process.exit(0);
    }
    
    console.log('Initial:', !!room.image, room.galleryImages.length);
    
    // Try to remove image
    room.image = undefined;
    room.markModified('image');
    room.galleryImages = [];
    room.markModified('galleryImages');
    
    await room.save();
    
    const reloaded = await Room.findById(room._id);
    console.log('Reloaded:', !!reloaded.image, reloaded.galleryImages.length);
    
    process.exit(0);
  })
  .catch(console.error);
