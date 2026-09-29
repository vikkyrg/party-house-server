const mongoose = require('mongoose');
require('dotenv').config({ path: '.env' });
const Room = require('./src/models/Room');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    // I need to add an image to test removing it
    let room = await Room.findById('6aae3eae22a8d1745735a342');
    room.image = { url: 'http://test.com', publicId: 'test1' };
    room.galleryImages = [{ url: 'http://test.com', publicId: 'test1' }];
    await room.save();
    
    room = await Room.findById('6aae3eae22a8d1745735a342');
    console.log('Initial:', !!room.image, room.galleryImages.length);
    
    // Try to remove image
    room.set('image', null);
    room.set('galleryImages', []);
    
    await room.save();
    
    const reloaded = await Room.findById(room._id);
    console.log('Reloaded:', !!reloaded.image, reloaded.galleryImages.length);
    
    process.exit(0);
  })
  .catch(console.error);
