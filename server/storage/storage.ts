import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_FILES_PER_ORDER = 10;

export interface StoredFileResult {
  originalFilename: string;
  storageFilename: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
}

export class StorageService {
  /**
   * Validates file metadata before processing.
   */
  public static validateFile(mimeType: string, sizeBytes: number): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
      return {
        valid: false,
        error: `Unsupported file format '${mimeType}'. Allowed formats: PDF, JPG, PNG.`,
      };
    }

    if (sizeBytes > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File exceeds maximum limit of 20 MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
      };
    }

    return { valid: true };
  }

  /**
   * Saves a buffer to disk using a cryptographically randomized filename.
   */
  public static saveBuffer(
    originalName: string,
    mimeType: string,
    buffer: Buffer
  ): StoredFileResult {
    const ext = path.extname(originalName) || (mimeType === 'application/pdf' ? '.pdf' : '.jpg');
    // Sanitize extension
    const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 8);
    const randomHex = crypto.randomBytes(16).toString('hex');
    const storageFilename = `${Date.now()}_${randomHex}${cleanExt}`;
    const storagePath = path.join(UPLOAD_DIR, storageFilename);

    fs.writeFileSync(storagePath, buffer);

    return {
      originalFilename: path.basename(originalName).slice(0, 200),
      storageFilename,
      storagePath,
      mimeType,
      fileSizeBytes: buffer.length,
    };
  }

  /**
   * Resolves the absolute file path for a storageFilename.
   * Prevents directory traversal attacks.
   */
  public static resolveFilePath(storageFilename: string): string | null {
    const safeName = path.basename(storageFilename);
    const fullPath = path.join(UPLOAD_DIR, safeName);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fullPath;
  }

  /**
   * Deletes a file from disk.
   */
  public static deleteFile(storageFilename: string): boolean {
    try {
      const fullPath = this.resolveFilePath(storageFilename);
      if (fullPath && fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        return true;
      }
    } catch (e) {
      console.warn(`[STORAGE] Could not delete file ${storageFilename}:`, e);
    }
    return false;
  }
}
