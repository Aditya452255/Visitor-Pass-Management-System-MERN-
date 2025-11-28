const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { sendEmail } = require('../utils/emailService');

const to = process.env.TEST_EMAIL || 'jainnitin0810@gmail.com';
const subject = 'SMTP Delivery Test - Visitor Pass System';
const html = `<p>This is a test email sent by the Visitor Pass Management system to verify SMTP delivery to <strong>${to}</strong>.</p>`;

(async () => {
  try {
    console.log('[SMTP Test] Sending test email to', to);
    const ok = await sendEmail(to, subject, html);
    console.log('[SMTP Test] sendEmail returned:', ok);
    process.exit(0);
  } catch (err) {
    console.error('[SMTP Test] Error while sending test email:');
    console.error(err);
    process.exit(1);
  }
})();
