"use client";

import { useState, useRef, useEffect } from "react";
import * as React from "react";
import { Dialog, DialogTitle, DialogBody, DialogActions } from "@/components/catalyst/dialog";
import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { uploadAndAnalyzeMealAction } from "../actions/meals.actions";
import { ArrowPathIcon } from "@heroicons/react/20/solid";
import type { CustomMealRecord } from "@/src/lib/custom-meals/customMeals.service";
import type { MealSlot } from "@/src/lib/diets";

type MealUploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  uploadType: "photo" | "screenshot" | "file";
  onMealAdded: (meal: CustomMealRecord) => void;
};

export function MealUploadModal({
  isOpen,
  onClose,
  uploadType,
  onMealAdded,
}: MealUploadModalProps) {
  const [mealSlot, setMealSlot] = useState<MealSlot>("lunch");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Compress image to reduce size
  const compressImage = (file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if too large
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convert to data URL with compression
          const mimeType = file.type || 'image/jpeg';
          const dataUrl = canvas.toDataURL(mimeType, quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Prevent if already analyzing
    if (isAnalyzing || hasAnalyzed) {
      e.target.value = ""; // Reset input
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    // Check file size (before compression)
    const maxSizeMB = 5; // Max 5MB original file
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Bestand is te groot. Maximum ${maxSizeMB}MB.`);
      e.target.value = "";
      return;
    }

    try {
      // Compress image before creating preview
      const compressedDataUrl = await compressImage(file, 1920, 0.8);
      setPreview(compressedDataUrl);
      setHasAnalyzed(false); // Reset when new file is selected
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fout bij verwerken van afbeelding");
      e.target.value = "";
    }
  };

  const handleAnalyze = async () => {
    if (!preview) {
      setError("Selecteer eerst een afbeelding");
      return;
    }

    // Prevent double submission
    if (isAnalyzing || hasAnalyzed) {
      return;
    }

    setIsAnalyzing(true);
    setHasAnalyzed(true);
    setError(null);

    try {
      // Extract base64 and mime type from data URL
      const base64Match = preview.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) {
        throw new Error("Ongeldig afbeeldingsformaat");
      }

      const mimeType = base64Match[1];
      const imageData = base64Match[2];

      const result = await uploadAndAnalyzeMealAction({
        imageData: preview, // Pass full data URL
        mimeType,
        mealSlot,
        date: new Date().toISOString().split("T")[0],
      });

      if (result.ok) {
        onMealAdded(result.data.meal);
        // Reset form
        setPreview(null);
        setMealSlot("lunch");
        setHasAnalyzed(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        // Close modal after successful upload
        onClose();
      } else {
        setError(result.error.message);
        setHasAnalyzed(false); // Allow retry on error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
      setHasAnalyzed(false); // Allow retry on error
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    if (!isAnalyzing) {
      setPreview(null);
      setError(null);
      setMealSlot("lunch");
      setHasAnalyzed(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      onClose();
    }
  };

  // Reset state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setError(null);
      setMealSlot("lunch");
      setHasAnalyzed(false);
      setIsAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onClose={handleClose} size="2xl">
      <DialogTitle>
        {uploadType === "photo" && "Foto Maken"}
        {uploadType === "screenshot" && "Screenshot Uploaden"}
        {uploadType === "file" && "Bestand Uploaden"}
      </DialogTitle>
      <DialogBody>

        <div className="space-y-4">
          <Field>
            <Label>Maaltijd Type</Label>
            <Select
              value={mealSlot}
              onChange={(e) => setMealSlot(e.target.value as MealSlot)}
              disabled={isAnalyzing}
            >
              <option value="breakfast">Ontbijt</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Avondeten</option>
              <option value="snack">Tussendoortje</option>
            </Select>
          </Field>

          {!preview && (
            <Field>
              <Label>Afbeelding</Label>
              <div className="mt-2">
                {uploadType === "photo" && (
                  <Input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    disabled={isAnalyzing || hasAnalyzed}
                    onClick={(e) => {
                      // Prevent if already analyzing
                      if (isAnalyzing || hasAnalyzed) {
                        e.preventDefault();
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                  />
                )}
                {(uploadType === "screenshot" || uploadType === "file") && (
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    disabled={isAnalyzing || hasAnalyzed}
                    onClick={(e) => {
                      // Prevent if already analyzing
                      if (isAnalyzing || hasAnalyzed) {
                        e.preventDefault();
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                  />
                )}
              </div>
            </Field>
          )}

          {preview && (
            <Field>
              <Label>Preview</Label>
              <div className="mt-2">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-w-full h-auto rounded-lg border border-zinc-200 dark:border-zinc-700"
                />
                <Button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    if (cameraInputRef.current) cameraInputRef.current.value = "";
                  }}
                  disabled={isAnalyzing}
                  className="mt-2"
                  color="zinc"
                >
                  Verwijder
                  </Button>
              </div>
            </Field>
          )}

          {error && (
            <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button onClick={handleClose} disabled={isAnalyzing} color="zinc" outline>
          Annuleren
        </Button>
        <Button
          onClick={handleAnalyze}
          disabled={!preview || isAnalyzing}
        >
          {isAnalyzing ? (
            <>
              <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
              Analyseren...
            </>
          ) : (
            "Analyseren & Toevoegen"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
