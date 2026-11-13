const twilio = require('twilio');
const { logger } = require('./logger');

let client = null;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

if (accountSid && authToken && fromPhone) {
  try {
    client = twilio(accountSid, authToken);
    logger.info('✓ Twilio SMS client initialized');
  } catch (err) {
    logger.warn(`Failed to initialize Twilio client: ${err.message}`);
  }
} else {
  logger.info('ℹ Twilio SMS not configured; SMS notifications will be skipped');
}

const sendSMS = async (to, message) => {
  if (!client || !fromPhone) {
    logger.debug(`[SMS MOCK] To: ${to} | Message: ${message}`);
    return false;
  }

  try {
    await client.messages.create({
      body: message,
      from: fromPhone,
      to
    });
    logger.info(`✓ SMS sent to ${to}`);
    return true;
  } catch (error) {
    logger.error(`Error sending SMS to ${to}: ${error.message}`);
    return false;
  }
};

const sendAppointmentSMS = async (phone, appointmentDetails) => {
  if (!phone) return false;
  const message = `Your appointment is confirmed on ${appointmentDetails.date} at ${appointmentDetails.time} with ${appointmentDetails.host}. Location: ${appointmentDetails.location}.`;
  return await sendSMS(phone, message);
};

module.exports = {
  sendSMS,
  sendAppointmentSMS
};
