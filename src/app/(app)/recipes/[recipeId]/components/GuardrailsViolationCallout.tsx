"use client";

import { useState } from "react";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { Badge } from "@/components/catalyst/badge";
import { ExclamationTriangleIcon, XMarkIcon, ClipboardIcon, CheckIcon } from "@heroicons/react/20/solid";
import { useRouter } from "next/navigation";
import { formatReasonForBadge } from "@/src/lib/guardrails-vnext/ui/reasonLabels";

type GuardrailsViolationCalloutProps = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
  dietId?: string;
  onDismiss?: () => void;
};

/**
 * Copy to clipboard helper
 */
function CopyHashButton({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <Button
      onClick={handleCopy}
      color="zinc"
      plain
      className="ml-2"
    >
      {copied ? (
        <>
          <CheckIcon className="h-4 w-4" />
          Gekopieerd
        </>
      ) : (
        <>
          <ClipboardIcon className="h-4 w-4" />
          Kopieer
        </>
      )}
    </Button>
  );
}

/**
 * Guardrails Violation Callout Component
 * 
 * Displays a clear error callout when recipe adaptation apply is blocked
 * by Guard Rails vNext hard constraint violations.
 */
export function GuardrailsViolationCallout({
  reasonCodes,
  contentHash,
  rulesetVersion,
  dietId,
  onDismiss,
}: GuardrailsViolationCalloutProps) {
  const router = useRouter();
  const shortHash = contentHash.substring(0, 8);
  const visibleReasonCodes = reasonCodes.slice(0, 5);
  const remainingCount = reasonCodes.length - visibleReasonCodes.length;

  const handleViewRules = () => {
    if (dietId) {
      // Navigate to diet settings edit page (user can navigate to guardrails tab manually)
      router.push(`/settings/diets/${dietId}/edit`);
    }
  };

  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-4">
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <Text className="font-semibold text-red-900 dark:text-red-100">
                Kan niet toepassen door dieetregels
              </Text>
              <Text className="mt-1 text-sm text-red-700 dark:text-red-300">
                Deze aanpassing schendt één of meer harde Guard Rails regels. Pas het recept aan of wijzig de regels.
              </Text>
            </div>
            {onDismiss && (
              <Button
                onClick={onDismiss}
                color="zinc"
                plain
                className="ml-2"
              >
                <XMarkIcon className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Reason Codes */}
          {reasonCodes.length > 0 && (
            <div>
              <Text className="text-xs font-medium text-red-800 dark:text-red-200 mb-2">
                Redenen:
              </Text>
              <div className="flex flex-wrap gap-2">
                {visibleReasonCodes.map((code, idx) => {
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
                {remainingCount > 0 && (
                  <Badge color="zinc" className="text-xs">
                    +{remainingCount} meer
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Hash and Version */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center">
              <Text className="text-xs text-red-700 dark:text-red-300">Hash:</Text>
              <code className="ml-2 text-xs font-mono text-red-800 dark:text-red-200">
                {shortHash}
              </code>
              <CopyHashButton hash={contentHash} />
            </div>
            {rulesetVersion !== undefined && (
              <Badge color="zinc" className="text-xs">
                Version: {rulesetVersion}
              </Badge>
            )}
          </div>

          {/* CTA Link */}
          {dietId && (
            <div>
              <Button
                onClick={handleViewRules}
                color="red"
                outline
                className="text-sm"
              >
                Bekijk Guard Rails regels
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
