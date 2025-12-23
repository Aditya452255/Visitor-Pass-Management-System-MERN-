const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary for visitor photos
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'visitor-pass-system/visitor-photos',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png']
  }
});

const photoFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(file.originalname.split('.').pop().toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (mimetype && extname) return cb(null, true);
  return cb(new Error('Only JPG, JPEG, and PNG images are allowed'));
};

const uploadVisitorPhotoCloudinary = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: photoFileFilter
});

module.exports = uploadVisitorPhotoCloudinary;
