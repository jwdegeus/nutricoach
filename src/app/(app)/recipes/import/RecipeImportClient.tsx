'use client';

import Image from 'next/image';
import { useState, useRef, useCallback, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Heading, Subheading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { Link } from '@/components/catalyst/link';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import {
  Field,
  Label,
  Description,
  ErrorMessage,
} from '@/components/catalyst/fieldset';
import { Textarea } from '@/components/catalyst/textarea';
import {
  PhotoIcon,
  CameraIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { useToast } from '@/src/components/app/ToastContext';
import { ImportStatusPanel } from './components/ImportStatusPanel';
import { RecipeEditForm } from './components/RecipeEditForm';
import {
  createRecipeImportAction,
  loadRecipeImportAction,
  importRecipeFromUrlAction,
} from './actions/recipeImport.actions';
import {
  importRecipeFromTextAction,
  createRecipeImportFromScratchAction,
} from './actions/recipeImport.textAndScratch.actions';
import { processRecipeImportWithGeminiAction } from './actions/recipeImport.process.actions';
import { finalizeRecipeImportAction } from './actions/recipeImport.finalize.actions';
import { getCatalogOptionsForPickerAction } from '../actions/catalog-options.actions';
import type { RecipeImportJob, RecipeImportStatus } from './recipeImport.types';
import type { GeminiExtractedRecipe } from './recipeImport.gemini.schemas';

/** Shape of URL-import diagnostics (from server when RECIPE_IMPORT_DEBUG=true). No import from server-only service. */
type UrlImportDiagnostics = {
  html: {
    strategy: string;
    matchedSelector: string;
    bytesBefore: number;
    bytesAfter: number;
    wasTruncated: boolean;
    truncateMode: string;
  };
  parseRepair: {
    usedExtractJsonFromResponse: boolean;
    usedRepairTruncatedJson: boolean;
    addedMissingClosers: boolean;
    injectedPlaceholdersIngredients: boolean;
    injectedPlaceholdersInstructions: boolean;
  };
  ingredientCount: number;
  instructionCount: number;
  minNonPlaceholderIngredientCount: number;
  minNonPlaceholderInstructionCount: number;
  confidence_overall: number | null;
  language_detected: string | null;
};

// Maximum file size for processing (server action bodySizeLimit is 10MB in next.config)
const MAX_FILE_SIZE_FOR_PROCESSING = 10 * 1024 * 1024; // 10MB
const MAX_RECIPE_PAGES = 5;

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
      const img = document.createElement('img');
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

/** Map known English warning strings from Gemini to recipeImport translation keys (user language) */
const WARNING_TRANSLATION_MAP: { pattern: RegExp | string; key: string }[] = [
  {
    pattern: /cook_minutes is missing|cook time is missing/i,
    key: 'warningCookMinutesMissing',
  },
  {
    pattern: /resting time is not included in total/i,
    key: 'warningRestingTimeNotIncluded',
  },
  {
    pattern: /prep_minutes is missing|prep time is missing/i,
    key: 'warningPrepMinutesMissing',
  },
  {
    pattern: /total_minutes is missing|total time is missing/i,
    key: 'warningTotalMinutesMissing',
  },
];

function getWarningDisplayText(
  warning: string,
  t: (key: string) => string,
): string {
  const normalized = warning.trim();
  for (const { pattern, key } of WARNING_TRANSLATION_MAP) {
    if (
      typeof pattern === 'string'
        ? normalized.toLowerCase() === pattern.toLowerCase()
        : pattern.test(normalized)
    ) {
      return t(key);
    }
  }
  return warning;
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
  const { showToast } = useToast();
  const [isPending, _startTransition] = useTransition();

  // Local file state: one or more pages (file + preview URL per page)
  const [localPages, setLocalPages] = useState<
    Array<{ file: File; previewUrl: string }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Derived for backward compat: first page as "single" file/preview
  const localSelectedFile = localPages[0]?.file ?? null;
  const _previewUrl = localPages[0]?.previewUrl ?? null;

  // URL import (inline block)
  const [urlImportValue, setUrlImportValue] = useState('');
  const [urlImportError, setUrlImportError] = useState<string | null>(null);
  const [duplicateRecipeId, setDuplicateRecipeId] = useState<string | null>(
    null,
  );
  const [duplicateRecipeName, setDuplicateRecipeName] = useState<string | null>(
    null,
  );
  const [isUrlImportPending, startUrlImportTransition] = useTransition();

  // Text paste import
  const [textImportValue, setTextImportValue] = useState('');
  const [textImportError, setTextImportError] = useState<string | null>(null);
  const [isTextImportPending, startTextImportTransition] = useTransition();

  // From scratch
  const [isFromScratchPending, startFromScratchTransition] = useTransition();

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
  const [mealSlotOptions, setMealSlotOptions] = useState<
    { id: string; label: string; key?: string | null }[]
  >([]);
  const [selectedMealSlotOptionId, setSelectedMealSlotOptionId] =
    useState<string>('');
  const [urlImportDiagnostics, setUrlImportDiagnostics] =
    useState<UrlImportDiagnostics | null>(null);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);

  // Get jobId from URL or initial prop
  const jobId = initialJobId ?? searchParams.get('jobId') ?? null;
  const loadedJobIdRef = useRef<string | null>(null);

  // Derived UI state from remote job
  // If processingJob is true, always show processing state
  const uiState: RecipeImportStatus | 'idle' = processingJob
    ? 'processing'
    : remoteJob
      ? remoteJob.status
      : jobId
        ? 'processing' // Loading state
        : 'idle';

  // Load meal_slot catalog options (same as receptenbeheer Soort) when showing finalize step
  useEffect(() => {
    if (uiState !== 'ready_for_review' || mealSlotOptions.length > 0) return;
    getCatalogOptionsForPickerAction({ dimension: 'meal_slot' }).then((res) => {
      if (res.ok) {
        setMealSlotOptions(res.data);
        const dinnerOpt = res.data.find((o) => o.key === 'dinner');
        if (dinnerOpt && !selectedMealSlotOptionId)
          setSelectedMealSlotOptionId(dinnerOpt.id);
      }
    });
  }, [uiState, mealSlotOptions.length, selectedMealSlotOptionId]);

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

  // Load job whenever jobId in URL is present; use job from sessionStorage if just returned from URL import.
  // Only load once per jobId to avoid repeated requests (e.g. from remounts or strict mode).
  useEffect(() => {
    if (!jobId) {
      loadedJobIdRef.current = null;
      return;
    }
    if (loadingJob) return;
    // Already have this job in state (e.g. from sessionStorage or previous load)
    if (remoteJob?.id === jobId) {
      loadedJobIdRef.current = jobId;
      return;
    }
    // Already loaded this jobId in this mount – avoid duplicate load
    if (loadedJobIdRef.current === jobId) return;

    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(`recipe-import-job-${jobId}`);
        if (stored) {
          const job = JSON.parse(stored) as RecipeImportJob;
          if (job.id === jobId) {
            sessionStorage.removeItem(`recipe-import-job-${jobId}`);
            setRemoteJob(job);
            setError(null);
            loadedJobIdRef.current = jobId;
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    loadedJobIdRef.current = jobId;
    loadJob(jobId);
  }, [jobId]);

  // Load URL-import diagnostics from sessionStorage when job is set (only when RECIPE_IMPORT_DEBUG was on)
  useEffect(() => {
    if (!remoteJob?.id || typeof window === 'undefined') {
      setUrlImportDiagnostics(null);
      return;
    }
    setIsDebugModalOpen(false);
    try {
      const raw = sessionStorage.getItem(
        `recipe-import-diagnostics-${remoteJob.id}`,
      );
      if (raw) {
        const d = JSON.parse(raw) as UrlImportDiagnostics;
        setUrlImportDiagnostics(d);
      } else {
        setUrlImportDiagnostics(null);
      }
    } catch {
      setUrlImportDiagnostics(null);
    }
  }, [remoteJob?.id]);

  // Translation happens during extraction, no polling needed

  // Handle file selection (add one page; create job only when adding first page)
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        setError(t('errorImageOnly'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError(t('errorFileTooLarge'));
        return;
      }

      setError(null);
      const previewUrlForFile = URL.createObjectURL(file);
      const newPage = { file, previewUrl: previewUrlForFile };

      const isFirstPage = localPages.length === 0;
      if (localPages.length >= MAX_RECIPE_PAGES) {
        URL.revokeObjectURL(previewUrlForFile);
        setError(t('errorMaxPages'));
        return;
      }

      if (isFirstPage) {
        setProcessingJob(true);
        try {
          const result = await createRecipeImportAction({
            sourceImageMeta: {
              filename: file.name,
              size: file.size,
              mimetype: file.type,
            },
            targetLocale: locale || 'nl',
          });

          if (!result.ok) {
            URL.revokeObjectURL(previewUrlForFile);
            setError(result.error.message);
            setProcessingJob(false);
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
          setLocalPages([newPage]);
          router.push(`/recipes/import?jobId=${newJobId}`);
        } catch (err) {
          URL.revokeObjectURL(previewUrlForFile);
          const msg = isNetworkOrFetchError(err)
            ? t('errorNetworkOrTimeout')
            : err instanceof Error
              ? err.message
              : t('errorUnknown');
          setError(msg);
        } finally {
          setProcessingJob(false);
        }
      } else {
        setLocalPages((prev) => [...prev, newPage]);
      }
    },
    [t, router, locale, localPages.length],
  );

  // Remove a page by index; if no pages left, reset to idle
  const handleRemovePage = useCallback(
    (index: number) => {
      setLocalPages((prev) => {
        const next = prev.filter((_, i) => i !== index);
        const removed = prev[index];
        if (removed?.previewUrl) {
          URL.revokeObjectURL(removed.previewUrl);
        }
        if (next.length === 0) {
          setRemoteJob(null);
          setError(null);
          router.push('/recipes/import');
        }
        return next;
      });
    },
    [router],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = '';
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
      // Prefer portrait on mobile (narrow screen or portrait orientation)
      const isPortraitPreferred =
        typeof window !== 'undefined' &&
        (window.innerWidth < 640 || window.innerHeight > window.innerWidth);
      const videoConstraints: MediaTrackConstraints = isPortraitPreferred
        ? {
            facingMode: 'environment',
            width: { ideal: 720 },
            height: { ideal: 1280 },
          }
        : { facingMode: 'environment' };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: isPortraitPreferred
            ? { width: { ideal: 720 }, height: { ideal: 1280 } }
            : true,
          audio: false,
        });
      }
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

    const streamW = video.videoWidth;
    const streamH = video.videoHeight;
    if (streamW === 0 || streamH === 0) return;

    // WYSIWYG: capture exactly what the user sees in the preview.
    // The video is shown with object-cover, so we compute the visible source
    // rectangle and draw that to a canvas with the same aspect ratio as the display.
    const displayRect = video.getBoundingClientRect();
    const displayW = displayRect.width;
    const displayH = displayRect.height;
    const scale = Math.max(displayW / streamW, displayH / streamH);
    const srcW = displayW / scale;
    const srcH = displayH / scale;
    const srcX = (streamW - srcW) / 2;
    const srcY = (streamH - srcH) / 2;

    const pixelRatio = Math.min(
      2,
      typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1,
    );
    const outW = Math.round(displayW * pixelRatio);
    const outH = Math.round(displayH * pixelRatio);
    canvas.width = outW;
    canvas.height = outH;

    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

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
    if (!cameraOpen || !cameraStream) return;

    const attachAndPlay = (video: HTMLVideoElement): void => {
      video.srcObject = cameraStream;
      video.muted = true;
      video.playsInline = true;
      requestAnimationFrame(() => {
        video.play().catch((err) => {
          console.warn('Camera video play failed:', err);
        });
      });
    };

    const video = videoRef.current;
    if (video) {
      attachAndPlay(video);
      return;
    }

    // Dialog may mount the video element after this effect (portal/transition)
    const retryId = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && cameraStream) attachAndPlay(v);
    }, 100);
    return () => clearTimeout(retryId);
  }, [cameraOpen, cameraStream]);

  const handleStartProcessing = useCallback(async () => {
    if (!remoteJob || localPages.length === 0 || processingJob) return;

    setProcessingJob(true);
    setError(null);

    try {
      const dataUrls: string[] = [];
      for (let i = 0; i < localPages.length; i++) {
        let file = localPages[i].file;
        if (file.size > MAX_FILE_SIZE_FOR_PROCESSING) {
          try {
            file = await compressImage(file, 1200, 1200, 0.75);
          } catch {
            // keep original
          }
        }
        if (file.size > MAX_FILE_SIZE_FOR_PROCESSING) {
          setError(t('errorFileTooLargeForProcessing'));
          setProcessingJob(false);
          return;
        }
        dataUrls.push(await fileToDataUrl(file));
      }

      const result =
        dataUrls.length === 1
          ? await processRecipeImportWithGeminiAction({
              jobId: remoteJob.id,
              imageDataUrl: dataUrls[0],
            })
          : await processRecipeImportWithGeminiAction({
              jobId: remoteJob.id,
              imageDataUrls: dataUrls,
            });

      if (result.ok) {
        await loadJob(remoteJob.id);
      } else {
        setError(result.error.message);
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
  }, [remoteJob, localPages, processingJob, loadJob, t]);

  const handleRetry = useCallback(async () => {
    if (!remoteJob) {
      setRemoteJob(null);
      setLocalPages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return [];
      });
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.push('/recipes/import');
      return;
    }
    if (remoteJob.status === 'failed' && localPages.length > 0) {
      await handleStartProcessing();
    } else {
      setRemoteJob(null);
      setLocalPages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return [];
      });
      setError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.push('/recipes/import');
    }
  }, [remoteJob, localPages.length, handleStartProcessing, router]);

  const handleFullReset = useCallback(() => {
    setRemoteJob(null);
    setLocalPages((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setError(null);
    setSelectedMealSlotOptionId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    router.push('/recipes/import');
  }, [router]);

  // URL import submit (inline block)
  const handleUrlImportSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isUrlImportPending) return;
      setUrlImportError(null);
      setDuplicateRecipeId(null);
      setDuplicateRecipeName(null);
      const raw = urlImportValue.trim();
      if (!raw) {
        setUrlImportError(
          locale === 'nl' ? 'Voer een URL in' : 'Please enter a URL',
        );
        return;
      }
      setIsDebugModalOpen(false);
      let url = raw;
      if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
        url = `https://${raw}`;
      }
      try {
        new URL(url);
      } catch {
        setUrlImportError(locale === 'nl' ? 'Ongeldige URL' : 'Invalid URL');
        return;
      }
      startUrlImportTransition(async () => {
        try {
          const result = await importRecipeFromUrlAction({ url });
          if (!result) {
            setUrlImportError(
              locale === 'nl'
                ? 'Geen resultaat van de server. Probeer het opnieuw.'
                : 'No response from server. Please try again.',
            );
            return;
          }
          if (result.ok && result.jobId) {
            if (result.job && typeof window !== 'undefined') {
              try {
                sessionStorage.setItem(
                  `recipe-import-job-${result.jobId}`,
                  JSON.stringify(result.job),
                );
              } catch {
                // ignore
              }
            }
            if (result.diagnostics && typeof window !== 'undefined') {
              try {
                sessionStorage.setItem(
                  `recipe-import-diagnostics-${result.jobId}`,
                  JSON.stringify(result.diagnostics),
                );
              } catch {
                // ignore
              }
            }
            setUrlImportValue('');
            setUrlImportError(null);
            setDuplicateRecipeId(null);
            setDuplicateRecipeName(null);
            router.push(`/recipes/import?jobId=${result.jobId}`);
          } else {
            const raw = result as Record<string, unknown>;
            const resultRecipeId =
              raw?.recipeId != null
                ? String(raw.recipeId)
                : ((result as { recipeId?: string }).recipeId ?? null);
            const resultRecipeName =
              (raw?.recipeName != null ? String(raw.recipeName) : null) ??
              (result as { recipeName?: string }).recipeName ??
              null;
            const isDuplicate =
              raw?.errorCode === 'DUPLICATE_URL' ||
              (typeof raw?.message === 'string' &&
                (raw.message.includes('bestaande recept') ||
                  raw.message.includes('al eerder geïmporteerd')));
            const duplicateId = resultRecipeId;
            const duplicateName = resultRecipeName;
            if (duplicateId) {
              setDuplicateRecipeId(duplicateId);
              setDuplicateRecipeName(duplicateName);
            }
            const msg =
              (typeof raw?.message === 'string' ? raw.message : null) ||
              (result &&
              'message' in result &&
              typeof result.message === 'string'
                ? result.message
                : null) ||
              (locale === 'nl'
                ? 'Importeren mislukt. Probeer een andere URL.'
                : 'Import failed. Try another URL.');
            setUrlImportError(msg);
            const title =
              (isDuplicate || duplicateId) && locale === 'nl'
                ? 'Recept bestaat al'
                : t('urlImportErrorTitle');
            showToast({
              type: 'error',
              title,
              description: msg,
              action: duplicateId
                ? {
                    label: locale === 'nl' ? 'Open recept' : 'Open recipe',
                    href: `/recipes/${duplicateId}`,
                  }
                : isDuplicate
                  ? {
                      label: locale === 'nl' ? 'Naar recepten' : 'View recipes',
                      href: '/recipes',
                    }
                  : undefined,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Import failed';
          setUrlImportError(msg);
          showToast({
            type: 'error',
            title: t('urlImportErrorTitle'),
            description: msg,
          });
        }
      });
    },
    [
      urlImportValue,
      isUrlImportPending,
      locale,
      router,
      showToast,
      t,
      startUrlImportTransition,
    ],
  );

  const handleTextImportSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isTextImportPending) return;
      setTextImportError(null);
      const text = textImportValue.trim();
      if (!text) {
        setTextImportError(t('textImportPlaceholder'));
        return;
      }
      if (text.length < 10) {
        setTextImportError(t('textImportMinLength'));
        return;
      }
      startTextImportTransition(async () => {
        try {
          const result = await importRecipeFromTextAction({ text });
          if (result.ok && result.jobId) {
            if (result.job && typeof window !== 'undefined') {
              try {
                sessionStorage.setItem(
                  `recipe-import-job-${result.jobId}`,
                  JSON.stringify(result.job),
                );
              } catch {
                // ignore
              }
            }
            setTextImportValue('');
            setTextImportError(null);
            router.push(`/recipes/import?jobId=${result.jobId}`);
          } else {
            const errorMsg = !result.ok ? result.message : t('textImportError');
            setTextImportError(errorMsg);
            showToast({
              type: 'error',
              title: t('textImportErrorTitle'),
              description: errorMsg,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('textImportError');
          setTextImportError(msg);
          showToast({
            type: 'error',
            title: t('textImportErrorTitle'),
            description: msg,
          });
        }
      });
    },
    [
      textImportValue,
      isTextImportPending,
      router,
      showToast,
      t,
      startTextImportTransition,
    ],
  );

  const handleFromScratch = useCallback(() => {
    if (isFromScratchPending) return;
    startFromScratchTransition(async () => {
      try {
        const result = await createRecipeImportFromScratchAction();
        if (result.ok && result.data.jobId) {
          if (result.data.job && typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(
                `recipe-import-job-${result.data.jobId}`,
                JSON.stringify(result.data.job),
              );
            } catch {
              // ignore
            }
          }
          router.push(`/recipes/import?jobId=${result.data.jobId}`);
        } else {
          const errorMsg = !result.ok
            ? result.error.message
            : t('fromScratchError');
          showToast({
            type: 'error',
            title: t('fromScratchErrorTitle'),
            description: errorMsg,
          });
        }
      } catch (err) {
        showToast({
          type: 'error',
          title: t('fromScratchErrorTitle'),
          description:
            err instanceof Error ? err.message : t('fromScratchError'),
        });
      }
    });
  }, [isFromScratchPending, router, showToast, t, startFromScratchTransition]);

  // Translation happens automatically - no manual trigger needed

  // Handle finalize recipe import
  const handleFinalize = useCallback(async () => {
    if (!remoteJob || finalizingJob) return;

    setFinalizingJob(true);
    setError(null);

    try {
      const result = await finalizeRecipeImportAction({
        jobId: remoteJob.id,
        mealSlotOptionId: selectedMealSlotOptionId || undefined,
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
  }, [remoteJob, finalizingJob, selectedMealSlotOptionId, router, loadJob, t]);

  const localPagesRef = useRef(localPages);
  localPagesRef.current = localPages;
  useEffect(() => {
    return () => {
      localPagesRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

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
        <div className="flex flex-col items-center justify-center space-y-4 py-12 text-center">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-primary-600 dark:text-primary-400" />
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
        <div className="space-y-6">
          <div>
            <Heading level={2}>{t('uploadTitle')}</Heading>
            <Text>{t('uploadDescription')}</Text>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
            {/* Left column: image upload + URL import */}
            <div className="space-y-6">
              {/* Dropzone */}
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="relative flex min-h-[280px] flex-col justify-center rounded-lg border-2 border-dashed border-zinc-300 p-8 transition-colors hover:border-primary-400 dark:border-zinc-700 dark:hover:border-primary-600"
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

                <div className="flex flex-col items-center justify-center space-y-4 text-center">
                  <div className="rounded-full bg-primary-100 p-4 dark:bg-primary-900/30">
                    <PhotoIcon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <label
                      htmlFor="recipe-upload-input"
                      className="cursor-pointer"
                    >
                      <Button
                        as="span"
                        color="primary"
                        disabled={isPending}
                        className="w-full sm:w-auto"
                      >
                        <PhotoIcon className="mr-2 h-4 w-4" />
                        {isPending ? t('uploading') : t('selectFile')}
                      </Button>
                    </label>
                    <Button
                      onClick={handleOpenCamera}
                      disabled={isPending}
                      color="primary"
                      className="w-full sm:w-auto"
                    >
                      <CameraIcon className="mr-2 h-4 w-4" />
                      {t('takePhoto')}
                    </Button>
                    <Button
                      onClick={async () => {
                        // Try to read from clipboard API (works in some browsers)
                        try {
                          if (navigator.clipboard && navigator.clipboard.read) {
                            const items = await navigator.clipboard.read();
                            const imageItem = items.find((item) =>
                              item.types.some((type) =>
                                type.startsWith('image/'),
                              ),
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
                      <ClipboardDocumentIcon className="mr-2 h-4 w-4" />
                      {t('pasteImage')}
                    </Button>
                  </div>
                  <Text className="mt-2">{t('dragDrop')}</Text>
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t('fileTypes')}
                  </Text>
                </div>
              </div>

              {/* URL import block */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                <form
                  onSubmit={handleUrlImportSubmit}
                  className="flex flex-col items-center space-y-4 text-center"
                >
                  <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('importViaUrlOr')}
                  </Text>
                  <Field className="w-full text-left">
                    <Label htmlFor="recipe-url-inline">
                      {t('recipeUrlLabel')}
                    </Label>
                    <div className="mt-2">
                      <div className="flex items-center rounded-md bg-white pl-3 shadow-sm ring-1 ring-zinc-950/10 focus-within:ring-2 focus-within:ring-primary-500 focus-within:ring-offset-0 dark:bg-zinc-800/80 dark:ring-white/10 dark:focus-within:ring-primary-400">
                        <span className="shrink-0 text-base text-zinc-500 select-none sm:text-sm/6 dark:text-zinc-400">
                          https://
                        </span>
                        <input
                          id="recipe-url-inline"
                          type="text"
                          name="recipe-url"
                          value={urlImportValue}
                          onChange={(e) => setUrlImportValue(e.target.value)}
                          placeholder={t('recipeUrlPlaceholder')}
                          disabled={isUrlImportPending || isPending}
                          className="block min-w-0 grow rounded-r-md border-0 bg-transparent py-2.5 pr-3 pl-2 text-base text-zinc-900 outline-none placeholder:text-zinc-500 focus:ring-0 sm:text-sm/6 dark:text-zinc-100 dark:placeholder:text-zinc-400"
                          aria-invalid={urlImportError ? 'true' : 'false'}
                          aria-describedby={
                            urlImportError
                              ? 'recipe-url-inline-error'
                              : 'recipe-url-inline-hint'
                          }
                        />
                      </div>
                    </div>
                    {urlImportError ? (
                      <div
                        id="recipe-url-inline-error"
                        role="alert"
                        className="mt-2 text-base/6 text-red-600 data-disabled:opacity-50 sm:text-sm/6 dark:text-red-500"
                      >
                        <div className="space-y-2">
                          <div>{urlImportError}</div>
                          {duplicateRecipeId && (
                            <Link
                              href={`/recipes/${duplicateRecipeId}`}
                              className="text-sm text-primary-600 hover:text-primary-500 dark:text-primary-400"
                            >
                              {duplicateRecipeName
                                ? `Open bestaand recept: ${duplicateRecipeName}`
                                : 'Open bestaand recept'}
                            </Link>
                          )}
                        </div>
                      </div>
                    ) : (
                      <Description id="recipe-url-inline-hint" className="mt-2">
                        {t('urlImportHint')}
                      </Description>
                    )}
                  </Field>
                  <Button
                    type="submit"
                    color="primary"
                    disabled={isUrlImportPending || isPending}
                    className="w-full min-w-[8rem] sm:w-auto"
                  >
                    {isUrlImportPending ? (
                      <>
                        <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                        {t('processing')}
                      </>
                    ) : (
                      t('urlImportButton')
                    )}
                  </Button>
                </form>
              </div>
            </div>

            {/* Right column: text paste + from scratch */}
            <div className="space-y-6">
              {/* Text paste import */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                <form
                  onSubmit={handleTextImportSubmit}
                  className="flex flex-col space-y-4"
                >
                  <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('textImportHeading')}
                  </Text>
                  <Field className="w-full text-left">
                    <Label htmlFor="recipe-text-paste">
                      {t('textImportLabel')}
                    </Label>
                    <Textarea
                      id="recipe-text-paste"
                      name="recipe-text"
                      value={textImportValue}
                      onChange={(e) => {
                        setTextImportValue(e.target.value);
                        if (textImportError) setTextImportError(null);
                      }}
                      placeholder={t('textImportPlaceholder')}
                      disabled={isTextImportPending || isPending}
                      rows={6}
                      className="mt-2"
                      aria-invalid={textImportError ? 'true' : 'false'}
                      aria-describedby={
                        textImportError
                          ? 'recipe-text-error'
                          : 'recipe-text-hint'
                      }
                    />
                    {textImportError ? (
                      <ErrorMessage id="recipe-text-error" className="mt-2">
                        {textImportError}
                      </ErrorMessage>
                    ) : (
                      <Description id="recipe-text-hint" className="mt-2">
                        {t('textImportHint')}
                      </Description>
                    )}
                  </Field>
                  <Button
                    type="submit"
                    color="primary"
                    disabled={
                      isTextImportPending ||
                      isPending ||
                      textImportValue.trim().length < 10
                    }
                    className="w-full min-w-[8rem] sm:w-auto"
                  >
                    {isTextImportPending ? (
                      <>
                        <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                        {t('processing')}
                      </>
                    ) : (
                      <>
                        <DocumentTextIcon className="mr-2 h-4 w-4" />
                        {t('textImportButton')}
                      </>
                    )}
                  </Button>
                </form>
              </div>

              {/* From scratch */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                <Text className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('fromScratchHeading')}
                </Text>
                <Text className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  {t('fromScratchDescription')}
                </Text>
                <Button
                  type="button"
                  onClick={handleFromScratch}
                  disabled={isFromScratchPending || isPending}
                  outline
                  className="w-full sm:w-auto"
                >
                  {isFromScratchPending ? (
                    <>
                      <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                      {t('loading')}
                    </>
                  ) : (
                    <>
                      <PencilSquareIcon className="mr-2 h-4 w-4" />
                      {t('fromScratchButton')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview: thumbnails for all pages */}
      {localPages.length > 0 && uiState !== 'failed' && (
        <div className="space-y-3">
          <Text className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {localPages.length === 1
              ? t('pagePreview')
              : t('pagesPreview', { count: localPages.length })}
          </Text>
          <div className="flex flex-wrap gap-3">
            {localPages.map((page, index) => (
              <div
                key={index}
                className="group relative h-40 w-32 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Image
                  src={page.previewUrl}
                  alt={t('pageNumber', { number: index + 1 })}
                  fill
                  className="object-cover"
                  sizes="128px"
                  unoptimized
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                  <span className="text-xs font-medium text-white">
                    {t('pageNumber', { number: index + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePage(index)}
                    className="rounded p-1 text-white hover:bg-white/20 focus:ring-2 focus:ring-white focus:outline-none"
                    aria-label={t('removePage')}
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add another page (when job is uploaded/failed and we have 1–4 pages) */}
      {remoteJob &&
        (remoteJob.status === 'uploaded' || remoteJob.status === 'failed') &&
        !processingJob &&
        localPages.length >= 1 &&
        localPages.length < MAX_RECIPE_PAGES && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
            <Text className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('addAnotherPage')}
            </Text>
            <div className="flex flex-wrap gap-2">
              <label htmlFor="recipe-upload-input" className="cursor-pointer">
                <Button as="span" outline className="text-sm">
                  <PhotoIcon className="mr-1.5 h-4 w-4" />
                  {t('selectFile')}
                </Button>
              </label>
              <Button onClick={handleOpenCamera} outline className="text-sm">
                <CameraIcon className="mr-1.5 h-4 w-4" />
                {t('takePhoto')}
              </Button>
              <Button
                onClick={async () => {
                  try {
                    if (navigator.clipboard?.read) {
                      const items = await navigator.clipboard.read();
                      const imageItem = items.find((item) =>
                        item.types.some((t) => t.startsWith('image/')),
                      );
                      if (imageItem) {
                        const imageType = imageItem.types.find((t) =>
                          t.startsWith('image/'),
                        );
                        if (imageType) {
                          const blob = await imageItem.getType(imageType);
                          const file = new File(
                            [blob],
                            `paste-${Date.now()}.${imageType.split('/')[1]}`,
                            { type: imageType, lastModified: Date.now() },
                          );
                          handleFileSelect(file);
                          return;
                        }
                      }
                    }
                    setError(t('pasteHint'));
                  } catch {
                    setError(t('pasteHint'));
                  }
                }}
                outline
                className="text-sm"
              >
                <ClipboardDocumentIcon className="mr-1.5 h-4 w-4" />
                {t('pasteImage')}
              </Button>
            </div>
            {localPages.length >= MAX_RECIPE_PAGES - 1 && (
              <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                {t('maxPagesHint')}
              </Text>
            )}
          </div>
        )}

      {/* Error Display */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
            <Text className="font-medium text-red-600 dark:text-red-400">
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

          {/* Debug details (only when diagnostics present from URL import) */}
          {urlImportDiagnostics && (
            <div className="flex items-center gap-3 py-2">
              <Button
                type="button"
                outline
                onClick={() => setIsDebugModalOpen(true)}
                className="text-sm"
              >
                Debug details
              </Button>
            </div>
          )}

          {/* Start Processing Button - Only show if not already processing and file is available */}
          {(remoteJob.status === 'uploaded' || remoteJob.status === 'failed') &&
            !processingJob && (
              <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                {localPages.length === 0 ? (
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
                        <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
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
              <div className="flex flex-col items-center justify-center space-y-4 rounded-lg border border-primary-200 bg-primary-50 py-6 text-center dark:border-primary-800 dark:bg-primary-950/30">
                <div className="relative">
                  <SparklesIcon className="h-12 w-12 animate-pulse text-primary-600 dark:text-primary-400" />
                  <div className="absolute inset-0 animate-pulse rounded-full bg-primary-400/20 blur-xl" />
                </div>
                <div className="space-y-2">
                  <Text className="text-lg font-semibold text-primary-900 dark:text-primary-100">
                    {t('processing')}
                  </Text>
                  <Text className="text-sm text-primary-700 dark:text-primary-300">
                    {t('processingDescription')}
                  </Text>
                  {error && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/50">
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
              <div className="space-y-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                {/* Title Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>

                {/* Language Info Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-5 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>

                {/* Servings Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-5 w-12 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                </div>

                {/* Times Skeleton */}
                <div className="space-y-2">
                  <div className="h-4 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="space-y-2">
                    <div className="h-5 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                    <div className="h-5 w-36 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  </div>
                </div>

                {/* Ingredients Skeleton */}
                <div className="space-y-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <ul className="space-y-2">
                    {[65, 80, 55, 70, 60].map((width, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                        <div
                          className={`h-5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800`}
                          style={{ width: `${width}%` }}
                        />
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Instructions Skeleton */}
                <div className="space-y-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <ol className="space-y-2">
                    {[75, 85, 70, 80].map((width, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                        <div
                          className={`h-5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800`}
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
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-400" />
                <div className="flex-1">
                  <Text className="mb-2 font-medium text-red-600 dark:text-red-400">
                    {t('uploadFailed')}
                  </Text>
                  {validationErrors && (
                    <div className="mb-4 space-y-2">
                      {(validationErrors as { stage?: string }).stage && (
                        <Text className="text-sm text-red-600 dark:text-red-400">
                          <strong>{t('errorStage')}:</strong>{' '}
                          {(t as (key: string) => string)(
                            `errorStage${(validationErrors as { stage?: string }).stage}`,
                          )}
                        </Text>
                      )}
                      {(validationErrors as { message?: string }).message && (
                        <Text className="text-sm text-red-500 dark:text-red-400">
                          {String(
                            (validationErrors as { message?: string }).message,
                          )}
                        </Text>
                      )}
                    </div>
                  )}
                  {localPages.length > 0 && (
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
            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
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
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
                        <div className="flex items-start gap-2">
                          <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
                          <div className="flex-1">
                            <Text className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                              {t('warnings')}
                            </Text>
                            <ul className="list-inside list-disc space-y-1">
                              {extractedRecipe.warnings.map((warning, idx) => (
                                <li
                                  key={idx}
                                  className="text-sm text-amber-700 dark:text-amber-300"
                                >
                                  {getWarningDisplayText(warning, t)}
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
                    const sourceImageMeta = remoteJob.sourceImageMeta as Record<
                      string,
                      unknown
                    >;
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
                  <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <div className="space-y-4">
                      {/* Categorie (Soort) – simple custom listbox i.p.v. native select */}
                      <div>
                        <Text
                          id="meal-slot-label"
                          className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300"
                        >
                          {t('mealSlotLabel')}
                        </Text>
                        <Listbox
                          aria-labelledby="meal-slot-label"
                          value={selectedMealSlotOptionId ?? ''}
                          onChange={(value) =>
                            setSelectedMealSlotOptionId(
                              value === '' ? '' : String(value),
                            )
                          }
                          disabled={finalizingJob}
                          aria-label={t('mealSlotLabel')}
                          placeholder={t('mealSlotOptional')}
                        >
                          <ListboxOption value="">
                            {t('mealSlotOptional')}
                          </ListboxOption>
                          {mealSlotOptions.map((opt) => (
                            <ListboxOption key={opt.id} value={opt.id}>
                              {opt.label}
                            </ListboxOption>
                          ))}
                        </Listbox>
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
                            <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
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
                <div className="py-8 text-center">
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
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950/50">
              <div className="flex items-start gap-3">
                <CheckCircleIcon className="mt-0.5 h-6 w-6 text-green-600 dark:text-green-400" />
                <div className="flex-1">
                  <Heading
                    level={3}
                    className="mb-2 text-green-800 dark:text-green-200"
                  >
                    {t('finalizeSuccessTitle')}
                  </Heading>
                  <Text className="mb-4 text-green-700 dark:text-green-300">
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

      {/* Debug diagnostics modal (URL import, RECIPE_IMPORT_DEBUG only) */}
      <Dialog
        open={isDebugModalOpen && !!urlImportDiagnostics}
        onClose={() => setIsDebugModalOpen(false)}
        size="lg"
      >
        <DialogTitle>Debug details (URL import)</DialogTitle>
        <DialogBody>
          {urlImportDiagnostics && (
            <div className="space-y-6">
              <div>
                <Subheading level={3} className="mb-2">
                  HTML extractie
                </Subheading>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">strategy</dt>
                  <dd className="font-medium">
                    {urlImportDiagnostics.html.strategy}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    matchedSelector
                  </dt>
                  <dd className="font-medium">
                    {urlImportDiagnostics.html.matchedSelector}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    bytesBefore
                  </dt>
                  <dd>{urlImportDiagnostics.html.bytesBefore}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    bytesAfter
                  </dt>
                  <dd>{urlImportDiagnostics.html.bytesAfter}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    wasTruncated
                  </dt>
                  <dd>{String(urlImportDiagnostics.html.wasTruncated)}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    truncateMode
                  </dt>
                  <dd>{urlImportDiagnostics.html.truncateMode}</dd>
                </dl>
              </div>
              <div>
                <Subheading level={3} className="mb-2">
                  Parse / repair
                </Subheading>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    usedExtractJsonFromResponse
                  </dt>
                  <dd>
                    {String(
                      urlImportDiagnostics.parseRepair
                        .usedExtractJsonFromResponse,
                    )}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    usedRepairTruncatedJson
                  </dt>
                  <dd>
                    {String(
                      urlImportDiagnostics.parseRepair.usedRepairTruncatedJson,
                    )}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    addedMissingClosers
                  </dt>
                  <dd>
                    {String(
                      urlImportDiagnostics.parseRepair.addedMissingClosers,
                    )}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    injectedPlaceholdersIngredients
                  </dt>
                  <dd>
                    {String(
                      urlImportDiagnostics.parseRepair
                        .injectedPlaceholdersIngredients,
                    )}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    injectedPlaceholdersInstructions
                  </dt>
                  <dd>
                    {String(
                      urlImportDiagnostics.parseRepair
                        .injectedPlaceholdersInstructions,
                    )}
                  </dd>
                </dl>
              </div>
              <div>
                <Subheading level={3} className="mb-2">
                  Counts
                </Subheading>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    ingredientCount
                  </dt>
                  <dd>{urlImportDiagnostics.ingredientCount}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    instructionCount
                  </dt>
                  <dd>{urlImportDiagnostics.instructionCount}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    minNonPlaceholderIngredientCount
                  </dt>
                  <dd>
                    {urlImportDiagnostics.minNonPlaceholderIngredientCount}
                  </dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    minNonPlaceholderInstructionCount
                  </dt>
                  <dd>
                    {urlImportDiagnostics.minNonPlaceholderInstructionCount}
                  </dd>
                </dl>
              </div>
              <div>
                <Subheading level={3} className="mb-2">
                  Model
                </Subheading>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    confidence_overall
                  </dt>
                  <dd>{urlImportDiagnostics.confidence_overall ?? '—'}</dd>
                  <dt className="text-zinc-500 dark:text-zinc-400">
                    language_detected
                  </dt>
                  <dd>{urlImportDiagnostics.language_detected ?? '—'}</dd>
                </dl>
              </div>
              <div>
                <Subheading level={3} className="mb-2">
                  Raw (JSON)
                </Subheading>
                <pre className="max-h-96 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900">
                  {JSON.stringify(urlImportDiagnostics, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button onClick={() => setIsDebugModalOpen(false)} outline>
            Sluiten
          </Button>
        </DialogActions>
      </Dialog>

      {/* Camera Dialog */}
      <Dialog open={cameraOpen} onClose={handleCloseCamera} size="lg">
        <DialogTitle>{t('cameraTitle')}</DialogTitle>
        <DialogBody>
          <div className="space-y-4">
            <div className="relative aspect-[3/4] max-h-[70vh] overflow-hidden rounded-lg bg-zinc-900 sm:max-h-none">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <Text className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              {t('cameraHint')}
            </Text>
          </div>
        </DialogBody>
        <DialogActions>
          <Button onClick={handleCloseCamera} outline>
            {t('cancel')}
          </Button>
          <Button onClick={handleCapturePhoto} color="primary">
            <CameraIcon className="mr-2 h-4 w-4" />
            {t('capturePhoto')}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
