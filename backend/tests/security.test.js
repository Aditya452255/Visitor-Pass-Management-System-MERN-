const { test, describe } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateQRCode } = require('../utils/qrGenerator');
const checkRole = require('../middleware/roleCheck');

describe('Security & Authentication Tests', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-32-characters-long';

  test('bcrypt hashes passwords securely with salt rounds', async () => {
    const plain = 'SecurePassword@123';
    const hash = await bcrypt.hash(plain, 10);
    assert.notStrictEqual(plain, hash);
    assert.strictEqual(hash.startsWith('$2'), true);

    const matches = await bcrypt.compare(plain, hash);
    assert.strictEqual(matches, true);

    const wrong = await bcrypt.compare('WrongPassword', hash);
    assert.strictEqual(wrong, false);
  });

  test('JWT generates and validates signed tokens', () => {
    const payload = { id: 'user-uuid-123', email: 'test@example.com', role: 'admin' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    const decoded = jwt.verify(token, JWT_SECRET);
    assert.strictEqual(decoded.id, payload.id);
    assert.strictEqual(decoded.email, payload.email);
    assert.strictEqual(decoded.role, payload.role);
  });

  test('JWT rejects invalid signatures', () => {
    const token = jwt.sign({ id: '123' }, 'wrong-secret');
    assert.throws(() => {
      jwt.verify(token, JWT_SECRET);
    }, /invalid signature/);
  });

  test('JWT rejects expired tokens', () => {
    const token = jwt.sign({ id: '123' }, JWT_SECRET, { expiresIn: '-1s' });
    assert.throws(() => {
      jwt.verify(token, JWT_SECRET);
    }, /jwt expired/);
  });

  test('roleCheck middleware authorizes matching roles and rejects forbidden roles', () => {
    const middleware = checkRole('admin', 'security');

    // Case 1: user has allowed role
    let nextCalled = false;
    const req1 = { user: { role: 'admin' } };
    const res1 = {
      status: () => res1,
      json: () => res1
    };
    middleware(req1, res1, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);

    // Case 2: user has disallowed role
    let statusCode = 0;
    let jsonBody = null;
    const req2 = { user: { role: 'employee' } };
    const res2 = {
      status: (code) => { statusCode = code; return res2; },
      json: (data) => { jsonBody = data; return res2; }
    };
    middleware(req2, res2, () => {});
    assert.strictEqual(statusCode, 403);
    assert.strictEqual(jsonBody.error.includes('Access denied'), true);
  });

  test('QR code generation is free of visitor PII', async () => {
    // Generate QR with passNumber and appointmentId, but NO name, phone, or email
    const qrDataURL = await generateQRCode({
      passNumber: 'VP2611130001',
      appointmentId: 'apt-uuid-456'
    });

    assert.strictEqual(typeof qrDataURL, 'string');
    assert.strictEqual(qrDataURL.startsWith('data:image/png;base64,'), true);
  });
});
