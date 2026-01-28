'use client';

import { useState, useRef, useCallback, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Select } from '@/components/catalyst/select';
import { Link } from '@/components/catalyst/link';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import {
  PhotoIcon,
  CameraIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/solid';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid';
import { ImportStatusPanel } from './components/ImportStatusPanel';
import { RecipeEditForm } from './components/RecipeEditForm';
import {
  createRecipeImportAction,
  loadRecipeImportAction,
} from './actions/recipeImport.actions';
import { processRecipeImportWithGeminiAction } from './actions/recipeImport.process.actions';
import { finalizeRecipeImportAction } from './actions/recipeImport.finalize.actions';
import type { RecipeImportJob, RecipeImportStatus } from './recipeImport.types';
import type { GeminiExtractedRecipe } from './recipeImport.gemini.schemas';

// Maximum file size for base64 conversion
// Note: Next.js has a default 1MB body limit for server actions
// We compress images > 500KB to stay under this limit
// Base64 encoding increases size by ~33%, so 700KB raw ≈ 930KB base64 (safe under 1MB)
const MAX_FILE_SIZE_FOR_PROCESSING = 700 * 1024; // 700KB raw - will be compressed if larger

/**
 * Compress image to reduce file size
 * Returns a compressed File object
 */
function compressImage(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1920,
  quality: number = 0.8,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }

        // Create canvas and compress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }
            // Create new File from blob
            const compressedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          file.type,
          quality,
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert File to data URL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to data URL'));
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsDataURL(file);
  });
}

/** Detect native "Failed to fetch" / network errors from server actions */
function isNetworkOrFetchError(err: unknown): boolean {
  if (err instanceof TypeError && err.message === 'Failed to fetch')
    return true;
  if (
    err instanceof Error &&
    (err.message === 'Failed to fetch' || err.name === 'AbortError')
  )
    return true;
  return false;
}

