'use client';

import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/catalyst/button';
import { ConfirmDialog } from '@/components/catalyst/confirm-dialog';
import { Text } from '@/components/catalyst/text';
import {
  PhotoIcon,
  TrashIcon,
  SparklesIcon,
  ArrowPathIcon,
} from '@heroicons/react/20/solid';
import { ImageLightbox } from './ImageLightbox';

type RecipeImageUploadProps = {
  mealId: string;
  source: 'custom' | 'gemini';
  currentImageUrl: string | null;
  onImageUploaded: (imageUrl: string) => void;
  onImageRemoved?: () => void;
  onImageClick?: () => void;
  /** Optional recipe context for AI image generation (name + short summary). */
  recipeContext?: { name: string; summary?: string };
  /** When true, render as hero image (full width, larger) with overlay buttons. Use at top of recipe card. */
  renderHero?: boolean;
};

export function RecipeImageUpload({
  mealId,
  source,
  currentImageUrl,
  onImageUploaded,
  onImageRemoved,
  onImageClick,
  recipeContext,
  renderHero = false,
}: RecipeImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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

  const handleGenerateImage = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/recipes/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealId,
          source,
          recipeName: recipeContext?.name ?? '',
          recipeSummary: recipeContext?.summary ?? '',
        }),
      });
      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.error?.message ?? 'Genereren mislukt');
      }
      setPreviewUrl(result.data.url);
      setImageLoadError(false);
      onImageUploaded(result.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Genereren mislukt');
    } finally {
      setIsGenerating(false);
    }
  };

  const isBusy = isUploading || isDeleting || isGenerating;

  const iconButtonClass =
    'p-2 rounded-lg shadow-md border border-zinc-200/80 dark:border-zinc-700/80 transition-[background-color,box-shadow] duration-150 ' +
    'focus:outline-none focus-visible:outline-none [&[data-focus]]:!outline-none [&[data-focus]]:!outline-offset-0 [&[data-focus]]:!ring-0 [&[data-focus]]:!ring-offset-0 ' +
    'hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:shadow-sm [&[data-focus]]:shadow-sm [&[data-focus]]:bg-zinc-100 dark:[&[data-focus]]:bg-zinc-800';

  const overlayButtons = (
    <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5 justify-end">
      <Button
        plain
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleGenerateImage();
        }}
        disabled={isBusy}
        title={isGenerating ? 'Bezig…' : 'Genereer met AI'}
        aria-label={isGenerating ? 'Bezig…' : 'Genereer met AI'}
        className={`${iconButtonClass} bg-white/95 dark:bg-zinc-900/95 text-blue-600 dark:text-blue-400`}
      >
        <SparklesIcon className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        plain
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        disabled={isBusy}
        title="Vervangen"
        aria-label="Vervangen"
        className={
          iconButtonClass +
          ' bg-white/95 dark:bg-zinc-900/95 text-zinc-600 dark:text-zinc-400'
        }
      >
        <ArrowPathIcon className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        plain
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDeleteClick();
        }}
        disabled={isBusy}
        title="Verwijderen"
        aria-label="Verwijderen"
        className={`${iconButtonClass} text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-white/95 dark:bg-zinc-900/95`}
      >
        <TrashIcon className="h-5 w-5" aria-hidden />
      </Button>
    </div>
  );

  return (
    <div className={renderHero ? 'min-w-0 w-full' : 'mt-4 min-w-0 max-w-full'}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {renderHero && previewUrl && !imageLoadError ? (
        <>
          <div className="relative block w-full aspect-[4/1] min-h-[100px] max-h-[220px] bg-zinc-100 dark:bg-zinc-800 overflow-hidden rounded-t-lg">
            <button
              type="button"
              onClick={handleClick}
              className="block w-full h-full cursor-pointer hover:opacity-95 transition-opacity"
              disabled={isBusy}
              aria-label="Receptafbeelding vergroten"
            >
              <Image
                src={previewUrl}
                alt="Recept foto"
                fill
                className="object-cover rounded-t-lg"
                sizes="(max-width: 768px) 100vw, 800px"
                unoptimized
                onError={() => setImageLoadError(true)}
              />
            </button>
            {overlayButtons}
          </div>
          {error && (
            <span className="mt-1.5 block text-sm text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </>
      ) : renderHero && !previewUrl ? (
        <div className="relative border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-t-lg p-8 sm:p-10 flex flex-col items-center justify-center gap-3 min-h-[140px] bg-zinc-50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={handleClick}
            disabled={isBusy}
            className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 disabled:opacity-50"
          >
            <PhotoIcon className="h-12 w-12 shrink-0 text-zinc-400 dark:text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
              {isUploading ? 'Uploaden...' : 'Upload foto van eindresultaat'}
            </span>
          </button>
          {recipeContext && (
            <Button
              plain
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGenerateImage();
              }}
              disabled={isBusy}
              className="relative z-10 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <SparklesIcon className="h-4 w-4 mr-1.5 inline" />
              {isGenerating ? 'Bezig…' : 'Genereer foto met AI'}
            </Button>
          )}
        </div>
      ) : previewUrl && !renderHero ? (
        <div>
          <div className="relative block w-full min-h-[80px] max-h-[192px] rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
            <button
              type="button"
              onClick={handleClick}
              className="block w-full h-full cursor-pointer hover:opacity-90 transition-opacity min-h-[80px] max-h-[192px]"
              disabled={isBusy}
            >
              {!imageLoadError ? (
                <span className="relative block w-full h-full min-h-[80px] max-h-[192px]">
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
                <div className="rounded-lg w-full h-full min-h-[80px] max-h-[192px] flex items-center justify-center border-2 border-dashed border-zinc-300 dark:border-zinc-700">
                  <div className="text-center p-4">
                    <PhotoIcon className="h-10 w-10 text-zinc-400 dark:text-zinc-500 mx-auto mb-2" />
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
            {overlayButtons}
          </div>
          {error && (
            <span className="mt-1.5 block text-sm text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </div>
      ) : (
        <div>
          <div className="relative border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-6 sm:p-8 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors flex flex-col items-center justify-center gap-3 min-h-[120px]">
            <button
              type="button"
              onClick={handleClick}
              disabled={isUploading || isGenerating}
              className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 disabled:opacity-50 box-border rounded-lg"
            >
              <PhotoIcon className="h-10 w-10 shrink-0 text-zinc-400 dark:text-zinc-500" />
              <span className="text-sm text-zinc-600 dark:text-zinc-400 text-center break-words">
                {isUploading ? 'Uploaden...' : 'Upload foto van eindresultaat'}
              </span>
            </button>
            {recipeContext && (
              <Button
                plain
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleGenerateImage();
                }}
                disabled={isUploading || isGenerating}
                className="relative z-10 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                <SparklesIcon className="h-4 w-4 mr-1.5 inline" />
                {isGenerating ? 'Bezig…' : 'Genereer foto met AI'}
              </Button>
            )}
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}

      {previewUrl && !imageLoadError && (
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
  );
}
