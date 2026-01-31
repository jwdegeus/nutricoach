/**
 * Storage Service
 *
 * Handles file storage with support for Vercel Blob (primary) and local filesystem (fallback).
 *
 * Storage Strategy:
 * - Blob (default when BLOB_READ_WRITE_TOKEN is set): Vercel Blob storage, public URLs
 * - Local: Files stored in public/uploads/recipe-images/
 * - Future: Can be extended to support CDN (Cloudflare, etc.) or S3
 */

import 'server-only';
import { put } from '@vercel/blob';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export type StorageProvider = 'blob' | 'local' | 'cdn' | 's3';

export interface StorageConfig {
  provider: StorageProvider;
  baseUrl?: string; // For CDN/S3
  localPath?: string; // For local storage
}

export interface UploadResult {
  url: string;
  path: string;
}

/** Check if a path or URL is a Vercel Blob URL (for delete/display logic). */
export function isVercelBlobUrl(pathOrUrl: string | null | undefined): boolean {
  if (!pathOrUrl) return false;
  return (
    pathOrUrl.startsWith('https://') &&
    pathOrUrl.includes('blob.vercel-storage.com')
  );
}

export class StorageService {
  private config: Omit<StorageConfig, 'provider'> & {
    provider?: StorageProvider;
  };

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      baseUrl: process.env.STORAGE_BASE_URL || undefined,
      localPath:
        process.env.STORAGE_LOCAL_PATH ||
        join(process.cwd(), 'public', 'uploads', 'recipe-images'),
      ...config,
    };
    // Provider is resolved lazily via getter so build (e.g. on Vercel) never
    // runs resolveProvider() when BLOB_READ_WRITE_TOKEN may be unavailable.
  }

  /** Resolve provider from env at runtime so BLOB_READ_WRITE_TOKEN is always respected. */
  private resolveProvider(): StorageProvider {
    const isVercel = process.env.VERCEL === '1';
    const explicit = process.env.STORAGE_PROVIDER?.trim() as
      | StorageProvider
      | undefined;

    // On Vercel, filesystem is read-only – never use local storage
    if (isVercel) {
      if (explicit === 'local') {
        throw new Error(
          'Local storage is not supported on Vercel. Use Blob storage and set BLOB_READ_WRITE_TOKEN in Project Settings → Environment Variables.',
        );
      }
      const hasBlobToken =
        typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' &&
        process.env.BLOB_READ_WRITE_TOKEN.length > 0;
      if (!hasBlobToken) {
        throw new Error(
          'BLOB_READ_WRITE_TOKEN is required on Vercel for image uploads. Add it in Project Settings → Environment Variables (from your Blob store).',
        );
      }
      return 'blob';
    }

    if (explicit === 'blob' || explicit === 'local') return explicit;
    const hasBlobToken =
      typeof process.env.BLOB_READ_WRITE_TOKEN === 'string' &&
      process.env.BLOB_READ_WRITE_TOKEN.length > 0;
    return hasBlobToken ? 'blob' : 'local';
  }

  private get provider(): StorageProvider {
    return this.resolveProvider();
  }

  /**
   * Upload an image file to Vercel Blob (use when BLOB_READ_WRITE_TOKEN is set).
   * Bypasses provider selection so uploads always go to Blob when called.
   */
  async uploadImageToBlob(
    file: Buffer | string,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    return this.uploadBlob(file, filename, userId);
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
    switch (this.provider) {
      case 'blob':
        return this.uploadBlob(file, filename, userId);
      case 'local':
        return this.uploadLocal(file, filename, userId);
      case 'cdn':
        return this.uploadCDN(file, filename, userId);
      case 's3':
        return this.uploadS3(file, filename, userId);
      default:
        throw new Error(`Unsupported storage provider: ${this.provider}`);
    }
  }

  /**
   * Get public URL for a stored file
   *
   * @param path - Storage path
   * @returns Public URL
   */
  getPublicUrl(path: string): string {
    switch (this.provider) {
      case 'blob':
        // Path is already the full Blob URL
        return path;
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
        throw new Error(`Unsupported storage provider: ${this.provider}`);
    }
  }

  /**
   * Upload to Vercel Blob storage (public access).
   */
  private async uploadBlob(
    file: Buffer | string,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const pathname = `recipe-images/${userId}/${timestamp}-${sanitizedFilename}`;
    const fileBuffer =
      typeof file === 'string' ? Buffer.from(file, 'base64') : file;

    const blob = await put(pathname, fileBuffer, {
      access: 'public',
      addRandomSuffix: true,
    });

    // Store the public URL in both url and path so DB and delete route work
    return {
      url: blob.url,
      path: blob.url,
    };
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
    _file: Buffer | string,
    _filename: string,
    _userId: string,
  ): Promise<UploadResult> {
    // TODO: Implement CDN upload (e.g., Cloudflare R2, Cloudinary, etc.)
    throw new Error('CDN storage not yet implemented');
  }

  /**
   * Upload to S3 (future implementation)
   */
  private async uploadS3(
    _file: Buffer | string,
    _filename: string,
    _userId: string,
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
