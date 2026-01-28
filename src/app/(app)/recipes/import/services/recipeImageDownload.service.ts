/**
 * Recipe Image Download Service
 *
 * Downloads external recipe images and saves them to local storage.
 */

import 'server-only';
import { storageService } from '@/src/lib/storage/storage.service';

/**
 * Download an image from a URL and save it to local storage
 *
 * @param imageUrl - External image URL to download
 * @param userId - User ID for organizing files
 * @returns Upload result with local URL and path, or null if download failed
 */
export async function downloadAndSaveRecipeImage(
  imageUrl: string,
  userId: string,
): Promise<{ url: string; path: string } | null> {
  try {
    console.log(
      `[downloadAndSaveRecipeImage] Downloading image from: ${imageUrl}`,
    );

    // Convert relative URLs to absolute URLs
    let absoluteUrl = imageUrl;
    if (imageUrl.startsWith('/')) {
      // Relative URL - we need the source URL to resolve it
      // For now, skip relative URLs as we don't have the base URL
      console.warn(
        `[downloadAndSaveRecipeImage] Skipping relative URL (needs base URL): ${imageUrl}`,
      );
      return null;
    }
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
      // Protocol-relative URL (//example.com/image.jpg)
      absoluteUrl = `https:${imageUrl}`;
    }

    console.log(
      `[downloadAndSaveRecipeImage] Using absolute URL: ${absoluteUrl}`,
    );

    // Fetch the image
    const response = await fetch(absoluteUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(
        `[downloadAndSaveRecipeImage] Failed to fetch image: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    // Get content type
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Check if it's an image
    if (!contentType.startsWith('image/')) {
      console.error(
        `[downloadAndSaveRecipeImage] URL does not point to an image: ${contentType}`,
      );
      return null;
    }

    // Get image as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension from content type
    const extensionMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
    };
    const extension = extensionMap[contentType] || 'jpg';

    // Generate filename from URL or use timestamp
    const urlPath = new URL(imageUrl).pathname;
    const urlFilename = urlPath.split('/').pop() || `recipe-image.${extension}`;
    const sanitizedFilename = urlFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = sanitizedFilename.endsWith(`.${extension}`)
      ? sanitizedFilename
      : `${sanitizedFilename}.${extension}`;

    // Upload to storage (storage service accepts Buffer directly)
    const uploadResult = await storageService.uploadImage(
      buffer, // Pass Buffer directly, storage service handles it
      filename,
      userId,
    );

    console.log(
      `[downloadAndSaveRecipeImage] Image saved successfully: ${uploadResult.url}`,
    );
    return uploadResult;
  } catch (error) {
    console.error(
      `[downloadAndSaveRecipeImage] Error downloading/saving image:`,
      error,
    );
    return null;
  }
}
