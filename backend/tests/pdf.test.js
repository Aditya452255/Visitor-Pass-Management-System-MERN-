const { test, describe } = require('node:test');
const assert = require('node:assert');
const { generatePassPDF } = require('../utils/pdfGenerator');
const storageService = require('../services/storageService');

describe('Pass PDF Generator Tests', () => {
  test('generatePassPDF creates a valid PDF badge', async () => {
    const mockPass = {
      passNumber: 'VP-TEST-9999',
      visitor: {
        name: 'Jane Doe',
        company: 'Cloud Corp',
        phone: '+1-555-0199',
        photo: null
      },
      host: {
        name: 'Dr. John Smith',
        department: 'Engineering'
      },
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 4 * 3600000),
      accessAreas: ['Floor 1 Reception', 'Data Center'],
      specialInstructions: 'Safety helmet required',
      status: 'active'
    };

    const pdfPath = await generatePassPDF(mockPass);
    assert.ok(pdfPath);
    assert.strictEqual(typeof pdfPath, 'string');
    assert.strictEqual(pdfPath.includes('.pdf'), true);

    // Verify the PDF file exists and has %PDF magic bytes
    const buffer = await storageService.getFileBuffer(pdfPath);
    assert.ok(buffer);
    assert.strictEqual(buffer.subarray(0, 4).toString(), '%PDF');

    // Clean up
    await storageService.deleteFile(pdfPath);
  });
});

