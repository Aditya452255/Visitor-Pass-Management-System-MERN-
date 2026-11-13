const { test, describe } = require('node:test');
const assert = require('node:assert');
const storageService = require('../services/storageService');
const { validateImageFile } = require('../middleware/uploadMiddleware');

describe('File Storage Service Tests', () => {
  test('Storage service supports local disk upload and retrieval', async () => {
    const testContent = Buffer.from('test image content binary data');
    const uploadResult = await storageService.uploadFile({
      buffer: testContent,
      originalname: 'visitor-test.jpg',
      mimetype: 'image/jpeg',
      folder: 'test-uploads'
    });

    assert.ok(uploadResult.key);
    assert.ok(uploadResult.url);
    assert.strictEqual(uploadResult.key.startsWith('test-uploads/'), true);

    // Retrieve file buffer
    const retrievedBuffer = await storageService.getFileBuffer(uploadResult.url);
    assert.ok(retrievedBuffer);
    assert.strictEqual(retrievedBuffer.toString(), testContent.toString());

    // Generate URL
    const presigned = await storageService.getPresignedUrl(uploadResult.key);
    assert.ok(presigned);

    // Clean up
    await storageService.deleteFile(uploadResult.key);
    const afterDelete = await storageService.getFileBuffer(uploadResult.url);
    assert.strictEqual(afterDelete, null);
  });

  test('validateImageFile rejects files larger than 5MB', () => {
    const oversizedFile = {
      size: 6 * 1024 * 1024,
      mimetype: 'image/jpeg'
    };
    assert.throws(() => {
      validateImageFile(oversizedFile);
    }, /5MB/);
  });

  test('validateImageFile rejects disallowed MIME types', () => {
    const executableFile = {
      size: 1024,
      mimetype: 'application/x-msdownload'
    };
    assert.throws(() => {
      validateImageFile(executableFile);
    }, /Invalid file type/);
  });

  test('validateImageFile accepts valid JPEG and PNG', () => {
    const validJpeg = { size: 1024 * 100, mimetype: 'image/jpeg' };
    const validPng = { size: 1024 * 100, mimetype: 'image/png' };
    assert.doesNotThrow(() => validateImageFile(validJpeg));
    assert.doesNotThrow(() => validateImageFile(validPng));
  });
});

