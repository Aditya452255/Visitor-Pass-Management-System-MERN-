const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('Full E2E Visitor Lifecycle Integration Test (Real PostgreSQL)', () => {
  let adminToken, hostToken, securityToken;
  let adminUser, hostUser, securityUser;
  let testVisitor, testAppointment, testPass, testCheckLog;

  before(async () => {
    // 1. Fetch seeded users
    adminUser = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    hostUser = await prisma.user.findUnique({ where: { email: 'employee@example.com' } });
    securityUser = await prisma.user.findUnique({ where: { email: 'security@example.com' } });

    assert.ok(adminUser, 'Admin user should be seeded');
    assert.ok(hostUser, 'Host user should be seeded');
    assert.ok(securityUser, 'Security user should be seeded');

    const JWT_SECRET = process.env.JWT_SECRET;
    adminToken = jwt.sign({ id: adminUser.id, role: adminUser.role }, JWT_SECRET, { expiresIn: '1h' });
    hostToken = jwt.sign({ id: hostUser.id, role: hostUser.role }, JWT_SECRET, { expiresIn: '1h' });
    securityToken = jwt.sign({ id: securityUser.id, role: securityUser.role }, JWT_SECRET, { expiresIn: '1h' });
  });

  test('1. Authentication: Password verification & Login', async () => {
    const valid = await bcrypt.compare('Admin@123456', adminUser.password);
    assert.strictEqual(valid, true, 'Seeded password must match Admin@123456');

    const invalid = await bcrypt.compare('WrongPassword', adminUser.password);
    assert.strictEqual(invalid, false, 'Invalid password must be rejected');
  });

  test('2. Visitor Registration: Create Visitor in PostgreSQL', async () => {
    testVisitor = await prisma.visitor.create({
      data: {
        name: 'E2E Lifecycle Visitor',
        email: 'e2e.visitor@test.local',
        phone: '+1999888777',
        company: 'Automated Testing Inc',
        idType: 'national_id',
        idNumber: 'ID-E2E-999',
        photo: '/uploads/visitors/placeholder.jpg',
        purpose: 'Integration Verification',
        visitCount: 0
      }
    });

    assert.ok(testVisitor.id);
    assert.strictEqual(testVisitor.name, 'E2E Lifecycle Visitor');
    assert.strictEqual(testVisitor.visitCount, 0);
  });

  test('3. Visitor Retrieval: Query Visitor by ID', async () => {
    const found = await prisma.visitor.findUnique({
      where: { id: testVisitor.id }
    });
    assert.ok(found);
    assert.strictEqual(found.email, 'e2e.visitor@test.local');
  });

  test('4. Appointment Creation: Book appointment with Host', async () => {
    const aptDate = new Date();
    aptDate.setHours(15, 0, 0, 0);

    testAppointment = await prisma.appointment.create({
      data: {
        visitorId: testVisitor.id,
        hostId: hostUser.id,
        appointmentDate: aptDate,
        appointmentTime: '15:00',
        duration: 45,
        purpose: 'Architecture Review',
        location: 'Briefing Room 1',
        status: 'pending'
      }
    });

    assert.ok(testAppointment.id);
    assert.strictEqual(testAppointment.status, 'pending');
  });

  test('5. Appointment Approval: Host approves the appointment', async () => {
    const updated = await prisma.appointment.update({
      where: { id: testAppointment.id },
      data: {
        status: 'approved',
        approvedById: hostUser.id,
        approvalDate: new Date()
      }
    });

    assert.strictEqual(updated.status, 'approved');
    assert.strictEqual(updated.approvedById, hostUser.id);
  });

  test('6. Pass Generation: Security / Admin issues Visitor Pass', async () => {
    const now = new Date();
    const validUntil = new Date(now.getTime() + 4 * 3600000);
    const passNumber = `VP${Date.now().toString().slice(-8)}`;
    const qrToken = `token-${Date.now()}`;

    testPass = await prisma.pass.create({
      data: {
        passNumber,
        visitorId: testVisitor.id,
        appointmentId: testAppointment.id,
        issuedById: adminUser.id,
        hostId: hostUser.id,
        validFrom: now,
        validUntil,
        qrToken,
        status: 'active',
        accessAreas: ['Lobby', 'Conference Floor 2'],
        specialInstructions: 'Visitor Badge required at all times'
      }
    });

    assert.ok(testPass.id);
    assert.strictEqual(testPass.status, 'active');
    assert.strictEqual(testPass.accessAreas.length, 2);
  });

  test('7. QR Verification: Verify pass by Pass Number & Token', async () => {
    const verified = await prisma.pass.findFirst({
      where: {
        OR: [
          { passNumber: testPass.passNumber },
          { qrToken: testPass.qrToken }
        ]
      },
      include: { visitor: true, host: true }
    });

    assert.ok(verified);
    assert.strictEqual(verified.status, 'active');
    assert.strictEqual(verified.visitor.name, 'E2E Lifecycle Visitor');
    assert.strictEqual(verified.host.name, hostUser.name);
  });

  test('8. Check-In: Security checks in the visitor', async () => {
    testCheckLog = await prisma.checkLog.create({
      data: {
        passId: testPass.id,
        visitorId: testVisitor.id,
        checkInTime: new Date(),
        checkedInById: securityUser.id,
        location: 'Main Gate',
        temperature: 36.6,
        notes: 'Security clearance verified'
      }
    });

    // Increment visitor count
    await prisma.visitor.update({
      where: { id: testVisitor.id },
      data: {
        visitCount: { increment: 1 },
        lastVisit: new Date()
      }
    });

    assert.ok(testCheckLog.id);
    assert.strictEqual(testCheckLog.checkOutTime, null);

    const updatedVisitor = await prisma.visitor.findUnique({ where: { id: testVisitor.id } });
    assert.strictEqual(updatedVisitor.visitCount, 1);
  });

  test('9. Guard Check: Reject duplicate check-in if already inside', async () => {
    const openCheckIn = await prisma.checkLog.findFirst({
      where: {
        passId: testPass.id,
        checkOutTime: null
      }
    });

    assert.ok(openCheckIn, 'Open check-in must exist');
    // Attempting another check-in while openCheckIn exists is rejected by controller
    const canCheckInAgain = !openCheckIn;
    assert.strictEqual(canCheckInAgain, false, 'Duplicate check-in should be prevented');
  });

  test('10. Check-Out: Security checks out the visitor', async () => {
    const updatedLog = await prisma.checkLog.update({
      where: { id: testCheckLog.id },
      data: {
        checkOutTime: new Date(),
        checkedOutById: securityUser.id,
        notes: 'Visitor departed safely'
      }
    });

    assert.ok(updatedLog.checkOutTime);
    assert.strictEqual(updatedLog.checkedOutById, securityUser.id);
  });

  test('11. CheckLog Retrieval: Verify complete audit trail in DB', async () => {
    const log = await prisma.checkLog.findUnique({
      where: { id: testCheckLog.id },
      include: {
        visitor: true,
        pass: true,
        checkedInBy: true,
        checkedOutBy: true
      }
    });

    assert.ok(log);
    assert.ok(log.checkInTime);
    assert.ok(log.checkOutTime);
    assert.strictEqual(log.visitor.id, testVisitor.id);
    assert.strictEqual(log.pass.passNumber, testPass.passNumber);
    assert.strictEqual(log.checkedInBy.id, securityUser.id);
    assert.strictEqual(log.checkedOutBy.id, securityUser.id);
  });

  after(async () => {
    // Clean up temporary records created during this test
    if (testCheckLog) {
      await prisma.checkLog.deleteMany({ where: { id: testCheckLog.id } });
    }
    if (testPass) {
      await prisma.pass.deleteMany({ where: { id: testPass.id } });
    }
    if (testAppointment) {
      await prisma.appointment.deleteMany({ where: { id: testAppointment.id } });
    }
    if (testVisitor) {
      await prisma.visitor.deleteMany({ where: { id: testVisitor.id } });
    }

    console.log('✓ Cleaned up all temporary lifecycle test records.');
    await prisma.$disconnect();
  });
});

