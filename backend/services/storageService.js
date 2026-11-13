const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { logger } = require('../utils/logger');

// Local uploads directory
const LOCAL_UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
  fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
}

class StorageService {
  constructor() {
    this.provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
    this.bucket = process.env.AWS_S3_BUCKET;
    this.region = process.env.AWS_REGION || 'us-east-1';

    if (this.provider === 's3') {
      if (!this.bucket) {
        logger.warn('STORAGE_PROVIDER is set to "s3" but AWS_S3_BUCKET is not defined. Falling back to local storage.');
        this.provider = 'local';
      } else {
        // AWS SDK v3: If credentials not explicitly passed, automatically uses IAM Instance Profile on EC2
        const s3Config = { region: this.region };
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
          s3Config.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          };
        }
        this.s3Client = new S3Client(s3Config);
        logger.info(`✓ S3 Storage initialized with bucket: ${this.bucket} in region ${this.region}`);
      }
    }

    if (this.provider === 'local') {
      logger.info('✓ Local disk storage provider active');
    }
  }

  /**
   * Upload a file buffer to storage
   * @param {Object} params
   * @param {Buffer} params.buffer - File buffer
   * @param {string} params.originalname - Original filename
   * @param {string} params.mimetype - MIME type
   * @param {string} [params.folder] - Destination folder / prefix
   * @returns {Promise<{ key: string, url: string }>}
   */
  async uploadFile({ buffer, originalname, mimetype, folder = 'uploads' }) {
    const ext = path.extname(originalname || '').toLowerCase();
    const safeBase = path.basename(originalname || 'file', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${safeBase}-${uniqueSuffix}${ext}`;
    const key = `${folder}/${filename}`.replace(/^\/+/, '');

    if (this.provider === 's3') {
      try {
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimetype || 'application/octet-stream'
        });
        await this.s3Client.send(command);

        // Generate an initial presigned URL for immediate consumption
        const url = await this.getPresignedUrl(key, 86400); // 24 hours
        return { key, url };
      } catch (err) {
        logger.error(`S3 upload error for key ${key}:`, err);
        throw new Error(`Failed to upload file to S3: ${err.message}`);
      }
    } else {
      // Local storage
      const destDir = path.join(LOCAL_UPLOADS_DIR, folder);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      const filePath = path.join(destDir, filename);
      await fs.promises.writeFile(filePath, buffer);

      const url = `/uploads/${folder}/${filename}`;
      return { key, url };
    }
  }

  /**
   * Get accessible URL for a storage key
   * Returns a presigned URL if S3, or relative / absolute path if local
   */
  async getPresignedUrl(key, expiresInSeconds = 3600) {
    if (!key) return null;

    // If key is already a full HTTPS URL (e.g. from Cloudinary legacy data)
    if (/^https?:\/\//i.test(key)) {
      return key;
    }

    if (this.provider === 's3') {
      try {
        const cleanKey = key.replace(/^\/+/, '');
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey
        });
        return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
      } catch (err) {
        logger.warn(`Failed to generate presigned URL for ${key}:`, err.message);
        return null;
      }
    } else {
      // Local: if it doesn't already start with /uploads, prepend it
      let relative = key.startsWith('/') ? key : `/${key}`;
      if (!relative.startsWith('/uploads/')) {
        relative = `/uploads/${key.replace(/^\/+/, '')}`;
      }
      return relative;
    }
  }

  /**
   * Retrieve file as Buffer (used for PDF badge generation when embedding images)
   */
  async getFileBuffer(keyOrUrl) {
    if (!keyOrUrl) return null;

    // Handle local file paths
    if (this.provider === 'local' || !this.s3Client) {
      let localPath = keyOrUrl;
      if (keyOrUrl.startsWith('/uploads/')) {
        localPath = path.join(LOCAL_UPLOADS_DIR, keyOrUrl.replace(/^\/uploads\//, ''));
      } else if (!path.isAbsolute(keyOrUrl)) {
        localPath = path.join(LOCAL_UPLOADS_DIR, keyOrUrl);
      }
      if (fs.existsSync(localPath)) {
        return await fs.promises.readFile(localPath);
      }
    }

    // Handle S3 storage
    if (this.provider === 's3' && this.s3Client) {
      try {
        const cleanKey = keyOrUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey
        });
        const response = await this.s3Client.send(command);
        const streamToBuffer = async (stream) => {
          const chunks = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }
          return Buffer.concat(chunks);
        };
        return await streamToBuffer(response.Body);
      } catch (err) {
        logger.warn(`Failed to retrieve S3 buffer for ${keyOrUrl}:`, err.message);
      }
    }

    // Fallback: if it's an external URL (e.g. Cloudinary legacy URL), fetch it via standard HTTP
    if (/^https?:\/\//i.test(keyOrUrl)) {
      try {
        const res = await fetch(keyOrUrl);
        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (e) {
        logger.warn(`Failed to fetch remote image URL ${keyOrUrl}:`, e.message);
      }
    }

    return null;
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(keyOrUrl) {
    if (!keyOrUrl) return;

    if (this.provider === 's3' && this.s3Client) {
      try {
        const cleanKey = keyOrUrl.replace(/^https?:\/\/[^/]+\//, '').replace(/^\/+/, '');
        const command = new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: cleanKey
        });
        await this.s3Client.send(command);
        logger.info(`Deleted file from S3: ${cleanKey}`);
      } catch (err) {
        logger.warn(`Failed to delete S3 file ${keyOrUrl}:`, err.message);
      }
    } else {
      let localPath = keyOrUrl;
      if (keyOrUrl.startsWith('/uploads/')) {
        localPath = path.join(LOCAL_UPLOADS_DIR, keyOrUrl.replace(/^\/uploads\//, ''));
      } else if (!path.isAbsolute(keyOrUrl)) {
        localPath = path.join(LOCAL_UPLOADS_DIR, keyOrUrl);
      }
      if (fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
          logger.info(`Deleted local file: ${localPath}`);
        } catch (err) {
          logger.warn(`Failed to delete local file ${localPath}:`, err.message);
        }
      }
    }
  }
}

const storageService = new StorageService();

module.exports = storageService;

