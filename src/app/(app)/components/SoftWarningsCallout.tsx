"use client";

import { Badge } from "@/components/catalyst/badge";
import { Text } from "@/components/catalyst/text";
import { Link } from "@/components/catalyst/link";
import { ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { formatReasonForBadge } from "@/src/lib/guardrails-vnext/ui/reasonLabels";

type SoftWarningsCalloutProps = {
  reasonCodes: string[];
  dietTypeId?: string;
  contentHash?: string;
};

/**
 * Soft Warnings Callout Component
 * 
 * Displays non-blocking warnings when guardrails detect soft constraint violations.
 * These warnings inform users but do not prevent actions from proceeding.
 */
export function SoftWarningsCallout({
  reasonCodes,
  dietTypeId,
  contentHash,
}: SoftWarningsCalloutProps) {
  if (reasonCodes.length === 0) {
    return null;
  }

  const displayReasonCodes = reasonCodes.slice(0, 3);
  const remainingCount = reasonCodes.length - displayReasonCodes.length;

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3">
      <div className="flex items-start gap-2">
        <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Text className="text-xs font-medium text-amber-800 dark:text-amber-200">
            Waarschuwingen (niet blokkerend)
          </Text>
          {displayReasonCodes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {displayReasonCodes.map((code, idx) => {
                const { label, code: reasonCode } = formatReasonForBadge(code);
                return (
                  <Badge 
                    key={idx} 
                    color="amber" 
                    className="text-xs"
                    title={reasonCode}
                  >
                    {label}
                  </Badge>
                );
              })}
              {remainingCount > 0 && (
                <Badge color="zinc" className="text-xs">
                  +{remainingCount} meer
                </Badge>
              )}
            </div>
          )}
          {dietTypeId && (
            <div className="pt-1">
              <Link
                href={`/settings/diets/${dietTypeId}/edit`}
                className="text-xs font-medium text-amber-800 underline hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
              >
                Bekijk Guard Rails →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
