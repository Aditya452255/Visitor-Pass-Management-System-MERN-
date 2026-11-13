const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate an opaque, PII-free QR payload and return as Data URL
 * @param {Object} data - Minimal opaque identifiers ({ passNumber, appointmentId, qrToken })
 * @returns {Promise<{ qrCodeDataURL: string, qrToken: string }>}
 */
const generateQRCode = async (data = {}) => {
  try {
    // Generate an opaque verification token if not provided
    const qrToken = data.qrToken || uuidv4();

    // Construct a sanitized payload free of PII (name, email, phone removed)
    const sanitizedPayload = {
      token: qrToken
    };

    if (data.passNumber) sanitizedPayload.passNumber = data.passNumber;
    if (data.appointmentId) sanitizedPayload.appointmentId = data.appointmentId;

    const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(sanitizedPayload), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 250
    });

    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
};

module.exports = { generateQRCode };
