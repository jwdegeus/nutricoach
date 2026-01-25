"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/catalyst/button";
import { ConfirmDialog } from "@/components/catalyst/confirm-dialog";
import { PhotoIcon, TrashIcon } from "@heroicons/react/20/solid";
import { ImageLightbox } from "./ImageLightbox";

type RecipeImageUploadProps = {
  mealId: string;
  source: "custom" | "gemini";
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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Afbeelding is te groot (max 10MB)");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Convert to base64
      const base64 = await fileToBase64(file);

      // Upload via action
      const response = await fetch("/api/recipes/upload-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        throw new Error(result.error?.message || "Upload mislukt");
      }

      // Update preview
      setPreviewUrl(result.data.url);
      onImageUploaded(result.data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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
      const response = await fetch("/api/recipes/delete-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mealId,
          source,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error?.message || "Verwijderen mislukt");
      }

      // Clear preview
      setPreviewUrl(null);
      if (onImageRemoved) {
        onImageRemoved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
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
    if (previewUrl && !isUploading) {
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
    <div className="mt-4">
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
            <img
              src={previewUrl}
              alt="Recept foto"
              className="rounded-lg max-w-full h-auto max-h-48 object-contain shadow-sm hover:shadow-md transition-shadow"
            />
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
              <span className="text-sm text-red-600 dark:text-red-400">{error}</span>
            )}
          </div>
          <ImageLightbox
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            imageUrl={previewUrl}
            alt="Recept foto"
          />
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
            className="w-full border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg p-8 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors flex flex-col items-center justify-center gap-2 disabled:opacity-50"
          >
            <PhotoIcon className="h-12 w-12 text-zinc-400 dark:text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {isUploading ? "Uploaden..." : "Upload foto van eindresultaat"}
            </span>
          </button>
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
