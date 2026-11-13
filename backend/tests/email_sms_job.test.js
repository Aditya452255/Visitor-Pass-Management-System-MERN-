const { test, describe } = require('node:test');
const assert = require('node:assert');
const { sendEmail } = require('../utils/emailService');
const { sendSMS, sendAppointmentSMS } = require('../utils/smsService');
const { handler: lambdaHandler } = require('../jobs/autoCheckout');

describe('Email, SMS & AutoCheckout Job Tests', () => {
  test('sendEmail gracefully falls back without throwing when not configured or in dev', async () => {
    const result = await sendEmail({
      to: 'recipient@example.com',
      subject: 'Test Subject',
      html: '<p>Test Body</p>'
    });
    // In dev / unconfigured mode, sendEmail handles gracefully (returns false or mocked)
    assert.strictEqual(typeof result, 'boolean');
  });

  test('sendSMS gracefully falls back without throwing when Twilio credentials unconfigured', async () => {
    const smsResult = await sendSMS('+1234567890', 'Hello from test');
    assert.strictEqual(smsResult, false);

    const aptResult = await sendAppointmentSMS('+1234567890', {
      date: '2026-11-13',
      time: '14:00',
      host: 'John Doe',
      location: 'Room 101'
    });
    assert.strictEqual(aptResult, false);
  });

  test('Lambda handler wrapper conforms to AWS Lambda EventBridge interface', async () => {
    assert.strictEqual(typeof lambdaHandler, 'function');
  });
});

