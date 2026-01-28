"use client";

import { useState } from "react";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { Link } from "@/components/catalyst/link";
import { ClipboardIcon, CheckIcon, ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { formatReasonForBadge } from "@/src/lib/guardrails-vnext/ui/reasonLabels";

/** Ontbrekende FORCE-categorie voor “voeg toe”-feedback */
export type ForceDeficitItem = {
  categoryCode: string;
  categoryNameNl: string;
  minPerDay?: number;
  minPerWeek?: number;
};

type GuardrailsViolationEmptyStateProps = {
  reasonCodes: string[];
  contentHash: string;
  rulesetVersion?: number;
  /** Bij FORCE-quotum: ontbrekende categorieën – toon “Voeg iets toe uit: …” */
  forceDeficits?: ForceDeficitItem[];
  dietTypeId?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
};

export function GuardrailsViolationEmptyState({
  reasonCodes,
  contentHash,
  rulesetVersion,
  forceDeficits,
  dietTypeId,
  onRetry,
  isRetrying = false,
}: GuardrailsViolationEmptyStateProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(contentHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const shortHash = contentHash.substring(0, 8);
  const displayReasonCodes = reasonCodes.slice(0, 5);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/50">
      <div className="mb-4">
        <Text className="text-lg font-semibold text-red-900 dark:text-red-100">
          Plan kan niet worden gegenereerd door dieetregels
        </Text>
        <Text className="mt-2 text-sm text-red-800 dark:text-red-200">
          De gegenereerde wijzigingen voldoen niet aan je dieetregels en zijn daarom geblokkeerd.
        </Text>
      </div>

      {/* FORCE-deficits: “Voeg iets toe uit: …” + link naar recepten die passen */}
      {forceDeficits && forceDeficits.length > 0 && (
        <div className="mb-4 rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 border border-amber-200 dark:border-amber-800/50">
          <Text className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Voeg iets toe uit:
          </Text>
          <Text className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            {forceDeficits.map((d) => d.categoryNameNl).join(", ")}
          </Text>
          <Text className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            Het dag-quotum voor deze groepen is niet gehaald. Kies maaltijden of recepten die hieruit iets bevatten.
          </Text>
          <Link
            href={`/recipes?categories=${encodeURIComponent(forceDeficits.map((d) => d.categoryCode).join(","))}&categoryNames=${encodeURIComponent(forceDeficits.map((d) => d.categoryNameNl).join(","))}`}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-800/50"
          >
            <MagnifyingGlassIcon className="h-4 w-4" aria-hidden />
            Zoek recepten die passen bij deze groepen
          </Link>
        </div>
      )}

      {/* Reason codes */}
      {displayReasonCodes.length > 0 && (
        <div className="mb-4">
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
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Text className="text-red-800 dark:text-red-200">Hash:</Text>
          <code className="rounded bg-red-100 px-2 py-0.5 font-mono text-xs text-red-900 dark:bg-red-900/50 dark:text-red-100">
            {shortHash}
          </code>
          <Button
            onClick={handleCopy}
            color="zinc"
            plain
            className="h-6 px-2 text-xs"
          >
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

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-red-200 dark:border-red-900/50">
        {onRetry && (
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            color="blue"
          >
            {isRetrying ? (
              <>
                <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                Opnieuw proberen...
              </>
            ) : (
              <>
                <ArrowPathIcon className="h-4 w-4 mr-2" />
                Opnieuw proberen
              </>
            )}
          </Button>
        )}
        {dietTypeId && (
          <Link
            href={`/settings/diets/${dietTypeId}/edit`}
            className="inline-flex items-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-50 dark:border-red-700 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-900/50"
          >
            Bekijk Guard Rails →
          </Link>
        )}
      </div>
    </div>
  );
}
