const nodemailer = require('nodemailer');
const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const { logger } = require('./logger');

class EmailService {
  constructor() {
    this.provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
    this.fromEmail = process.env.AWS_SES_FROM_EMAIL || process.env.EMAIL_USER || 'no-reply@visitorpass.local';
    this.transporter = null;

    this.initTransporter();
  }

  initTransporter() {
    if (this.provider === 'ses') {
      const sesConfig = {
        region: process.env.AWS_REGION || 'us-east-1'
      };
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        sesConfig.credentials = {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };
      }
      const ses = new SESClient(sesConfig);
      this.transporter = nodemailer.createTransport({
        SES: { ses, aws: { SendRawEmailCommand } }
      });
      logger.info(`✓ AWS SES Email transport configured for sender: ${this.fromEmail}`);
    } else if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
      logger.info(`✓ SMTP Email transport configured (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587})`);
    } else if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      // Legacy Gmail / service support
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      logger.info(`✓ Email service (${process.env.EMAIL_SERVICE}) transport configured`);
    } else {
      logger.warn('⚠️ No email service credentials configured. Outgoing emails will be logged to console.');
    }
  }

  async sendEmail(to, subject, html, attachments = []) {
    if (!to) {
      logger.warn('[EmailService] Recipient "to" is required, skipping email.');
      return false;
    }

    const mailOptions = {
      from: this.fromEmail,
      to,
      subject,
      html,
      attachments
    };

    if (!this.transporter) {
      logger.info(`[EmailService MOCK] To: ${to} | Subject: ${subject}`);
      return true;
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`✓ Email sent to ${to} (MessageId: ${info.messageId || 'OK'})`);
      return true;
    } catch (err) {
      logger.error(`✗ Error sending email to ${to}: ${err.message}`, { subject });
      return false;
    }
  }

  async sendAppointmentConfirmation(appointment, visitor, host, qrCodeDataURL) {
    if (!visitor || !visitor.email) {
      logger.warn('[EmailService] Visitor email missing, cannot send appointment confirmation');
      return false;
    }

    const apptDateStr = new Date(appointment.appointmentDate).toLocaleDateString();
    const html = `
      <h2>Appointment Confirmation</h2>
      <p>Dear ${visitor.name || 'Visitor'},</p>
      <p>Your appointment has been scheduled and approved:</p>
      <ul>
        <li><strong>Date:</strong> ${apptDateStr}</li>
        <li><strong>Time:</strong> ${appointment.appointmentTime || 'N/A'}</li>
        <li><strong>Host:</strong> ${host?.name || 'N/A'}</li>
        <li><strong>Location:</strong> ${appointment.location || 'Reception'}</li>
        <li><strong>Purpose:</strong> ${appointment.purpose || 'Official'}</li>
      </ul>
      <p>Please present this QR code at the security gate for quick verification:</p>
      ${qrCodeDataURL ? '<p><img src="cid:qrcode" alt="QR Code" width="200" height="200"/></p>' : ''}
      <p>Please arrive 10 minutes before your scheduled appointment.</p>
    `;

    const attachments = [];
    if (qrCodeDataURL && qrCodeDataURL.startsWith('data:')) {
      const match = qrCodeDataURL.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        attachments.push({
          filename: 'qrcode.png',
          content: Buffer.from(match[2], 'base64'),
          contentType: match[1],
          cid: 'qrcode'
        });
      }
    }

    return await this.sendEmail(visitor.email, 'Appointment Confirmation & Visitor Pass QR Code', html, attachments);
  }

  async sendPassDetails(pass, visitor, pdfPathOrBuffer) {
    if (!visitor || !visitor.email) return false;

    const html = `
      <h2>Your Visitor Pass has been Issued</h2>
      <p>Dear ${visitor.name},</p>
      <p>Your visitor pass details are as follows:</p>
      <ul>
        <li><strong>Pass Number:</strong> ${pass.passNumber}</li>
        <li><strong>Valid From:</strong> ${new Date(pass.validFrom).toLocaleString()}</li>
        <li><strong>Valid Until:</strong> ${new Date(pass.validUntil).toLocaleString()}</li>
      </ul>
      <p>Please find your visitor badge attached. Show this badge at the security checkpoint.</p>
    `;

    const attachments = [];
    if (pdfPathOrBuffer) {
      if (Buffer.isBuffer(pdfPathOrBuffer)) {
        attachments.push({
          filename: `Visitor_Pass_${pass.passNumber}.pdf`,
          content: pdfPathOrBuffer,
          contentType: 'application/pdf'
        });
      } else if (typeof pdfPathOrBuffer === 'string') {
        attachments.push({
          filename: `Visitor_Pass_${pass.passNumber}.pdf`,
          path: pdfPathOrBuffer
        });
      }
    }

    return await this.sendEmail(visitor.email, `Your Visitor Pass - ${pass.passNumber}`, html, attachments);
  }
}

const emailService = new EmailService();

module.exports = {
  sendEmail: (to, subject, html, attachments) => emailService.sendEmail(to, subject, html, attachments),
  sendAppointmentConfirmation: (appt, vis, host, qr) => emailService.sendAppointmentConfirmation(appt, vis, host, qr),
  sendPassDetails: (pass, vis, pdf) => emailService.sendPassDetails(pass, vis, pdf),
  emailService
};
