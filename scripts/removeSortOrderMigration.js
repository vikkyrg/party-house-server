require('dotenv').config();
const mongoose = require('mongoose');

async function runMigration() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/cs_cinemas';
  console.log('Connecting to database...');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB successfully.');

  const db = mongoose.connection.db;

  const collectionsToClean = [
    'eventtypes',
    'rooms',
    'services',
    'testimonials',
    'galleries',
    'faqs',
    'cakes',
    'addons'
  ];

  console.log('\n--- Removing sortOrder fields safely from collections ---');
  for (const collName of collectionsToClean) {
    try {
      const collections = await db.listCollections({ name: collName }).toArray();
      if (collections.length === 0) {
        console.log(`Collection "${collName}" does not exist, skipping.`);
        continue;
      }

      const coll = db.collection(collName);

      // Unset sortOrder field from all documents
      const result = await coll.updateMany(
        { sortOrder: { $exists: true } },
        { $unset: { sortOrder: "" } }
      );
      console.log(`[${collName}]: unset sortOrder on ${result.modifiedCount} documents (matched ${result.matchedCount}).`);

      // Inspect and drop indexes containing sortOrder
      const indexes = await coll.indexes();
      for (const idx of indexes) {
        if (idx.key && idx.key.sortOrder !== undefined) {
          console.log(`[${collName}]: Dropping index "${idx.name}" containing sortOrder.`);
          await coll.dropIndex(idx.name);
        }
      }
    } catch (err) {
      console.error(`Error processing collection ${collName}:`, err.message);
    }
  }

  console.log('\n--- Database migration completed successfully ---');
  await mongoose.disconnect();
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
