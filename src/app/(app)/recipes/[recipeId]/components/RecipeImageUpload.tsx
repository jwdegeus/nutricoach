'use client';

import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/catalyst/button';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { Text } from '@/components/catalyst/text';
import { PhotoIcon, TrashIcon } from '@heroicons/react/20/solid';
import { ImageLightbox } from './ImageLightbox';

type RecipeImageUploadProps = {
  mealId: string;
  source: 'custom' | 'gemini';
  currentImageUrl: string | null;
  onImageUploaded: (imageUrl: string) => void;
  onImageRemoved?: () => void;
  onImageClick?: () => void;
};

export function RecipeImageUpload({
  mealId,
  source,
  currentImageUrl,
  onImageUploaded,
  onImageRemoved,
  onImageClick,
}: RecipeImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update previewUrl when currentImageUrl changes
  useEffect(() => {
    console.log('[RecipeImageUpload] currentImageUrl changed:', {
      mealId,
      currentImageUrl,
      currentImageUrlType: typeof currentImageUrl,
      currentImageUrlString: String(currentImageUrl),
      previous: previewUrl,
    });
    // Ensure we use the string value, not an object
    const imageUrlString =
      currentImageUrl && typeof currentImageUrl === 'string'
        ? currentImageUrl.trim()
        : currentImageUrl
          ? String(currentImageUrl).trim()
          : null;

    // Validate and normalize URL format
    if (imageUrlString) {
      try {
        // Check if it's a valid URL (absolute) or a valid path (relative)
        const isAbsoluteUrl =
          imageUrlString.startsWith('http://') ||
          imageUrlString.startsWith('https://');
        const isDataUrl = imageUrlString.startsWith('data:');
        const isRelativePath = imageUrlString.startsWith('/');

        if (!isAbsoluteUrl && !isDataUrl && !isRelativePath) {
          console.warn(
            '[RecipeImageUpload] Invalid image URL format:',
            imageUrlString,
          );
          setImageLoadError(true);
          setPreviewUrl(null);
          return;
        }

        // Filter out tracking pixels and other non-image URLs
        const lowerUrl = imageUrlString.toLowerCase();
        const isTrackingPixel =
          lowerUrl.includes('facebook.com/tr') ||
          lowerUrl.includes('google-analytics.com') ||
          lowerUrl.includes('googletagmanager.com') ||
          lowerUrl.includes('doubleclick.net') ||
          lowerUrl.includes('analytics') ||
          lowerUrl.includes('tracking') ||
          lowerUrl.includes('pixel') ||
          lowerUrl.includes('beacon') ||
          lowerUrl.includes('noscript') ||
          lowerUrl.includes('amp;') || // HTML entities in URL (like &amp;)
          (lowerUrl.includes('?') &&
            !lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)); // Query params without image extension

        if (isTrackingPixel) {
          console.warn(
            '[RecipeImageUpload] Filtered out tracking pixel or non-image URL:',
            imageUrlString,
          );
          setImageLoadError(true);
          setPreviewUrl(null);
          return;
        }

        // For relative paths, ensure they're properly formatted
        // (they should already be correct from storage service, but double-check)
        let normalizedUrl = imageUrlString;
        if (isRelativePath && !normalizedUrl.startsWith('/')) {
          normalizedUrl = `/${normalizedUrl}`;
        }

        console.log('[RecipeImageUpload] Setting preview URL:', {
          original: imageUrlString,
          normalized: normalizedUrl,
          isAbsoluteUrl,
          isDataUrl,
          isRelativePath,
        });

        setPreviewUrl(normalizedUrl);
      } catch (e) {
        console.warn('[RecipeImageUpload] Error validating URL:', e);
        setImageLoadError(true);
        setPreviewUrl(null);
        return;
      }
    } else {
      setPreviewUrl(null);
    }

    setImageLoadError(false); // Reset error state when URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewUrl is derived in this effect, omit to avoid loop
  }, [currentImageUrl, mealId]);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Alleen afbeeldingen zijn toegestaan');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Afbeelding is te groot (max 10MB)');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Convert to base64
      const base64 = await fileToBase64(file);

      // Upload via action
      const response = await fetch('/api/recipes/upload-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mealId,
          source,
          imageData: base64,
          filename: file.name,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Upload mislukt');
      }

      // Update preview
      setPreviewUrl(result.data.url);
      setImageLoadError(false); // Reset error state on successful upload
      onImageUploaded(result.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload mislukt');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    setError(null);
    setDeleteDialogOpen(false);

    try {
      const response = await fetch('/api/recipes/delete-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mealId,
          source,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || 'Verwijderen mislukt');
      }

      // Clear preview
      setPreviewUrl(null);
      setImageLoadError(false); // Reset error state on deletion
      if (onImageRemoved) {
        onImageRemoved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt');
    } finally {
      setIsDeleting(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleClick = () => {
    if (previewUrl && !isUploading && !imageLoadError) {
      if (onImageClick) {
        onImageClick();
      } else {
        setLightboxOpen(true);
      }
    } else if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="mt-4 min-w-0 max-w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {previewUrl ? (
        <div>
          <button
            onClick={handleClick}
            className="block cursor-pointer hover:opacity-90 transition-opacity"
            disabled={isUploading || isDeleting}
          >
            {!imageLoadError ? (
              <span className="relative block max-h-48 w-full min-h-[120px]">
                <Image
                  src={previewUrl}
                  alt="Recept foto"
                  fill
                  className="rounded-lg object-contain shadow-sm hover:shadow-md transition-shadow"
                  sizes="(max-width: 768px) 100vw, 320px"
                  unoptimized
                  onError={() => setImageLoadError(true)}
                />
              </span>
            ) : (
              <div className="rounded-lg max-w-full h-48 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-700">
                <div className="text-center p-4">
                  <PhotoIcon className="h-12 w-12 text-zinc-400 dark:text-zinc-500 mx-auto mb-2" />
                  <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                    Afbeelding kon niet worden geladen
                  </Text>
                  {previewUrl && (
                    <Text className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 break-all">
                      {previewUrl.length > 50
                        ? `${previewUrl.substring(0, 50)}...`
                        : previewUrl}
                    </Text>
                  )}
                </div>
              </div>
            )}
          </button>
          <div className="mt-2 flex items-center gap-2">
            <Button
              plain
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isDeleting}
              className="text-sm"
            >
              Vervangen
            </Button>
            <Button
              plain
              onClick={handleDeleteClick}
              disabled={isUploading || isDeleting}
              className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              <TrashIcon className="h-4 w-4 mr-1" />
              Verwijderen
            </Button>
            {error && (
              <span className="text-sm text-red-600 dark:text-red-400">
                {error}
              </span>
            )}
          </div>
          {!imageLoadError && previewUrl && (
            <ImageLightbox
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              imageUrl={previewUrl}
              alt="Recept foto"
            />
          )}
          <ConfirmDialog
            open={deleteDialogOpen}
            onClose={() => setDeleteDialogOpen(false)}
            onConfirm={handleDeleteConfirm}
            title="Afbeelding verwijderen"
            description="Weet je zeker dat je deze afbeelding wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt."
            confirmLabel="Verwijderen"
            cancelLabel="Annuleren"
            confirmColor="red"
            isLoading={isDeleting}
          />
        </div>
      ) : (
        <div>
          <button
            onClick={handleClick}
            disabled={isUploading}
            className="w-full min-w-0 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-6 sm:p-8 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50 box-border"
          >
            <PhotoIcon className="h-12 w-12 shrink-0 text-zinc-400 dark:text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400 text-center break-words">
              {isUploading ? 'Uploaden...' : 'Upload foto van eindresultaat'}
            </span>
          </button>
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
