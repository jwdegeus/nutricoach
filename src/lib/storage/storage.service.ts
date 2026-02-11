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
import { promises as dnsPromises } from 'dns';
import { put } from '@vercel/blob';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/** SSRF: only allow this many redirects when fetching pantry product images */
const MAX_PANTRY_IMAGE_REDIRECTS = 3;
/** DNS resolution timeout for hostname validation (Node dns has no built-in timeout) */
const DNS_TIMEOUT_MS = 10_000;

/** Private / loopback / link-local / CGNAT / multicast (IPv4 + IPv6) */
const PRIVATE_IP_RANGES: { start: string; end: string }[] = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '100.64.0.0', end: '100.127.255.255' }, // CGNAT
  { start: '224.0.0.0', end: '239.255.255.255' }, // IPv4 multicast
  { start: '::1', end: '::1' },
  { start: 'fc00::', end: 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },
  { start: 'fe80::', end: 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff' },
];

function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  if (trimmed.includes(':')) {
    if (trimmed === '::1') return true;
    if (trimmed.startsWith('fe80:')) return true;
    if (trimmed.startsWith('fc') || trimmed.startsWith('fd')) return true;
    if (trimmed.startsWith('ff')) return true; // IPv6 multicast
    return false;
  }
  const parts = trimmed.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  for (const range of PRIVATE_IP_RANGES) {
    if (range.start.includes(':')) continue;
    const [s1, s2, s3, s4] = range.start.split('.').map(Number);
    const [e1, e2, e3, e4] = range.end.split('.').map(Number);
    if (
      parts[0] >= s1 &&
      parts[0] <= e1 &&
      parts[1] >= s2 &&
      parts[1] <= e2 &&
      parts[2] >= s3 &&
      parts[2] <= e3 &&
      parts[3] >= s4 &&
      parts[3] <= e4
    )
      return true;
  }
  return false;
}

/** Resolve hostname (A + AAAA) and reject if any address is private/loopback/multicast. */
async function resolveAndValidateHostname(host: string): Promise<void> {
  const [addrs4, addrs6] = await Promise.all([
    dnsPromises.resolve4(host).catch(() => [] as string[]),
    dnsPromises.resolve6(host).catch(() => [] as string[]),
  ]);
  const all = [...addrs4, ...addrs6];
  for (const addr of all) {
    if (isPrivateIp(addr)) {
      throw new Error(`SSRF: host resolves to private IP`);
    }
  }
}

/** Run resolveAndValidateHostname with a timeout. */
function resolveAndValidateHostnameWithTimeout(host: string): Promise<void> {
  return Promise.race([
    resolveAndValidateHostname(host),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS_TIMEOUT')), DNS_TIMEOUT_MS),
    ),
  ]);
}

/** Reject if URL is not absolute HTTPS or host resolves to private IP. */
async function assertSafePublicUrl(url: URL): Promise<void> {
  if (url.protocol !== 'https:') {
    throw new Error('NOT_HTTPS');
  }
  await resolveAndValidateHostnameWithTimeout(url.hostname);
}

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

/** Structured failure codes for pantry product image mirroring (no PII in payload). */
export type MirrorFailCode =
  | 'INVALID_URL'
  | 'NOT_HTTPS'
  | 'DNS_TIMEOUT'
  | 'DNS_UNSAFE_IP'
  | 'TOO_MANY_REDIRECTS'
  | 'INVALID_REDIRECT'
  | 'FETCH_ERROR'
  | 'NOT_IMAGE'
  | 'TOO_LARGE'
  | 'UPLOAD_ERROR';

export type UploadPantryProductImageResult =
  | UploadResult
  | { url: null; code: MirrorFailCode };

function mirrorFailCodeFromError(err: unknown): MirrorFailCode {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'NOT_HTTPS') return 'NOT_HTTPS';
  if (msg === 'DNS_TIMEOUT') return 'DNS_TIMEOUT';
  if (msg.includes('private IP')) return 'DNS_UNSAFE_IP';
  return 'INVALID_REDIRECT';
}

