const PDFDocument = require('pdfkit');
const storageService = require('../services/storageService');
const { logger } = require('./logger');

/**
 * Generate a Visitor Pass PDF Badge and save it via storageService
 * @param {Object} passData - Pass details with visitor and host populated
 * @param {string} qrCodeDataURL - Base64 QR code data URL
 * @returns {Promise<string>} - Accessible URL or path to the PDF
 */
const generatePassPDF = async (passData, qrCodeDataURL) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [400, 600], margin: 20 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(chunks);
          // Upload to configured storage backend (local disk or S3)
          const result = await storageService.uploadFile({
            buffer: pdfBuffer,
            originalname: `${passData.passNumber}.pdf`,
            mimetype: 'application/pdf',
            folder: 'passes'
          });
          logger.info(`✓ Generated PDF pass badge for ${passData.passNumber} at ${result.url}`);
          resolve(result.url);
        } catch (uploadErr) {
          logger.error('Failed to store generated pass PDF:', uploadErr);
          reject(uploadErr);
        }
      });

      doc.on('error', (err) => {
        logger.error('PDFKit generation error:', err);
        reject(err);
      });

      // 1. Header & Title
      doc.fontSize(22).font('Helvetica-Bold').text('VISITOR PASS', { align: 'center' }).moveDown(0.5);

      // 2. Pass Number Banner
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#2563eb')
        .text(`Pass #: ${passData.passNumber}`, { align: 'center' })
        .fillColor('#000000')
        .moveDown(0.5);

      // 3. Visitor Photo
      let photoEmbedded = false;
      if (passData.visitor?.photo) {
        try {
          const photoBuffer = await storageService.getFileBuffer(passData.visitor.photo);
          if (photoBuffer && photoBuffer.length > 0) {
            doc.image(photoBuffer, 135, doc.y, { width: 130, height: 130, fit: [130, 130], align: 'center' });
            doc.y += 140;
            photoEmbedded = true;
          }
        } catch (imgErr) {
          logger.warn(`Could not load visitor photo for PDF (${passData.visitor?.photo}): ${imgErr.message}`);
        }
      }

      if (!photoEmbedded) {
        doc.moveDown(0.5);
      }

      // 4. Visitor & Validity Details
      doc.fontSize(12).font('Helvetica-Bold').text('Visitor Details:', { underline: true }).moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Name: ${passData.visitor?.name || 'N/A'}`);
      doc.text(`Company: ${passData.visitor?.company || 'N/A'}`);
      doc.text(`Host: ${passData.host?.name || 'N/A'} (${passData.host?.department || 'Staff'})`);
      doc.text(`Valid From: ${new Date(passData.validFrom).toLocaleString()}`);
      doc.text(`Valid Until: ${new Date(passData.validUntil).toLocaleString()}`);

      if (passData.accessAreas && passData.accessAreas.length > 0) {
        doc.text(`Access: ${passData.accessAreas.join(', ')}`);
      }

      doc.moveDown(0.5);

      // 5. QR Code
      if (qrCodeDataURL) {
        try {
          const base64Data = qrCodeDataURL.replace(/^data:image\/png;base64,/, '');
          const qrBuffer = Buffer.from(base64Data, 'base64');
          doc.image(qrBuffer, 135, doc.y, { width: 130, height: 130, align: 'center' });
          doc.y += 135;
          doc.fontSize(8).fillColor('#6b7280').text('Scan at entrance for entry verification', { align: 'center' });
        } catch (qrErr) {
          logger.warn('Could not embed QR into PDF:', qrErr.message);
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generatePassPDF };
