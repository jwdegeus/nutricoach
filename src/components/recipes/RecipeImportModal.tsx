'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Field,
  Label,
  Description,
  ErrorMessage,
} from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { useTranslations } from 'next-intl';
import { importRecipeFromUrlAction } from '@/src/app/(app)/recipes/import/actions/recipeImport.actions';
import { useToast } from '@/src/components/app/ToastContext';
import { SparklesIcon } from '@heroicons/react/20/solid';

type RecipeImportModalProps = {
  open: boolean;
  onClose: () => void;
};

export function RecipeImportModal({ open, onClose }: RecipeImportModalProps) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [internalOpen, setInternalOpen] = useState(open);
  const t = useTranslations('common');
  const tImport = useTranslations('recipeImport');
  const { showToast } = useToast();

  // Sync internal state with prop, but don't close if there's an error or pending
  React.useEffect(() => {
    if (open) {
      // Opening: reset form and set internal state
      setUrl('');
      setError(null);
      setInternalOpen(true);
    } else if (!isPending && !error) {
      // Only close if not pending and no error
      setInternalOpen(false);
    }
  }, [open, isPending, error]);

  const validateUrl = (urlValue: string): boolean => {
    if (!urlValue.trim()) {
      setError('URL is verplicht');
      return false;
    }

    if (!urlValue.startsWith('http://') && !urlValue.startsWith('https://')) {
      setError('URL moet beginnen met http:// of https://');
      return false;
    }

    try {
      new URL(urlValue);
      return true;
    } catch {
      setError('Ongeldige URL');
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent any bubbling that might close the dialog

    // Don't submit if already pending
    if (isPending) {
      console.log('[RecipeImportModal] Already processing, ignoring submit');
      return;
    }

    setError(null);

    if (!validateUrl(url)) {
      return;
    }

    console.log('[RecipeImportModal] Starting import for URL:', url);

    startTransition(async () => {
      try {
        const result = await importRecipeFromUrlAction({ url });
        console.log(
          '[RecipeImportModal] Action result:',
          JSON.stringify(result, null, 2),
        );

        // Ensure we always have a result object
        if (!result) {
          console.error('[RecipeImportModal] No result returned from action');
          setError(
            'Geen resultaat ontvangen van de server. Probeer het opnieuw.',
          );
          return;
        }

        if (result.ok) {
          // Success - pass job (with translated recipe) so import page shows it without refetch
          console.log(
            '[RecipeImportModal] Import successful, jobId:',
            result.jobId,
          );
          setUrl('');
          setError(null);
          setInternalOpen(false);
          if (result.jobId && result.job && typeof window !== 'undefined') {
            try {
              sessionStorage.setItem(
                `recipe-import-job-${result.jobId}`,
                JSON.stringify(result.job),
              );
            } catch {
              // ignore quota / parse errors
            }
          }
          if (result.jobId) {
            router.push(`/recipes/import?jobId=${result.jobId}`);
            onClose();
          } else {
            // Fallback: just close modal
            setTimeout(() => {
              onClose();
            }, 100);
          }
        } else {
          // Show error in modal and as toast; if duplicate, add clickable link to existing recipe
          const raw = result as Record<string, unknown>;
          const recipeId =
            raw?.recipeId != null
              ? String(raw.recipeId)
              : ((result as { recipeId?: string }).recipeId ?? null);
          const isDuplicate =
            raw?.errorCode === 'DUPLICATE_URL' ||
            (typeof raw?.message === 'string' &&
              (raw.message.includes('bestaande recept') ||
                raw.message.includes('al eerder geïmporteerd')));
          const errorMessage =
            (typeof raw?.message === 'string' ? raw.message : null) ||
            result.message ||
            'Er is een fout opgetreden bij het importeren';
          setError(errorMessage);
          setInternalOpen(true); // Keep modal open on error
          showToast({
            type: 'error',
            title:
              isDuplicate || recipeId
                ? 'Recept bestaat al'
                : tImport('urlImportErrorTitle'),
            description: errorMessage,
            action: recipeId
              ? {
                  label: 'Open recept',
                  href: `/recipes/${recipeId}`,
                }
              : isDuplicate
                ? { label: 'Naar recepten', href: '/recipes' }
                : undefined,
          });
        }
      } catch (err) {
        console.error('[RecipeImportModal] Unexpected error:', err);
        const isNetworkError =
          err instanceof Error && err.message === 'Failed to fetch';
        const errorMessage = isNetworkError
          ? tImport('errorNetworkOrTimeout')
          : err instanceof Error
            ? err.message
            : 'Er is een onverwachte fout opgetreden bij het importeren';
        setError(errorMessage);
        showToast({
          type: 'error',
          title: tImport('urlImportErrorTitle'),
          description: errorMessage,
        });
      }
    });
  };

  const handleClose = () => {
    if (!isPending && !error) {
      setUrl('');
      setError(null);
      setInternalOpen(false);
      onClose();
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) {
      setError(null);
    }
  };

  // Prevent closing during loading or when there's an error
  const handleDialogClose = (value: boolean) => {
    console.log(
      '[RecipeImportModal] Dialog close requested, isPending:',
      isPending,
      'error:',
      error,
      'value:',
      value,
    );
    // Don't allow closing if loading
    if (isPending) {
      console.log('[RecipeImportModal] Prevented closing during loading');
      return;
    }
    // Don't allow closing if there's an error (user should see it)
    if (error) {
      console.log('[RecipeImportModal] Prevented closing with error:', error);
      return;
    }
    handleClose();
  };

  // Force dialog to stay open if loading or has error
  const dialogOpen = internalOpen || (isPending || error ? true : open);

  return (
    <Dialog open={dialogOpen} onClose={handleDialogClose}>
      <DialogTitle>Recept importeren via URL</DialogTitle>
      <DialogDescription>
        Plak de URL van het recept dat je wilt importeren
      </DialogDescription>
      <form onSubmit={handleSubmit} noValidate>
        <DialogBody>
          {isPending ? (
            <div className="space-y-6 py-8">
              <div className="text-center">
                <div className="relative mb-4 inline-block">
                  <SparklesIcon className="h-16 w-16 animate-pulse text-blue-500 dark:text-blue-400" />
                  <div className="absolute inset-0 animate-pulse rounded-full bg-blue-400/20 blur-xl" />
                </div>
                <Text className="mb-2 text-lg font-semibold text-zinc-900 dark:text-white">
                  Recept wordt geïmporteerd...
                </Text>
                <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                  AI analyseert de URL en extraheert het recept
                </Text>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-2 w-3/4 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-2 w-5/6 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div
                className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50"
                role="alert"
              >
                <Text className="mb-2 font-medium text-red-600 dark:text-red-400">
                  {tImport('urlImportErrorTitle')}
                </Text>
                <Text className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </Text>
                {(error.toLowerCase().includes('blokkeert') ||
                  error.toLowerCase().includes('access denied') ||
                  error.toLowerCase().includes('toegang')) && (
                  <Text className="mt-3 text-sm text-red-600/90 dark:text-red-400/90">
                    {tImport('urlImportErrorAccessDeniedHint')}
                  </Text>
                )}
              </div>
              <Field>
                <Label htmlFor="recipe-url">Recept URL</Label>
                <Input
                  id="recipe-url"
                  type="url"
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="https://example.com/recept"
                  disabled={isPending}
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? 'url-error' : undefined}
                  data-invalid={error ? '' : undefined}
                />
                <Description>
                  Voer een geldige URL in die begint met http:// of https://
                </Description>
              </Field>
            </div>
          ) : (
            <div className="space-y-4">
              <Field>
                <Label htmlFor="recipe-url">Recept URL</Label>
                <Input
                  id="recipe-url"
                  type="url"
                  value={url}
                  onChange={handleUrlChange}
                  placeholder="https://example.com/recept"
                  disabled={isPending}
                  aria-invalid={error ? 'true' : 'false'}
                  aria-describedby={error ? 'url-error' : undefined}
                  data-invalid={error ? '' : undefined}
                />
                {error && (
                  <div className="mt-2">
                    <ErrorMessage id="url-error">{error}</ErrorMessage>
                  </div>
                )}
                <Description>
                  Voer een geldige URL in die begint met http:// of https://
                </Description>
              </Field>
            </div>
          )}
        </DialogBody>
        {!isPending && (
          <DialogActions>
            <Button
              type="button"
              outline
              onClick={handleClose}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isPending || !url.trim()}>
              Importeren
            </Button>
          </DialogActions>
        )}
      </form>
    </Dialog>
  );
}
