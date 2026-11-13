const multer = require('multer');
const path = require('path');
const storageService = require('../services/storageService');

// Use memory storage so file buffers can be routed to either local disk or S3
const memoryStorage = multer.memoryStorage();

// File filter for images (JPEG, JPG, PNG, WEBP)
const imageFilter = (req, file, cb) => {
  const allowedExts = /jpeg|jpg|png|webp/;
  const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
  const mimetype = /image\/(jpeg|jpg|png|webp)/.test(file.mimetype);

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, JPEG, PNG, and WEBP image files are allowed.'));
  }
};

// General filter for images and PDFs
const imageAndPdfFilter = (req, file, cb) => {
  const allowedExts = /jpeg|jpg|png|webp|pdf/;
  const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
  const mimetype = /image\/(jpeg|jpg|png|webp)|application\/pdf/.test(file.mimetype);

  if (mimetype && extname) {
    cb(null, true);
  } else {
    cb(new Error('Only image and PDF files are allowed.'));
  }
};

const uploadPhoto = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: imageFilter
});

const uploadDocument = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: imageAndPdfFilter
});

/**
 * Express middleware helper to upload req.file through storageService
 * Attaches storage result { key, url } to req.file
 * @param {string} folderPrefix
 */
const processUploadedFile = (folderPrefix = 'uploads') => {
  return async (req, res, next) => {
    if (!req.file) {
      return next();
    }
    try {
      const result = await storageService.uploadFile({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        folder: folderPrefix
      });
      // Attach storage metadata to req.file so existing controller access works
      req.file.key = result.key;
      req.file.url = result.url;
      req.file.path = result.url;
      req.file.secure_url = result.url;
      next();
    } catch (err) {
      next(err);
    }
  };
};

const validateImageFile = (file) => {
  if (!file) throw new Error('No file provided');
  if (file.size > 5 * 1024 * 1024) throw new Error('File exceeds maximum size of 5MB');
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) throw new Error('Invalid file type. Only JPG, JPEG, PNG, and WEBP allowed.');
  return true;
};

module.exports = {
  uploadPhoto,
  uploadDocument,
  processUploadedFile,
  validateImageFile
};

