'use client';

import { useState } from 'react';
import { Badge } from '@/components/catalyst/badge';
import { Button } from '@/components/catalyst/button';
import { Text } from '@/components/catalyst/text';
import { Link } from '@/components/catalyst/link';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/20/solid';
import { formatReasonForBadge } from '@/src/lib/guardrails-vnext/ui/reasonLabels';

type GuardrailsViolationMessageProps = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
  dietTypeId?: string;
};

export function GuardrailsViolationMessage({
  reasonCodes,
  contentHash,
  rulesetVersion,
  dietTypeId,
}: GuardrailsViolationMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contentHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const shortHash = contentHash.substring(0, 8);
  const displayReasonCodes = reasonCodes.slice(0, 5);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
      <div className="mb-3">
        <Text className="font-semibold text-red-900 dark:text-red-100">
          Wijziging geblokkeerd door dieetregels
        </Text>
      </div>

      {/* Reason codes */}
      {displayReasonCodes.length > 0 && (
        <div className="mb-3">
          <Text className="mb-2 text-sm font-medium text-red-800 dark:text-red-200">
            Redenen:
          </Text>
          <div className="flex flex-wrap gap-2">
            {displayReasonCodes.map((code, idx) => {
              const { label, code: reasonCode } = formatReasonForBadge(code);
              return (
                <Badge
                  key={idx}
                  color="red"
                  className="text-xs"
                  title={reasonCode}
                >
                  {label}
                </Badge>
              );
            })}
            {reasonCodes.length > 5 && (
              <Badge color="zinc" className="text-xs">
                +{reasonCodes.length - 5} meer
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Hash and version */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Text className="text-red-800 dark:text-red-200">Hash:</Text>
          <code className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs text-red-900 dark:bg-red-900/50 dark:text-red-100">
            {shortHash}
          </code>
          <Button onClick={handleCopy} plain className="h-6 px-2 text-xs">
            {copied ? (
              <>
                <CheckIcon className="h-3 w-3" />
                <span className="ml-1">Gekopieerd</span>
              </>
            ) : (
              <>
                <ClipboardIcon className="h-3 w-3" />
                <span className="ml-1">Kopieer</span>
              </>
            )}
          </Button>
        </div>
        {rulesetVersion !== undefined && (
          <Badge color="zinc" className="text-xs">
            Versie: {rulesetVersion}
          </Badge>
        )}
      </div>

      {/* Link to guardrails settings */}
      {dietTypeId && (
        <div className="mt-3 border-t border-red-200 pt-3 dark:border-red-900/50">
          <Link
            href={`/settings/diets/${dietTypeId}/edit`}
            className="text-sm font-medium text-red-900 underline hover:text-red-700 dark:text-red-100 dark:hover:text-red-300"
          >
            Bekijk Guard Rails →
          </Link>
        </div>
      )}
    </div>
  );
}
