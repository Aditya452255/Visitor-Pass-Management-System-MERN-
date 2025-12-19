const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Visitor = require('../models/Visitor');

const seedData = async () => {
  try {
    // Debug: Check if MONGO_URI is loaded
    console.log('MONGO_URI:', process.env.MONGO_URI ? 'Loaded ✓' : 'Missing ✗');
    
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in .env file');
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✓ Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Visitor.deleteMany({});
    console.log('✓ Cleared existing data');

    // Create users
    console.log('Creating users...');
    const admin = await User.signup(
      'Admin User',
      'admin@example.com',
      'Admin@123456',
      '+1234567890',
      'admin',
      'Administration'
    );

    const security = await User.signup(
      'Security Guard',
      'security@example.com',
      'Security@123456',
      '+1234567891',
      'security',
      'Security'
    );

    const employee = await User.signup(
      'John Employee',
      'employee@example.com',
      'Employee@123456',
      '+1234567892',
      'employee',
      'IT Department'
    );

    console.log('✓ Created users');

    // Create sample visitors (Note: using placeholder path for photos)
    console.log('Creating sample visitors...');
    const visitors = await Visitor.create([
      {
        name: 'Alice Johnson',
        email: 'alice@company.com',
        phone: '+1234567893',
        company: 'Tech Corp',
        idType: 'passport',
        idNumber: 'P123456',
        photo: 'uploads/visitors/placeholder.jpg',
        address: '123 Main St, New York, NY',
        purpose: 'Business Meeting',
        visitCount: 5,
        lastVisit: new Date()
      },
      {
        name: 'Bob Smith',
        email: 'bob@startup.com',
        phone: '+1234567894',
        company: 'StartUp Inc',
        idType: 'driving_license',
        idNumber: 'DL789012',
        photo: 'uploads/visitors/placeholder.jpg',
        address: '456 Oak Ave, San Francisco, CA',
        purpose: 'Interview',
        visitCount: 2,
        lastVisit: new Date()
      },
      {
        name: 'Carol Williams',
        email: 'carol@design.com',
        phone: '+1234567895',
        company: 'Design Studio',
        idType: 'national_id',
        idNumber: 'NID345678',
        photo: 'uploads/visitors/placeholder.jpg',
        address: '789 Pine Rd, Austin, TX',
        purpose: 'Project Discussion',
        visitCount: 3,
        lastVisit: new Date()
      }
    ]);

    console.log('✓ Created sample visitors');

    console.log('\n========================================');
    console.log('       SEED DATA CREATED SUCCESSFULLY   ');
    console.log('========================================');
    console.log('\nDefault Login Credentials:');
    console.log('---------------------------');
    console.log('Admin:');
    console.log('  Email:', admin.email);
    console.log('  Password: Admin@123456');
    console.log('\nSecurity:');
    console.log('  Email:', security.email);
    console.log('  Password: Security@123456');
    console.log('\nEmployee:');
    console.log('  Email:', employee.email);
    console.log('  Password: Employee@123456');
    console.log('\nSample Visitors Created:', visitors.length);
    console.log('========================================\n');

    await mongoose.connection.close();
    console.log('✓ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
};

seedData();