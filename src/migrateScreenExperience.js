const mongoose = require('mongoose');
require('dotenv').config();

const Room = require('./models/Room');

async function migrateScreenExperience() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const rooms = await Room.find({});
    console.log(`Found ${rooms.length} room(s)`);

    for (const room of rooms) {
      const name = (room.name || '').toLowerCase();
      let updated = false;

      if (name.includes('velvet')) {
        if (!room.screenSize) { room.screenSize = '85-inch'; updated = true; }
        if (!room.pictureQuality) { room.pictureQuality = 'Clear picture with rich colors.'; updated = true; }
        if (!room.soundQuality) { room.soundQuality = 'Clear sound with deep bass.'; updated = true; }
      } else if (name.includes('sigma')) {
        if (!room.screenSize) { room.screenSize = '100-inch'; updated = true; }
        if (!room.pictureQuality) { room.pictureQuality = 'Sharp picture with bright colors.'; updated = true; }
        if (!room.soundQuality) { room.soundQuality = 'Powerful sound with deep bass.'; updated = true; }
      } else if (name.includes('paradise')) {
        if (!room.screenSize) { room.screenSize = '120-inch'; updated = true; }
        if (!room.pictureQuality) { room.pictureQuality = 'Big screen with stunning visuals.'; updated = true; }
        if (!room.soundQuality) { room.soundQuality = 'Surround sound for a cinematic experience.'; updated = true; }
      }

      if (updated) {
        await room.save();
        console.log(`Updated screen experience for room: ${room.name}`);
      }
    }

    console.log('Migration finished successfully');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  migrateScreenExperience();
}

module.exports = migrateScreenExperience;

