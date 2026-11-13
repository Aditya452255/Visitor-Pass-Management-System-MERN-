require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

async function seed() {
  console.log('🌱 Starting database seeding...');

  try {
    // Hash passwords
    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('Admin@123456', salt);
    const securityPassword = await bcrypt.hash('Security@123456', salt);
    const employeePassword = await bcrypt.hash('Employee@123456', salt);
    const visitorPassword = await bcrypt.hash('Visitor@123456', salt);

    // 1. Upsert Admin User
    const admin = await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        name: 'System Admin',
        email: 'admin@example.com',
        password: adminPassword,
        phone: '+1234567890',
        role: 'admin',
        department: 'Administration',
        isActive: true
      }
    });
    console.log(`✓ Admin user: ${admin.email}`);

    // 2. Upsert Security Guard User
    const security = await prisma.user.upsert({
      where: { email: 'security@example.com' },
      update: {},
      create: {
        name: 'Gate Security Guard',
        email: 'security@example.com',
        password: securityPassword,
        phone: '+1234567891',
        role: 'security',
        department: 'Security Operations',
        isActive: true
      }
    });
    console.log(`✓ Security user: ${security.email}`);

    // 3. Upsert Employee (Host) User
    const employee = await prisma.user.upsert({
      where: { email: 'employee@example.com' },
      update: {},
      create: {
        name: 'John Doe (Host)',
        email: 'employee@example.com',
        password: employeePassword,
        phone: '+1234567892',
        role: 'employee',
        department: 'Engineering',
        isActive: true
      }
    });
    console.log(`✓ Employee user: ${employee.email}`);

    // 4. Upsert Visitor User
    const visitorUser = await prisma.user.upsert({
      where: { email: 'visitor@example.com' },
      update: {},
      create: {
        name: 'Alice Smith',
        email: 'visitor@example.com',
        password: visitorPassword,
        phone: '+1234567893',
        role: 'visitor',
        department: 'External',
        isActive: true
      }
    });
    console.log(`✓ Visitor user: ${visitorUser.email}`);

    // 5. Upsert Visitor Profile
    const visitor = await prisma.visitor.upsert({
      where: { userId: visitorUser.id },
      update: {},
      create: {
        userId: visitorUser.id,
        name: 'Alice Smith',
        email: 'visitor@example.com',
        phone: '+1234567893',
        company: 'Acme Technologies',
        idType: 'passport',
        idNumber: 'P123456789',
        photo: '/uploads/placeholder.jpg',
        address: '123 Innovation Way, Tech Park',
        purpose: 'Vendor Strategy Meeting',
        vehicleNumber: 'KA-01-AB-1234',
        visitCount: 1,
        lastVisit: new Date()
      }
    });
    console.log(`✓ Visitor profile: ${visitor.name} (${visitor.id})`);

    // 6. Create or verify a sample approved appointment for today
    const today = new Date();
    today.setHours(14, 0, 0, 0);

    let appointment = await prisma.appointment.findFirst({
      where: {
        visitorId: visitor.id,
        hostId: employee.id
      }
    });

    if (!appointment) {
      appointment = await prisma.appointment.create({
        data: {
          visitorId: visitor.id,
          hostId: employee.id,
          appointmentDate: today,
          appointmentTime: '14:00',
          duration: 60,
          purpose: 'Quarterly Vendor Review',
          location: 'Conference Room 3B',
          status: 'approved',
          approvedById: employee.id,
          approvalDate: new Date(),
          visitorPhoto: '/uploads/placeholder.jpg'
        }
      });
      console.log(`✓ Sample appointment created: ${appointment.id}`);
    }

    // 7. Create or verify a sample active pass
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, '');
    const samplePassNumber = `VP${dateStr}0001`;

    let pass = await prisma.pass.findUnique({
      where: { passNumber: samplePassNumber }
    });

    if (!pass) {
      const validFrom = new Date(today.getTime() - 30 * 60000);
      const validUntil = new Date(today.getTime() + 90 * 60000);

      pass = await prisma.pass.create({
        data: {
          passNumber: samplePassNumber,
          visitorId: visitor.id,
          appointmentId: appointment.id,
          issuedById: admin.id,
          hostId: employee.id,
          validFrom,
          validUntil,
          status: 'active',
          accessAreas: ['Floor 1 Reception', 'Floor 3 Engineering'],
          specialInstructions: 'Visitor must be escorted in R&D labs.'
        }
      });
      console.log(`✓ Sample active pass created: ${pass.passNumber}`);
    }

    console.log('✅ Database seeding finished successfully!');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seed();
}

module.exports = seed;

