const nodemailer = require('nodemailer');
const { path } = require('pdfkit');

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendEmail = async (to, subject, html) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            html,
        };

        await transporter.sendMail(mailOptions);
        return true;

    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

const sendAppointmentConfirmation = async (appointment, visitor, host, qrCodeDataURL) => {
    

    const html = `
        <h2>Appointment Confirmation</h2>
        <p>Dear ${visitor.name},</p>
        <p>Your appointment has been scheduled:</p>
        <ul>
            <li><strong>Date:</strong> ${new Date(appointment.appointmentDate).toLocaleDateString()}</li>
      <li><strong>Time:</strong> ${appointment.appointmentTime}</li>
      <li><strong>Host:</strong> ${host.name}</li>
      <li><strong>Location:</strong> ${appointment.location}</li>
      <li><strong>Purpose:</strong> ${appointment.purpose}</li>
    </ul>
    <p>Please show this QR code at the entrance for a quick check-in:</p>
    ${qrCodeDataURL ? '<img src="cid:qrcode" alt="QR Code for your appointment"/>' : ''}
    <p>Please arrive 10 minutes early for check-in.</p>
  `;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: visitor.email,
        subject: 'Appointment Confirmation & QR Code',
        html,
        attachments: []
    };

    // Attach QR code correctly. `generateQRCode` returns a data URL (data:image/png;base64,....)
    try {
        if (qrCodeDataURL) {
            if (typeof qrCodeDataURL === 'string' && qrCodeDataURL.startsWith('data:')) {
                // data:[<mediatype>][;base64],<data>
                const match = qrCodeDataURL.match(/^data:(image\/[^;]+);base64,(.+)$/);
                if (match) {
                    const mimeType = match[1];
                    const base64Data = match[2];
                    mailOptions.attachments.push({
                        filename: 'qrcode.png',
                        content: Buffer.from(base64Data, 'base64'),
                        contentType: mimeType,
                        cid: 'qrcode'
                    });
                } else {
                    // Fallback: attach raw data URL as content (may not be ideal)
                    mailOptions.attachments.push({
                        filename: 'qrcode.png',
                        content: qrCodeDataURL,
                        cid: 'qrcode'
                    });
                }
            } else {
                // Assume it's a filesystem path or URL that nodemailer can handle
                mailOptions.attachments.push({
                    filename: 'qrcode.png',
                    path: qrCodeDataURL,
                    cid: 'qrcode'
                });
            }
        }

        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('[EmailService] CRITICAL: Error sending appointment confirmation email:', error);
        try {
            console.error('[EmailService] Mail Options at time of error:', JSON.stringify({
                to: mailOptions.to,
                subject: mailOptions.subject,
                attachments: mailOptions.attachments.map(a => ({ filename: a.filename, path: a.path || null, hasContent: !!a.content }))
            }, null, 2)); // Log the mail options for debugging
        } catch (e) {
            console.error('[EmailService] Failed to serialize mail options for logging', e);
        }
        throw error;
    }
};

const sendPassDetails  = async (pass, visitor, pdfPath) => {
    const html = `
        <h2>Your Visitor Pass</h2>
    <p>Dear ${visitor.name},</p>
    <p>Your visitor pass has been issued:</p>
    <ul>
      <li><strong>Pass Number:</strong> ${pass.passNumber}</li>
      <li><strong>Valid From:</strong> ${new Date(pass.validFrom).toLocaleString()}</li>
      <li><strong>Valid Until:</strong> ${new Date(pass.validUntil).toLocaleString()}</li>
    </ul>
    <p>Please find your visitor pass attached. Show this at the entrance.</p>
  `;

    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: visitor.email,
            subject: 'Your Visitor Pass Details',
            html,
            attachments: pdfPath ? [{
                filename: `Visitor_Pass_${pass.passNumber}.pdf`,
                path: pdfPath,
            }] : [],
        };

        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending pass details email:', error);
       return false;
    }
};

module.exports = {
    sendEmail,
    sendAppointmentConfirmation,
    sendPassDetails,
};