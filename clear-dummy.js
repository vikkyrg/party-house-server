const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/cs_cinemas').then(async () => {
  await mongoose.connection.db.collection('cities').deleteMany({ name: { $ne: 'erd' } });
  await mongoose.connection.db.collection('eventtypes').deleteMany({});
  await mongoose.connection.db.collection('addons').deleteMany({});
  console.log('Deleted seeded data');
}).then(() => process.exit()).catch(console.error);
