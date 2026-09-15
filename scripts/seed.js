const mongoose = require('mongoose');
require('dotenv').config();

const City = require('../src/models/City');
const Location = require('../src/models/Location');
const EventType = require('../src/models/EventType');
const AddOn = require('../src/models/AddOn');
const User = require('../src/models/User');

// Sample data
const cities = [
  { name: 'Bengaluru', code: 'BLR' },
  { name: 'Hyderabad', code: 'HYD' },
  { name: 'Delhi NCR', code: 'DEL' },
  { name: 'Mumbai', code: 'MUM' },
  { name: 'Chennai', code: 'CHN' },
  { name: 'Visakhapatnam', code: 'VIZ' },
  { name: 'Pune', code: 'PUN' },
  { name: 'Ahmedabad', code: 'AMD' },
  { name: 'Lucknow', code: 'LKO' }
];

const eventTypes = [
  { name: 'Birthday', description: 'Celebrate your special day with friends and family', basePrice: 500, duration: 2 },
  { name: 'Anniversary', description: 'Romantic private screening for couples', basePrice: 700, duration: 2 },
  { name: 'Date Night', description: 'Perfect intimate experience for your date', basePrice: 600, duration: 2 },
  { name: 'Party & Events', description: 'Host your parties and get-togethers', basePrice: 800, duration: 3 },
  { name: 'Surprise Proposal', description: 'Make your proposal unforgettable', basePrice: 1000, duration: 2 },
  { name: 'Bride to Be', description: 'Pre-wedding celebration with your squad', basePrice: 900, duration: 3 },
  { name: 'Kids Celebration', description: 'Fun celebrations for kids', basePrice: 500, duration: 2 }
];

const addOns = [
  { name: 'Cake', category: 'Food', description: 'Delicious celebration cakes', price: 500, isPopular: true },
  { name: 'Bouquet', category: 'Gift', description: 'Fresh rose bouquets', price: 300, isPopular: true },
  { name: 'Decoration', category: 'Decoration', description: 'Themed decorations and setups', price: 1000, isPopular: true },
  { name: 'Fog Entry', category: 'Experience', description: 'Grand entrance with fog effect', price: 400, isPopular: true },
  { name: 'Karaoke', category: 'Entertainment', description: 'Sing your favorite songs', price: 600, isPopular: false },
  { name: 'Food & Beverages', category: 'Food', description: 'In-theatre dining', price: 800, isPopular: false },
  { name: 'Gifts', category: 'Gift', description: 'Chocolates and gift items', price: 400, isPopular: false },
  { name: 'Photoshoot', category: 'Experience', description: 'Professional photoshoot', price: 1500, isPopular: false },
  { name: 'Kids Car Entry', category: 'Experience', description: 'Special entry for kids', price: 300, isPopular: false }
];

const locations = {
  'Bengaluru': ['Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'JP Nagar'],
  'Hyderabad': ['Gachibowli', 'Hitech City', 'Jubilee Hills', 'Banjara Hills', 'Madhapur'],
  'Delhi NCR': ['Connaught Place', 'Saket', 'Gurgaon', 'Noida', 'Dwarka'],
  'Mumbai': ['Bandra', 'Andheri', 'Powai', 'Juhu', 'Worli'],
  'Chennai': ['T Nagar', 'Anna Nagar', 'OMR', 'Adyar', 'Velachery']
};

const seedDatabase = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      City.deleteMany({}),
      Location.deleteMany({}),
      EventType.deleteMany({}),
      AddOn.deleteMany({}),
      User.deleteMany({ role: 'admin' })
    ]);
    
    // Seed cities
    console.log('🏙️  Seeding cities...');
    const seededCities = await City.insertMany(
      cities.map(city => ({
        ...city,
        slug: city.name.toLowerCase().replace(/\s+/g, '-'),
        isActive: true
      }))
    );
    console.log(`✅ Seeded ${seededCities.length} cities`);
    
    // Seed locations
    console.log('📍 Seeding locations...');
    const allLocations = [];
    for (const [cityName, locationNames] of Object.entries(locations)) {
      const city = await City.findOne({ name: cityName });
      if (city) {
        const cityLocations = locationNames.map(name => ({
          city: city._id,
          name,
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          isActive: true
        }));
        allLocations.push(...cityLocations);
      }
    }
    const seededLocations = await Location.insertMany(allLocations);
    console.log(`✅ Seeded ${seededLocations.length} locations`);
    
    // Seed event types
    console.log('🎉 Seeding event types...');
    const seededEventTypes = await EventType.insertMany(
      eventTypes.map((et, index) => ({
        ...et,
        slug: et.name.toLowerCase().replace(/\s+/g, '-'),
        isActive: true,
        sortOrder: index
      }))
    );
    console.log(`✅ Seeded ${seededEventTypes.length} event types`);
    
    // Seed add-ons
    console.log('🎁 Seeding add-ons...');
    const seededAddOns = await AddOn.insertMany(
      addOns.map((addon, index) => ({
        ...addon,
        slug: addon.name.toLowerCase().replace(/\s+/g, '-'),
        isActive: true,
        sortOrder: index
      }))
    );
    console.log(`✅ Seeded ${seededAddOns.length} add-ons`);
    
    // Create admin user
    console.log('👤 Creating admin user...');
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@cs-cinemas.com',
      phone: '9999999999',
      password: 'Admin@1234', // Will be hashed by pre-save hook
      role: 'admin',
      isVerified: true
    });
    console.log(`✅ Created admin user: ${adminUser.email}`);
    console.log('   Password: Admin@1234');
    
    console.log('\n🎉 Database seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Cities: ${seededCities.length}`);
    console.log(`   - Locations: ${seededLocations.length}`);
    console.log(`   - Event Types: ${seededEventTypes.length}`);
    console.log(`   - Add-ons: ${seededAddOns.length}`);
    console.log(`   - Admin Users: 1`);
    console.log('\n✅ You can now start developing!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
