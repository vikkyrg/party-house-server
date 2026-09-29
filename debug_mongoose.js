const mongoose = require('mongoose');
require('dotenv').config({ path: '../server/.env' });
const Room = require('../server/src/models/Room');

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('Connected to DB');
    const room = await Room.findOne();
    if (!room) {
      console.log('No rooms found');
      process.exit(0);
    }
    console.log('Original galleryImages length:', room.galleryImages.length);
    
    if (room.galleryImages.length > 0) {
      const removedId = room.galleryImages[0].publicId || room.galleryImages[0].url;
      console.log('Removing:', removedId);
      
      const keepImages = room.galleryImages.filter(
        img => img.publicId !== removedId && img.url !== removedId
      );
      
      room.set('galleryImages', keepImages);
      console.log('After set, length is:', room.galleryImages.length);
      
      await room.save();
      
      const reloadedRoom = await Room.findById(room._id);
      console.log('Reloaded galleryImages length:', reloadedRoom.galleryImages.length);
    } else {
      console.log('No images to delete in this room.');
    }
    process.exit(0);
  })
  .catch(console.error);
