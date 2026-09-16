const mongoose = require('mongoose');
require('dotenv').config();

async function migrateImages() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const File = mongoose.model('File', new mongoose.Schema({ data: Buffer, contentType: String }, { strict: false }));
  
  const collections = ['EventType', 'City', 'Location', 'Banner', 'AddOn', 'Theater'];

  for (const colName of collections) {
    const Model = mongoose.model(colName, new mongoose.Schema({}, { strict: false }));
    const items = await Model.find({});

    for (const item of items) {
      let updated = false;

      // Single image object
      if (item.image && item.image.url && item.image.url.includes('/files/')) {
        const fileId = item.image.url.split('/files/')[1];
        if (fileId) {
          const file = await File.findById(fileId);
          if (file && file.data) {
            item.image.url = `data:${file.contentType || 'image/png'};base64,${file.data.toString('base64')}`;
            updated = true;
          }
        }
      }

      // Multiple images array
      if (Array.isArray(item.images)) {
        for (const img of item.images) {
          if (img && img.url && img.url.includes('/files/')) {
            const fileId = img.url.split('/files/')[1];
            if (fileId) {
              const file = await File.findById(fileId);
              if (file && file.data) {
                img.url = `data:${file.contentType || 'image/png'};base64,${file.data.toString('base64')}`;
                updated = true;
              }
            }
          }
        }
      }

      if (updated) {
        item.markModified('image');
        item.markModified('images');
        await item.save();
        console.log(`Updated ${colName} item: ${item._id} (${item.name || item.title || ''})`);
      }
    }
  }

  console.log('Migration completed');
  await mongoose.disconnect();
}

migrateImages().catch(console.error);