function logMirrorFail(code: MirrorFailCode, host: string): void {
  console.warn(`mirror_fail code=${code} host=${host}`);
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
    return this.uploadBlob(file, filename, userId, 'recipe-images');
  }

  /**
   * Upload pantry product image to Vercel Blob.
   * Path: pantry-images/{userId}/{timestamp}-{filename}
   */
  async uploadPantryImageToBlob(
    file: Buffer | string,
    filename: string,
    userId: string,
    pantryItemId?: string,
  ): Promise<UploadResult> {
    const prefix = pantryItemId
      ? `pantry-images/${userId}/${pantryItemId}`
      : `pantry-images/${userId}`;
    return this.uploadBlob(file, filename, userId, prefix, pantryItemId);
  }

  /**
   * Fetch an image from an external URL (e.g. Open Food Facts, Albert Heijn)
   * and upload it to Vercel Blob under a dedicated prefix so product images
   * stay separate from user-uploaded pantry images.
   * Path: pantry-product-images/{userId}/{timestamp}-{slug}.{ext}
   * SSRF-hardened: https-only, DNS/private-IP block, redirects re-validated (max 3).
   * Returns structured result; on failure logs mirror_fail code= host= (no PII/URL).
   *
   * @param externalUrl - Full URL of the product image
   * @param userId - Current user id for path
   * @param slug - Safe filename segment (e.g. barcode-source)
   * @returns UploadResult on success, or { url: null, code: MirrorFailCode } on failure
   */
  async uploadPantryProductImageFromUrl(
    externalUrl: string,
    userId: string,
    slug: string,
  ): Promise<UploadPantryProductImageResult> {
    const maxBytes = 5 * 1024 * 1024; // 5MB
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(externalUrl);
    } catch {
      logMirrorFail('INVALID_URL', '?');
      return { url: null, code: 'INVALID_URL' };
    }
    if (!parsedUrl.protocol || parsedUrl.hostname === '') {
      logMirrorFail('INVALID_URL', parsedUrl.hostname || '?');
      return { url: null, code: 'INVALID_URL' };
    }
    const safeHostForLog = parsedUrl.hostname;

    try {
      await assertSafePublicUrl(parsedUrl);
    } catch (err) {
      const code = mirrorFailCodeFromError(err);
      logMirrorFail(code, safeHostForLog);
      return { url: null, code };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let currentUrl = externalUrl;
    let res: Response | null = null;

    try {
      for (
        let redirectCount = 0;
        redirectCount <= MAX_PANTRY_IMAGE_REDIRECTS;
        redirectCount++
      ) {
        try {
          await assertSafePublicUrl(new URL(currentUrl));
        } catch (err) {
          clearTimeout(timeout);
          const code = mirrorFailCodeFromError(err);
          const redirectHost = (() => {
            try {
              return new URL(currentUrl).hostname;
            } catch {
              return '?';
            }
          })();
          logMirrorFail(code, redirectHost);
          return { url: null, code: 'INVALID_REDIRECT' };
        }

        const response = await fetch(currentUrl, {
          signal: controller.signal,
          headers: { Accept: 'image/*' },
          redirect: 'manual',
        });

        if (response.status >= 300 && response.status < 400) {
          if (redirectCount === MAX_PANTRY_IMAGE_REDIRECTS) {
            clearTimeout(timeout);
            logMirrorFail('TOO_MANY_REDIRECTS', new URL(currentUrl).hostname);
            return { url: null, code: 'TOO_MANY_REDIRECTS' };
          }
          const location = response.headers.get('location');
          if (!location || location.trim() === '') {
            clearTimeout(timeout);
            logMirrorFail('INVALID_REDIRECT', new URL(currentUrl).hostname);
            return { url: null, code: 'INVALID_REDIRECT' };
          }
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, currentUrl);
          } catch {
            clearTimeout(timeout);
            logMirrorFail('INVALID_REDIRECT', new URL(currentUrl).hostname);
            return { url: null, code: 'INVALID_REDIRECT' };
          }
          if (nextUrl.hostname === '') {
            clearTimeout(timeout);
            logMirrorFail('INVALID_REDIRECT', '?');
            return { url: null, code: 'INVALID_REDIRECT' };
          }
          try {
            await assertSafePublicUrl(nextUrl);
          } catch (err) {
            clearTimeout(timeout);
            const code = mirrorFailCodeFromError(err);
            logMirrorFail(code, nextUrl.hostname);
            return { url: null, code: 'INVALID_REDIRECT' };
          }
          currentUrl = nextUrl.href;
          continue;
        }

        if (!response.ok || !response.body) {
          clearTimeout(timeout);
          logMirrorFail('FETCH_ERROR', new URL(currentUrl).hostname);
          return { url: null, code: 'FETCH_ERROR' };
        }
        res = response;
        break;
      }

      clearTimeout(timeout);
      if (!res || !res.body) {
        logMirrorFail('FETCH_ERROR', safeHostForLog);
        return { url: null, code: 'FETCH_ERROR' };
      }

      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!contentType.startsWith('image/')) {
        logMirrorFail('NOT_IMAGE', safeHostForLog);
        return { url: null, code: 'NOT_IMAGE' };
      }

      const ext = contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : contentType.includes('gif')
            ? 'gif'
            : 'jpg';
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          logMirrorFail('TOO_LARGE', safeHostForLog);
          return { url: null, code: 'TOO_LARGE' };
        }
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks);
      const filename = `${this.sanitizeFilename(slug)}.${ext}`;
      try {
        return await this.uploadBlob(
          buffer,
          filename,
          userId,
          'pantry-product-images',
          userId,
        );
      } catch {
        logMirrorFail('UPLOAD_ERROR', safeHostForLog);
        return { url: null, code: 'UPLOAD_ERROR' };
      }
    } catch (_err) {
      clearTimeout(timeout);
      const host = (() => {
        try {
          return new URL(currentUrl).hostname;
        } catch {
          return '?';
        }
      })();
      logMirrorFail('FETCH_ERROR', host);
      return { url: null, code: 'FETCH_ERROR' };
    }
  }

  /**
   * Legacy wrapper: returns blob URL string or null. Prefer uploadPantryProductImageFromUrl for observability.
   */
  async uploadPantryProductImageFromUrlLegacy(
    externalUrl: string,
    userId: string,
    slug: string,
  ): Promise<string | null> {
    const res = await this.uploadPantryProductImageFromUrl(
      externalUrl,
      userId,
      slug,
    );
    return res.url;
  }

  /**
   * Upload avatar for account (user). Path: avatars/account/{userId}/...
   */
  async uploadAvatarForAccount(
    file: Buffer | string,
    filename: string,
    userId: string,
  ): Promise<UploadResult> {
    if (this.provider === 'blob') {
      return this.uploadBlob(file, filename, userId, 'avatars/account', userId);
    }
    return this.uploadLocalAvatar(file, filename, 'account', userId);
  }

  /**
   * Upload avatar for a family member. Path: avatars/family/{memberId}/...
   */
  async uploadAvatarForFamilyMember(
    file: Buffer | string,
    filename: string,
    userId: string,
    familyMemberId: string,
  ): Promise<UploadResult> {
    if (this.provider === 'blob') {
      return this.uploadBlob(
        file,
        filename,
        userId,
        'avatars/family',
        familyMemberId,
      );
    }
    return this.uploadLocalAvatar(file, filename, 'family', familyMemberId);
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
        return this.uploadBlob(file, filename, userId, 'recipe-images');
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
   * @param pathPrefix - e.g. 'recipe-images', 'avatars/account', 'avatars/family'
   * @param ownerId - user_id or family_member_id for path segment
   */
  private async uploadBlob(
    file: Buffer | string,
    filename: string,
    userId: string,
    pathPrefix = 'recipe-images',
    ownerId?: string,
  ): Promise<UploadResult> {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const id = ownerId ?? userId;
    const pathname = `${pathPrefix}/${id}/${timestamp}-${sanitizedFilename}`;
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

  /** Base dir for local avatar uploads (sibling of recipe-images). */
  private get avatarLocalPath(): string {
    const base =
      this.config.localPath ?? join(process.cwd(), 'public', 'uploads');
    return join(base, '..', 'avatars');
  }

  /**
   * Upload avatar to local filesystem (account or family subdir).
   */
  private async uploadLocalAvatar(
    file: Buffer | string,
    filename: string,
    scope: 'account' | 'family',
    ownerId: string,
  ): Promise<UploadResult> {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const timestamp = Date.now();
    const finalFilename = `${timestamp}-${sanitizedFilename}`;
    const dir = join(this.avatarLocalPath, scope, ownerId);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const filePath = join(dir, finalFilename);
    const fileBuffer =
      typeof file === 'string' ? Buffer.from(file, 'base64') : file;
    await writeFile(filePath, fileBuffer);
    const publicPath = filePath.replace(join(process.cwd(), 'public'), '');
    const url = publicPath.startsWith('/') ? publicPath : `/${publicPath}`;
    return { url, path: filePath };
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
