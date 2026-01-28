/**
 * Storage Service
 *
 * Handles file storage with support for local filesystem (now) and future CDN/S3 support.
 *
 * Storage Strategy:
 * - Local: Files stored in public/uploads/recipe-images/
 * - Future: Can be extended to support CDN (Cloudflare, etc.) or S3
 */

import 'server-only';
import { writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export type StorageProvider = 'local' | 'cdn' | 's3';

export interface StorageConfig {
  provider: StorageProvider;
  baseUrl?: string; // For CDN/S3
  localPath?: string; // For local storage
}

export interface UploadResult {
  url: string;
  path: string;
}

export class StorageService {
  private config: StorageConfig;

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      provider: (process.env.STORAGE_PROVIDER as StorageProvider) || 'local',
      baseUrl: process.env.STORAGE_BASE_URL || undefined,
      localPath:
        process.env.STORAGE_LOCAL_PATH ||
        join(process.cwd(), 'public', 'uploads', 'recipe-images'),
      ...config,
    };
  }

  /**
   * Upload an image file
   *
   * @param file - File buffer or base64 data
   * @param filename - Filename (will be sanitized)
   * @param userId - User ID for organizing files
   * @returns Upload result with URL and path
   */
  async uploadImage(
    file: Buffer | string,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    switch (this.config.provider) {
      case 'local':
        return this.uploadLocal(file, filename, userId);
      case 'cdn':
        return this.uploadCDN(file, filename, userId);
      case 's3':
        return this.uploadS3(file, filename, userId);
      default:
        throw new Error(
          `Unsupported storage provider: ${this.config.provider}`,
        );
    }
  }

  /**
   * Get public URL for a stored file
   *
   * @param path - Storage path
   * @returns Public URL
   */
  getPublicUrl(path: string): string {
    switch (this.config.provider) {
      case 'local':
        // For local storage, return relative path from public directory
        // Remove process.cwd() and ensure it starts with /
        let relativePath = path;
        if (path.includes(process.cwd())) {
          relativePath = path.replace(process.cwd(), '');
        }
        // Ensure it starts with /uploads (not /public/uploads since public is served at root)
        if (relativePath.includes('public')) {
          relativePath = relativePath.replace(/^.*?public/, '');
        }
        return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
      case 'cdn':
      case 's3':
        return this.config.baseUrl ? `${this.config.baseUrl}/${path}` : path;
      default:
        throw new Error(
          `Unsupported storage provider: ${this.config.provider}`,
        );
    }
  }

  /**
   * Upload to local filesystem
   */
  private async uploadLocal(
    file: Buffer | string,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    // Sanitize filename
    const sanitizedFilename = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const finalFilename = `${timestamp}-${sanitizedFilename}`;

    // Create user directory if it doesn't exist
    const userDir = join(this.config.localPath!, userId);
    if (!existsSync(userDir)) {
      await mkdir(userDir, { recursive: true });
    }

    // Write file
    const filePath = join(userDir, finalFilename);
    const fileBuffer =
      typeof file === 'string' ? Buffer.from(file, 'base64') : file;
    await writeFile(filePath, fileBuffer);

    // Return relative path from public directory for URL
    // Files are stored in public/uploads/recipe-images/{userId}/{filename}
    // So the URL should be /uploads/recipe-images/{userId}/{filename}
    const publicPath = filePath.replace(join(process.cwd(), 'public'), '');
    const url = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;

    return {
      url,
      path: filePath,
    };
  }

  /**
   * Upload to CDN (future implementation)
   */
  private async uploadCDN(
    file: Buffer | string,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    // TODO: Implement CDN upload (e.g., Cloudflare R2, Cloudinary, etc.)
    throw new Error('CDN storage not yet implemented');
  }

  /**
   * Upload to S3 (future implementation)
   */
  private async uploadS3(
    file: Buffer | string,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    // TODO: Implement S3 upload
    throw new Error('S3 storage not yet implemented');
  }

  /**
   * Sanitize filename to prevent path traversal and invalid characters
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/\.\./g, '_')
      .substring(0, 100); // Limit length
  }
}

/**
 * Default storage service instance
 */
export const storageService = new StorageService();
