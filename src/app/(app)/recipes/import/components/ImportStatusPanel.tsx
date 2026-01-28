'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/catalyst/badge';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ClockIcon,
} from '@heroicons/react/24/solid';
import type { RecipeImportStatus } from '../recipeImport.types';

// ImportState includes UI-only states (idle, uploading) plus all RecipeImportStatus values
type ImportState = 'idle' | 'uploading' | RecipeImportStatus;

interface ImportStatusPanelProps {
  state: ImportState;
}

export function ImportStatusPanel({ state }: ImportStatusPanelProps) {
  const t = useTranslations('recipeImport');

  const stateConfig: Record<
    ImportState,
    {
      labelKey: string;
      color: 'green' | 'red' | 'yellow' | 'zinc' | 'blue';
      icon: typeof CheckCircleIcon;
      descriptionKey: string;
    }
  > = {
    idle: {
      labelKey: 'statusIdle',
      color: 'zinc',
      icon: ClockIcon,
      descriptionKey: 'statusIdleDesc',
    },
    uploading: {
      labelKey: 'statusUploading',
      color: 'blue',
      icon: ArrowPathIcon,
      descriptionKey: 'statusUploadingDesc',
    },
    uploaded: {
      labelKey: 'statusUploaded',
      color: 'blue',
      icon: CheckCircleIcon,
      descriptionKey: 'statusUploadedDesc',
    },
    processing: {
      labelKey: 'statusProcessing',
      color: 'blue',
      icon: ArrowPathIcon,
      descriptionKey: 'statusProcessingDesc',
    },
    ready_for_review: {
      labelKey: 'statusReady',
      color: 'green',
      icon: CheckCircleIcon,
      descriptionKey: 'statusReadyDesc',
    },
    failed: {
      labelKey: 'statusFailed',
      color: 'red',
      icon: ExclamationTriangleIcon,
      descriptionKey: 'statusFailedDesc',
    },
    finalized: {
      labelKey: 'statusFinalized',
      color: 'green',
      icon: CheckCircleIcon,
      descriptionKey: 'statusFinalizedDesc',
    },
  };

  const config = stateConfig[state];

  // Fallback for unknown states
  if (!config) {
    console.warn(`Unknown import state: ${state}, falling back to 'idle'`);
    const fallbackConfig = stateConfig.idle;
    const FallbackIcon = fallbackConfig.icon;

    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FallbackIcon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
            <div>
              <Heading level={3} className="text-base">
                Import Status
              </Heading>
              <Text className="text-sm" aria-live="polite" aria-atomic="true">
                {t(fallbackConfig.descriptionKey)}
              </Text>
            </div>
          </div>
          <Badge color={fallbackConfig.color}>
            {t(fallbackConfig.labelKey)}
          </Badge>
        </div>
      </div>
    );
  }

  const Icon = config.icon;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50 dark:bg-zinc-900/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`${state === 'uploading' || state === 'processing' ? 'animate-spin' : ''}`}
          >
            <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <Heading level={3} className="text-base">
              Import Status
            </Heading>
            <Text className="text-sm" aria-live="polite" aria-atomic="true">
              {t(config.descriptionKey)}
            </Text>
          </div>
        </div>
        <Badge color={config.color}>{t(config.labelKey)}</Badge>
      </div>
    </div>
  );
}