export function RecipeImportClient({
  initialJobId,
}: {
  initialJobId?: string;
}) {
  const t = useTranslations('recipeImport');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, _startTransition] = useTransition();

  // Local file state (for preview)
  const [localSelectedFile, setLocalSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Remote job state (source of truth)
  const [remoteJob, setRemoteJob] = useState<RecipeImportJob | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [processingJob, setProcessingJob] = useState(false);
  const [finalizingJob, setFinalizingJob] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMealSlot, setSelectedMealSlot] = useState<
    'breakfast' | 'lunch' | 'dinner' | 'snack' | ''
  >('');

  // Get jobId from URL or initial prop
  const jobId = initialJobId || searchParams.get('jobId');

  // Derived UI state from remote job
  // If processingJob is true, always show processing state
  const uiState: RecipeImportStatus | 'idle' = processingJob
    ? 'processing'
    : remoteJob
      ? remoteJob.status
      : jobId
        ? 'processing' // Loading state
        : 'idle';

  // Load job from server
  const loadJob = useCallback(
    async (id: string) => {
      setLoadingJob(true);
      setError(null);

      try {
        const result = await loadRecipeImportAction({ jobId: id });

        if (result.ok) {
          setRemoteJob(result.data);
        } else {
          if (
            result.error.code === 'NOT_FOUND' ||
            result.error.code === 'FORBIDDEN'
          ) {
            setError(t('errorJobNotFound'));
          } else {
            setError(result.error.message);
          }
        }
      } catch (err) {
        const msg = isNetworkOrFetchError(err)
          ? t('errorNetworkOrTimeout')
          : err instanceof Error
            ? err.message
            : t('errorUnknown');
        setError(msg);
      } finally {
        setLoadingJob(false);
      }
    },
    [t],
  );

  // Load job whenever jobId in URL is present; use job from sessionStorage if just returned from URL import
  useEffect(() => {
    if (!jobId || loadingJob) return;
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(`recipe-import-job-${jobId}`);
        if (stored) {
          const job = JSON.parse(stored) as RecipeImportJob;
          if (job.id === jobId) {
            sessionStorage.removeItem(`recipe-import-job-${jobId}`);
            setRemoteJob(job);
            setError(null);
            return;
          }
        }
      } catch {
        // ignore
      }
    }
    console.log('[RecipeImportClient] useEffect: Loading job, jobId:', jobId);
    loadJob(jobId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Translation happens during extraction, no polling needed

  // Debug: Log when processingJob changes
  useEffect(() => {
    console.log('[RecipeImportClient] processingJob changed:', processingJob);
  }, [processingJob]);

  // Debug: Log when remoteJob changes
  useEffect(() => {
    console.log(
      '[RecipeImportClient] remoteJob changed:',
      remoteJob ? { id: remoteJob.id, status: remoteJob.status } : null,
    );
  }, [remoteJob]);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (file: File) => {
      console.log(
        '[RecipeImportClient] handleFileSelect called with file:',
        file.name,
        file.size,
        file.type,
      );

      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.log('[RecipeImportClient] Invalid file type:', file.type);
        setError(t('errorImageOnly'));
        return;
      }

      // Validate file size (max 10MB for upload, but 4MB for processing)
      if (file.size > 10 * 1024 * 1024) {
        console.log('[RecipeImportClient] File too large:', file.size);
        setError(t('errorFileTooLarge'));
        return;
      }

      console.log('[RecipeImportClient] File validation passed, proceeding...');
      setError(null);
      setLocalSelectedFile(file);

      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      // Show immediate feedback: set processing state
      console.log('[RecipeImportClient] Setting processingJob to true');
      setProcessingJob(true);

      try {
        // Step 1: Create recipe import job
        console.log(
          '[RecipeImportClient] Step 1: Creating recipe import job...',
        );
        const result = await createRecipeImportAction({
          sourceImageMeta: {
            filename: file.name,
            size: file.size,
            mimetype: file.type,
          },
          // sourceLocale omitted (will be detected by Gemini)
          targetLocale: locale || 'nl',
        });
        console.log(
          '[RecipeImportClient] Create job result:',
          result.ok ? 'OK' : 'ERROR',
          result,
        );

        if (!result.ok) {
          console.error(
            '[RecipeImportClient] Create job failed:',
            result.error,
          );
          setError(result.error.message);
          setProcessingJob(false);
          // Set failed state
          setRemoteJob({
            id: '',
            userId: '',
            status: 'failed',
            sourceImagePath: null,
            sourceImageMeta: {
              filename: file.name,
              size: file.size,
              mimetype: file.type,
            },
            sourceLocale: null,
            targetLocale: null,
            rawOcrText: null,
            geminiRawJson: null,
            extractedRecipeJson: null,
            originalRecipeJson: null,
            validationErrorsJson: result.error,
            confidenceOverall: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            finalizedAt: null,
            recipeId: null,
          });
          return;
        }

        const newJobId = result.data.jobId;
        console.log(
          '[RecipeImportClient] Step 2: Job created with ID:',
          newJobId,
        );

        // Step 2: Set job state immediately (optimistic update)
        console.log('[RecipeImportClient] Setting remoteJob optimistically...');
        setRemoteJob({
          id: newJobId,
          userId: '',
          status: 'uploaded',
          sourceImagePath: null,
          sourceImageMeta: {
            filename: file.name,
            size: file.size,
            mimetype: file.type,
          },
          sourceLocale: null,
          targetLocale: locale || 'nl',
          rawOcrText: null,
          geminiRawJson: null,
          extractedRecipeJson: null,
          originalRecipeJson: null,
          validationErrorsJson: null,
          confidenceOverall: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          finalizedAt: null,
          recipeId: null,
        });

        // Step 3: Navigate to same page with jobId (don't wait for it)
        console.log(
          '[RecipeImportClient] Step 3: Navigating to page with jobId:',
          newJobId,
        );
        router.push(`/recipes/import?jobId=${newJobId}`);

        // Step 4: Compress image first, then check if we can auto-process
        // Always compress to reduce size and avoid body limit issues
        console.log(
          '[RecipeImportClient] Step 4: Compressing image to reduce size...',
        );
        const compressStartTime = Date.now();
        let fileToProcess: File;
        try {
          fileToProcess = await compressImage(file, 1200, 1200, 0.75);
          const compressDuration = Date.now() - compressStartTime;
          console.log(
            `[RecipeImportClient] Compression took ${compressDuration}ms, original: ${(file.size / 1024).toFixed(2)}KB, compressed: ${(fileToProcess.size / 1024).toFixed(2)}KB`,
          );
        } catch (compressError) {
          console.error(
            '[RecipeImportClient] Compression failed, using original file:',
            compressError,
          );
          fileToProcess = file; // Fallback to original if compression fails
        }

        // Step 5: Check if compressed file is small enough for auto-processing
        console.log(
          '[RecipeImportClient] Step 5: Checking compressed file size for auto-processing...',
        );
        console.log(
          '[RecipeImportClient] Compressed file size:',
          fileToProcess.size,
          'bytes, MAX_FILE_SIZE_FOR_PROCESSING:',
          MAX_FILE_SIZE_FOR_PROCESSING,
          'bytes',
        );

        if (fileToProcess.size <= MAX_FILE_SIZE_FOR_PROCESSING) {
          console.log(
            '[RecipeImportClient] Compressed file size OK, starting auto-processing...',
          );
          try {
            // Convert compressed file to data URL
            console.log(
              '[RecipeImportClient] Converting compressed file to data URL...',
            );
            const convertStartTime = Date.now();
            const imageDataUrl = await fileToDataUrl(fileToProcess);
            const convertDuration = Date.now() - convertStartTime;
            console.log(
              `[RecipeImportClient] File conversion took ${convertDuration}ms`,
            );

            // Check base64 size (data URL includes "data:image/...;base64," prefix)
            const base64Size = imageDataUrl.length;
            const base64DataSize = base64Size - (imageDataUrl.indexOf(',') + 1);
            console.log(
              `[RecipeImportClient] Base64 size: ${(base64DataSize / 1024).toFixed(2)}KB`,
            );

            // Base64 encoding increases size by ~33%
            // We compress images, so they should be well under 1MB base64
            const MAX_BASE64_SIZE = 900 * 1024; // 900KB base64 limit (safe under 1MB)
            if (base64DataSize > MAX_BASE64_SIZE) {
              console.error(
                `[RecipeImportClient] Base64 size ${(base64DataSize / 1024).toFixed(2)}KB exceeds limit ${(MAX_BASE64_SIZE / 1024).toFixed(2)}KB`,
              );
              throw new Error(t('errorFileTooLargeForProcessing'));
            }

            // Update status to "processing" for immediate UI feedback
            setRemoteJob((prev) =>
              prev ? { ...prev, status: 'processing' } : null,
            );

            // Start processing automatically (this is the slow part - Gemini API call)
            console.log(
              '[RecipeImportClient] Starting automatic processing for job:',
              newJobId,
            );
            const processStartTime = Date.now();

            // Add timeout wrapper for Gemini processing (max 60 seconds)
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(
                  new Error(
                    'Processing timeout: Gemini API call duurde langer dan 60 seconden',
                  ),
                );
              }, 60000);
            });

            try {
              console.log(
                '[RecipeImportClient] About to call processRecipeImportWithGeminiAction...',
              );
              console.log('[RecipeImportClient] JobId:', newJobId);
              console.log(
                '[RecipeImportClient] ImageDataUrl length:',
                imageDataUrl.length,
              );

              const processResult = await Promise.race([
                (async () => {
                  console.log(
                    '[RecipeImportClient] Inside Promise.race, calling action...',
                  );
                  const result = await processRecipeImportWithGeminiAction({
                    jobId: newJobId,
                    imageDataUrl,
                    // targetLocale omitted - will be fetched from user preferences server-side
                  });
                  console.log(
                    '[RecipeImportClient] Action returned:',
                    result.ok ? 'OK' : 'ERROR',
                    result,
                  );
                  return result;
                })(),
                timeoutPromise,
              ]);

              const processDuration = Date.now() - processStartTime;
              console.log(
                `[RecipeImportClient] Processing took ${processDuration}ms`,
              );

              if (processResult.ok) {
                console.log(
                  '[RecipeImportClient] Processing completed successfully',
                );
                // Only load job once at the end to get final state
                await loadJob(newJobId);
                setProcessingJob(false);
              } else {
                console.error(
                  '[RecipeImportClient] Processing failed:',
                  processResult.error,
                );
                // Error will be shown via status panel
                setError(processResult.error.message);
                // Load job to see failed status
                await loadJob(newJobId);
                setProcessingJob(false);
              }
            } catch (timeoutError) {
              const processDuration = Date.now() - processStartTime;
              console.error(
                `[RecipeImportClient] Processing timeout after ${processDuration}ms:`,
                timeoutError,
              );
              setError(
                timeoutError instanceof Error
                  ? timeoutError.message
                  : 'Processing timeout',
              );
              // Load job to see current status
              await loadJob(newJobId);
              setProcessingJob(false);
            }
          } catch (err) {
            console.error('[RecipeImportClient] Auto-processing error:', err);
            const msg = isNetworkOrFetchError(err)
              ? t('errorNetworkOrTimeout')
              : err instanceof Error
                ? err.message
                : t('errorUnknown');
            setError(msg);
            await loadJob(newJobId);
            setProcessingJob(false);
          }
        } else {
          // File too large - user will need to click "Start verwerking" button
          console.log(
            '[RecipeImportClient] File too large for auto-processing, user must click button',
          );
          console.log(
            '[RecipeImportClient] File size:',
            file.size,
            'MAX_FILE_SIZE_FOR_PROCESSING:',
            MAX_FILE_SIZE_FOR_PROCESSING,
          );
          // Don't set error - just show info message and keep file for manual processing
          // Load job so user can see it and manually trigger processing
          await loadJob(newJobId);
          setProcessingJob(false);
          // Keep localSelectedFile so user can click "Start verwerking" button
          // The file is already set above, so it should remain
        }
      } catch (err) {
        console.error('[RecipeImportClient] File upload error:', err);
        const msg = isNetworkOrFetchError(err)
          ? t('errorNetworkOrTimeout')
          : err instanceof Error
            ? err.message
            : t('errorUnknown');
        setError(msg);
        setProcessingJob(false);
      }
    },
    [t, router, loadJob, locale],
  );

  // Handle file input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add('ring-2', 'ring-primary-500');
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('ring-2', 'ring-primary-500');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (dropZoneRef.current) {
        dropZoneRef.current.classList.remove('ring-2', 'ring-primary-500');
      }

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect],
  );

  // Handle camera capture
  const handleOpenCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Prefer back camera
      });
      setCameraStream(stream);
      setCameraOpen(true);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError(t('errorCameraAccess'));
    }
  }, [t]);

  const handleCloseCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraOpen(false);
  }, [cameraStream]);

  const handleCapturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert canvas to blob
    canvas.toBlob(
      (blob) => {
        if (!blob) return;

        // Create File from blob
        const file = new File([blob], `camera-${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });

        // Close camera and process file
        handleCloseCamera();
        handleFileSelect(file);
      },
      'image/jpeg',
      0.9,
    );
  }, [handleCloseCamera, handleFileSelect]);

  // Handle paste from clipboard
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            handleFileSelect(file);
          }
          break;
        }
      }
    },
    [handleFileSelect],
  );

  // Set up paste event listener
  useEffect(() => {
    if (uiState === 'idle') {
      window.addEventListener('paste', handlePaste);
      return () => {
        window.removeEventListener('paste', handlePaste);
      };
    }
  }, [uiState, handlePaste]);

  // Set up video stream when camera opens
  useEffect(() => {
    if (cameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraOpen, cameraStream]);

  // Handle start processing with Gemini
  const handleStartProcessing = useCallback(async () => {
    if (!remoteJob || !localSelectedFile || processingJob) return;

    // Preflight check: file size
    if (localSelectedFile.size > MAX_FILE_SIZE_FOR_PROCESSING) {
      setError(t('errorFileTooLargeForProcessing'));
      return;
    }

    setProcessingJob(true);
    setError(null);

    try {
      // Convert file to data URL
      const imageDataUrl = await fileToDataUrl(localSelectedFile);

      // Call Gemini processing action
      // Note: targetLocale will be determined server-side from user preferences
      // We pass locale as fallback, but server will use user_preferences.language
      const result = await processRecipeImportWithGeminiAction({
        jobId: remoteJob.id,
        imageDataUrl,
        // targetLocale omitted - will be fetched from user preferences server-side
        // sourceLocale omitted (will be detected by Gemini)
      });

      if (result.ok) {
        // Reload job to get updated status and extracted data
        await loadJob(remoteJob.id);
      } else {
        setError(result.error.message);
        // Reload job to get updated status (might be failed now)
        await loadJob(remoteJob.id);
      }
    } catch (err) {
      const msg = isNetworkOrFetchError(err)
        ? t('errorNetworkOrTimeout')
        : err instanceof Error
          ? err.message
          : t('errorUnknown');
      setError(msg);
      if (remoteJob) await loadJob(remoteJob.id);
    } finally {
      setProcessingJob(false);
    }
  }, [remoteJob, localSelectedFile, processingJob, locale, loadJob, t]);

  // Handle retry (for failed jobs or full reset)
  const handleRetry = useCallback(async () => {
    if (!remoteJob) {
      // Full reset
      setRemoteJob(null);
      setLocalSelectedFile(null);
      setPreviewUrl(null);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      router.push('/recipes/import');
      return;
    }

    // Retry processing if status is failed and we have a file
    if (remoteJob.status === 'failed' && localSelectedFile) {
      await handleStartProcessing();
    } else {
      // Reset everything
      setRemoteJob(null);
      setLocalSelectedFile(null);
      setPreviewUrl(null);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      router.push('/recipes/import');
    }
  }, [remoteJob, localSelectedFile, handleStartProcessing, router]);

  // Handle full reset
  const handleFullReset = useCallback(() => {
    setRemoteJob(null);
    setLocalSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    setSelectedMealSlot('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    router.push('/recipes/import');
  }, [router]);

  // Translation happens automatically - no manual trigger needed

  // Handle finalize recipe import
  const handleFinalize = useCallback(async () => {
    if (!remoteJob || finalizingJob) return;

    setFinalizingJob(true);
    setError(null);

    try {
      const result = await finalizeRecipeImportAction({
        jobId: remoteJob.id,
        mealSlot: selectedMealSlot || undefined,
      });

      if (result.ok) {
        // Reload job to get updated status and recipeId
        await loadJob(remoteJob.id);

        // Navigate to recipe detail page
        if (result.data.recipeId) {
          router.push(`/recipes/${result.data.recipeId}`);
        }
      } else {
        // Handle different error codes
        let errorMessage: string;
        switch (result.error.code) {
          case 'FORBIDDEN':
            errorMessage = t('finalizeErrorForbidden');
            break;
          case 'VALIDATION_ERROR':
            errorMessage = `${t('finalizeErrorValidation')} ${result.error.message}`;
            break;
          case 'DB_ERROR':
            errorMessage = t('finalizeErrorDb');
            break;
          default:
            errorMessage = result.error.message;
        }
        setError(errorMessage);
      }
    } catch (err) {
      const msg = isNetworkOrFetchError(err)
        ? t('errorNetworkOrTimeout')
        : err instanceof Error
          ? err.message
          : t('errorUnknown');
      setError(msg);
    } finally {
      setFinalizingJob(false);
    }
  }, [remoteJob, finalizingJob, selectedMealSlot, router, loadJob, t]);

  // Cleanup preview URL on unmount or file change
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Show loading state while loading job or processing
  if ((loadingJob && jobId) || (processingJob && !remoteJob)) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-12">
          <ArrowPathIcon className="h-8 w-8 text-primary-600 dark:text-primary-400 animate-spin" />
          <Text>{processingJob ? t('processing') : t('loading')}</Text>
          {processingJob && (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('processingDescription')}
            </Text>
          )}
        </div>
      </div>
    );
  }

  // Get extracted recipe data (translated version if available, otherwise original)
  const extractedRecipe: GeminiExtractedRecipe | null =
    remoteJob?.extractedRecipeJson &&
    typeof remoteJob.extractedRecipeJson === 'object'
      ? (remoteJob.extractedRecipeJson as GeminiExtractedRecipe)
      : null;

  // Get original recipe data (before translation) – reserved for future use
  const _originalRecipe: GeminiExtractedRecipe | null =
    remoteJob?.originalRecipeJson &&
    typeof remoteJob.originalRecipeJson === 'object'
      ? (remoteJob.originalRecipeJson as GeminiExtractedRecipe)
      : extractedRecipe; // Fallback to extracted if no original stored

  // Get target language for display – reserved for future use
  const _targetLang = remoteJob?.targetLocale || 'nl';

  // Get validation errors
  const validationErrors =
    remoteJob?.validationErrorsJson &&
    typeof remoteJob.validationErrorsJson === 'object'
      ? remoteJob.validationErrorsJson
      : null;

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      {uiState === 'idle' && (
        <div className="space-y-4">
          <div>
            <Heading level={2}>{t('uploadTitle')}</Heading>
            <Text>{t('uploadDescription')}</Text>
          </div>

          {/* Dropzone */}
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="relative border-2 border-dashed rounded-lg p-8 transition-colors border-zinc-300 dark:border-zinc-700 hover:border-primary-400 dark:hover:border-primary-600"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              disabled={isPending}
              className="hidden"
              id="recipe-upload-input"
              aria-label={t('selectFile')}
            />

            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="rounded-full bg-primary-100 dark:bg-primary-900/30 p-4">
                <PhotoIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <label htmlFor="recipe-upload-input" className="cursor-pointer">
                  <Button
                    as="span"
                    color="primary"
                    disabled={isPending}
                    className="w-full sm:w-auto"
                  >
                    <PhotoIcon className="h-4 w-4 mr-2" />
                    {isPending ? t('uploading') : t('selectFile')}
                  </Button>
                </label>
                <Button
                  onClick={handleOpenCamera}
                  disabled={isPending}
                  color="primary"
                  className="w-full sm:w-auto"
                >
                  <CameraIcon className="h-4 w-4 mr-2" />
                  {t('takePhoto')}
                </Button>
                <Button
                  onClick={async () => {
                    // Try to read from clipboard API (works in some browsers)
                    try {
                      if (navigator.clipboard && navigator.clipboard.read) {
                        const items = await navigator.clipboard.read();
                        const imageItem = items.find((item) =>
                          item.types.some((type) => type.startsWith('image/')),
                        );
                        if (imageItem) {
                          const imageType = imageItem.types.find((type) =>
                            type.startsWith('image/'),
                          );
                          if (imageType) {
                            const blob = await imageItem.getType(imageType);
                            const file = new File(
                              [blob],
                              `paste-${Date.now()}.${imageType.split('/')[1]}`,
                              {
                                type: imageType,
                                lastModified: Date.now(),
                              },
                            );
                            handleFileSelect(file);
                            return;
                          }
                        }
                      }
                      // If clipboard API doesn't work, show hint
                      setError(t('pasteHint'));
                    } catch (_err) {
                      // Clipboard API not available or permission denied - show hint
                      setError(t('pasteHint'));
                    }
                  }}
                  disabled={isPending}
                  color="primary"
                  className="w-full sm:w-auto"
                >
                  <ClipboardDocumentIcon className="h-4 w-4 mr-2" />
                  {t('pasteImage')}
                </Button>
              </div>
              <Text className="mt-2">{t('dragDrop')}</Text>
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                {t('fileTypes')}
              </Text>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {previewUrl && uiState !== 'failed' && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <img
            src={previewUrl}
            alt="Recept preview"
            className="w-full h-auto max-h-64 object-contain bg-zinc-50 dark:bg-zinc-900"
          />
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            <Text className="text-red-600 dark:text-red-400 font-medium">
              {error}
            </Text>
          </div>
          <Button onClick={handleFullReset} className="mt-3" outline>
            {t('retry')}
          </Button>
        </div>
      )}

      {/* Status Panel */}
      {remoteJob && (
        <>
          <ImportStatusPanel state={remoteJob.status} />

          {/* Start Processing Button - Only show if not already processing and file is available */}
          {(remoteJob.status === 'uploaded' || remoteJob.status === 'failed') &&
            !processingJob && (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
                {!localSelectedFile ? (
                  <div className="space-y-3">
                    <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                      {t('errorNoFileForProcessing')}
                    </Text>
                    <label
                      htmlFor="recipe-upload-input"
                      className="cursor-pointer"
                    >
                      <Button as="span" outline>
                        {t('selectFile')}
                      </Button>
                    </label>
                  </div>
                ) : (
                  <Button
                    onClick={handleStartProcessing}
                    disabled={processingJob}
                    color="primary"
                    className="w-full sm:w-auto"
                  >
                    {processingJob ? (
                      <>
                        <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                        {t('processing')}
                      </>
                    ) : (
                      t('startProcessing')
                    )}
                  </Button>
                )}
              </div>
            )}

          {/* Processing State with Skeleton Loader */}
          {(remoteJob.status === 'processing' || processingJob) && (
            <div className="space-y-6">
              {/* Processing Header with Magic Icon */}
              <div className="flex flex-col items-center justify-center text-center space-y-4 py-6 rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30">
                <div className="relative">
                  <SparklesIcon className="h-12 w-12 text-primary-600 dark:text-primary-400 animate-pulse" />
                  <div className="absolute inset-0 bg-primary-400/20 rounded-full blur-xl animate-pulse" />
                </div>
                <div className="space-y-2">
                  <Text className="text-lg font-semibold text-primary-900 dark:text-primary-100">
                    {t('processing')}
                  </Text>
                  <Text className="text-sm text-primary-700 dark:text-primary-300">
                    {t('processingDescription')}
                  </Text>
                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800">
                      <Text className="text-sm text-red-600 dark:text-red-400">
                        {error}
                      </Text>
                    </div>
                  )}
                </div>
                {/* Cancel/Retry button if processing takes too long */}
                {processingJob && (
                  <div className="mt-4">
                    <Button
                      onClick={async () => {
                        setProcessingJob(false);
                        setError(null);
                        // Reload job to see current status
                        if (remoteJob) {
                          await loadJob(remoteJob.id);
                        }
                      }}
                      outline
                    >
                      {t('cancel')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Skeleton Loader for Recipe Preview */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 bg-white dark:bg-zinc-900 space-y-6">
                {/* Title Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                </div>

                {/* Language Info Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-5 w-32 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                </div>

                {/* Servings Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="h-5 w-12 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                </div>

                {/* Times Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                    <div className="h-5 w-36 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  </div>
                </div>

                {/* Ingredients Skeleton */}
                <div className="space-y-3">
                  <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <ul className="space-y-2">
                    {[65, 80, 55, 70, 60].map((width, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                        <div
                          className={`h-5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse`}
                          style={{ width: `${width}%` }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Instructions Skeleton */}
                <div className="space-y-3">
                  <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  <ol className="space-y-2">
                    {[75, 85, 70, 80].map((width, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="h-5 w-5 rounded-full bg-zinc-300 dark:bg-zinc-700 flex-shrink-0 mt-0.5" />
                        <div
                          className={`h-5 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse`}
                          style={{ width: `${width}%` }}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Failed State */}
          {remoteJob.status === 'failed' && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="flex-1">
                  <Text className="text-red-600 dark:text-red-400 font-medium mb-2">
                    {t('uploadFailed')}
                  </Text>
                  {validationErrors && (
                    <div className="space-y-2 mb-4">
                      {validationErrors.stage && (
                        <Text className="text-sm text-red-600 dark:text-red-400">
                          <strong>{t('errorStage')}:</strong>{' '}
                          {t(`errorStage${validationErrors.stage}` as any)}
                        </Text>
                      )}
                      {validationErrors.message && (
                        <Text className="text-sm text-red-500 dark:text-red-400">
                          {String(validationErrors.message)}
                        </Text>
                      )}
                    </div>
                  )}
                  {localSelectedFile && (
                    <Button onClick={handleRetry} color="red">
                      {t('retryProcessing')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Review UI (Real Data) */}
          {remoteJob.status === 'ready_for_review' && (
            <div className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 bg-white dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <Heading level={2}>{t('reviewTitle')}</Heading>
                {remoteJob.confidenceOverall !== null && (
                  <Badge
                    color={
                      remoteJob.confidenceOverall >= 80
                        ? 'green'
                        : remoteJob.confidenceOverall >= 60
                          ? 'yellow'
                          : 'red'
                    }
                  >
                    {t('confidence')}: {Math.round(remoteJob.confidenceOverall)}
                    %
                  </Badge>
                )}
              </div>

              {extractedRecipe ? (
                <div className="space-y-6">
                  {/* Warnings */}
                  {extractedRecipe.warnings &&
                    extractedRecipe.warnings.length > 0 && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-4">
                        <div className="flex items-start gap-2">
                          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                          <div className="flex-1">
                            <Text className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                              {t('warnings')}
                            </Text>
                            <ul className="list-disc list-inside space-y-1">
                              {extractedRecipe.warnings.map((warning, idx) => (
                                <li
                                  key={idx}
                                  className="text-sm text-amber-700 dark:text-amber-300"
                                >
                                  {warning}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                  {/* Translation happens automatically - no button needed */}

                  {/* Edit Form - Allows users to edit recipe before finalizing */}
                  {(() => {
                    // Debug logging
                    const sourceImageMeta = remoteJob.sourceImageMeta as any;
                    console.log(
                      '[RecipeImportClient] Rendering RecipeEditForm with sourceImageMeta:',
                      JSON.stringify(
                        {
                          jobId: remoteJob.id,
                          sourceImageMeta: sourceImageMeta,
                          savedImageUrl: sourceImageMeta?.savedImageUrl,
                          savedImagePath: sourceImageMeta?.savedImagePath,
                          imageUrl: sourceImageMeta?.imageUrl,
                          allKeys: sourceImageMeta
                            ? Object.keys(sourceImageMeta)
                            : [],
                        },
                        null,
                        2,
                      ),
                    );
                    return null;
                  })()}
                  <RecipeEditForm
                    jobId={remoteJob.id}
                    recipe={extractedRecipe}
                    sourceImageMeta={remoteJob.sourceImageMeta}
                    onUpdated={async () => {
                      // Reload job to get updated recipe data
                      await loadJob(remoteJob.id);
                    }}
                  />

                  {/* Language Info */}
                  {(extractedRecipe.language_detected ||
                    extractedRecipe.translated_to) && (
                    <div>
                      <Subheading level={3}>{t('language')}</Subheading>
                      <Text>
                        {extractedRecipe.language_detected && (
                          <>
                            {t('detected')}: {extractedRecipe.language_detected}
                          </>
                        )}
                        {extractedRecipe.language_detected &&
                          extractedRecipe.translated_to &&
                          ' → '}
                        {extractedRecipe.translated_to && (
                          <>
                            {t('translatedTo')}: {extractedRecipe.translated_to}
                          </>
                        )}
                      </Text>
                    </div>
                  )}

                  {/* Times */}
                  {(extractedRecipe.times.prep_minutes ||
                    extractedRecipe.times.cook_minutes ||
                    extractedRecipe.times.total_minutes) && (
                    <div>
                      <Subheading level={3}>{t('times')}</Subheading>
                      <div className="space-y-1">
                        {extractedRecipe.times.prep_minutes && (
                          <Text>
                            {t('reviewPrepTime')}:{' '}
                            {extractedRecipe.times.prep_minutes} {t('minutes')}
                          </Text>
                        )}
                        {extractedRecipe.times.cook_minutes && (
                          <Text>
                            {t('reviewCookTime')}:{' '}
                            {extractedRecipe.times.cook_minutes} {t('minutes')}
                          </Text>
                        )}
                        {extractedRecipe.times.total_minutes && (
                          <Text>
                            {t('totalTime')}:{' '}
                            {extractedRecipe.times.total_minutes} {t('minutes')}
                          </Text>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Finalize CTA */}
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="space-y-4">
                      {/* Meal Slot Select (Optional) */}
                      <div>
                        <label
                          htmlFor="meal-slot-select"
                          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
                        >
                          {t('mealSlotLabel')}
                        </label>
                        <Select
                          id="meal-slot-select"
                          value={selectedMealSlot}
                          onChange={(e) =>
                            setSelectedMealSlot(e.target.value as any)
                          }
                          disabled={finalizingJob}
                        >
                          <option value="">{t('mealSlotOptional')}</option>
                          <option value="breakfast">
                            {t('mealSlotBreakfast')}
                          </option>
                          <option value="lunch">{t('mealSlotLunch')}</option>
                          <option value="dinner">{t('mealSlotDinner')}</option>
                          <option value="snack">{t('mealSlotSnack')}</option>
                        </Select>
                      </div>

                      {/* Finalize Button */}
                      <Button
                        onClick={handleFinalize}
                        disabled={finalizingJob}
                        color="primary"
                        className="w-full sm:w-auto"
                      >
                        {finalizingJob ? (
                          <>
                            <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                            {t('finalizeLoading')}
                          </>
                        ) : (
                          t('finalizeCta')
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Text className="text-zinc-500 dark:text-zinc-400">
                    {t('noExtractedData')}
                  </Text>
                  {localSelectedFile && (
                    <Button
                      onClick={handleStartProcessing}
                      className="mt-4"
                      outline
                    >
                      {t('retryProcessing')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Finalized State */}
          {remoteJob.status === 'finalized' && remoteJob.recipeId && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/50 p-6">
              <div className="flex items-start gap-3">
                <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <Heading
                    level={3}
                    className="text-green-800 dark:text-green-200 mb-2"
                  >
                    {t('finalizeSuccessTitle')}
                  </Heading>
                  <Text className="text-green-700 dark:text-green-300 mb-4">
                    {t('finalizeSuccessBody')}
                  </Text>
                  <Link href={`/recipes/${remoteJob.recipeId}`}>
                    <Button color="green">{t('openRecipe')}</Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Camera Dialog */}
      <Dialog open={cameraOpen} onClose={handleCloseCamera} size="lg">
        <DialogTitle>{t('cameraTitle')}</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <div className="relative bg-zinc-900 rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
              {t('cameraHint')}
            </Text>
          </div>
        </DialogBody>
        <DialogActions>
          <Button onClick={handleCloseCamera} outline>
            {t('cancel')}
          </Button>
          <Button onClick={handleCapturePhoto} color="primary">
            <CameraIcon className="h-4 w-4 mr-2" />
            {t('capturePhoto')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
