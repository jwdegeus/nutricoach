'use client';

import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
} from '@/components/catalyst/dropdown';
import { Heading } from '@/components/catalyst/heading';
import { Link } from '@/components/catalyst/link';
import { ChevronDownIcon } from '@heroicons/react/16/solid';

export type MealPlanHeaderMetaProps = {
  planId: string;
  dietTypeName: string;
  periodText: string;
  days: number;
  totalMeals: number;
  householdSize: number | null;
  servingsPolicyLabel: string | null;
  hasEnrichment: boolean;
  cronJobId: string | null;
  weekendText: string | null;
  /** Alleen tonen als er guardrails-meta is (constraints en/of hash/version) */
  constraintsInPrompt: boolean;
  contentHash: string | null;
  version: string | null;
  showGuardrailsMeta: boolean;
  /** Optioneel: Hergebruikt/Nieuw/Reuse % voor in Details */
  reuse: { reused: number; generated: number; reusePct: number } | null;
};

/**
 * Compact header metadata: 2 rijen (primair + secundair) en technische details in dropdown.
 * Puur presentational: geen data fetching, geen actions, geen router.
 */
export function MealPlanHeaderMeta({
  planId,
  dietTypeName,
  periodText,
  days,
  totalMeals,
  householdSize,
  servingsPolicyLabel,
  hasEnrichment,
  cronJobId,
  weekendText,
  constraintsInPrompt,
  contentHash,
  version,
  showGuardrailsMeta,
  reuse,
}: MealPlanHeaderMetaProps) {
  const hasDetailsContent =
    showGuardrailsMeta ||
    (reuse != null && (reuse.reused > 0 || reuse.generated > 0));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-4">
      <Heading level={1}>Weekmenu</Heading>

      {/* Rij 1 — Primair: Dieet, Periode, Dagen, Maaltijden */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-foreground">{dietTypeName}</span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="text-foreground">{periodText}</span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="text-foreground">{days} dagen</span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="text-foreground">{totalMeals} maaltijden</span>
      </div>

      {/* Rij 2 — Secundair: Huishouden, Porties, Enrichment, Provenance, Weekend, Constraints, Details */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {householdSize != null && (
          <>
            <span>Huishouden: {householdSize}</span>
            <span aria-hidden>·</span>
          </>
        )}
        {servingsPolicyLabel && (
          <>
            <span>{servingsPolicyLabel}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span>
          {hasEnrichment
            ? 'Enrichment beschikbaar'
            : 'Enrichment: niet beschikbaar'}
        </span>
        {cronJobId && cronJobId.length > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>Aangemaakt door: Cron job</span>
            <span className="ml-1">
              <Link href="/meal-plans/jobs">Job: {cronJobId.slice(0, 8)}…</Link>
            </span>
          </>
        )}
        {weekendText && (
          <>
            <span aria-hidden>·</span>
            <span>Weekend: {weekendText}</span>
          </>
        )}
        {showGuardrailsMeta && (
          <>
            <span aria-hidden>·</span>
            <span className="text-foreground/80">
              Constraints: {constraintsInPrompt ? 'ja' : 'nee'}
            </span>
          </>
        )}
        {hasDetailsContent && (
          <>
            <span aria-hidden>·</span>
            <Dropdown>
              <DropdownButton
                plain
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                Details
                <ChevronDownIcon className="ml-0.5 h-4 w-4" />
              </DropdownButton>
              <DropdownMenu anchor="bottom start" className="min-w-[16rem]">
                <div className="px-3.5 py-2.5 sm:px-3 sm:py-1.5 text-sm text-muted-foreground space-y-1.5">
                  <div>
                    <span className="text-muted-foreground">Plan ID: </span>
                    <span className="font-mono">{planId.slice(0, 8)}…</span>
                  </div>
                  {showGuardrailsMeta && (
                    <>
                      <div>
                        <span className="text-muted-foreground">
                          Constraints:{' '}
                        </span>
                        {constraintsInPrompt ? 'ja' : 'nee'}
                      </div>
                      {contentHash && (
                        <div>
                          <span className="text-muted-foreground">Hash: </span>
                          <code className="font-mono text-xs">
                            {contentHash.length > 8
                              ? `${contentHash.slice(0, 8)}…`
                              : contentHash}
                          </code>
                        </div>
                      )}
                      {version && (
                        <div>
                          <span className="text-muted-foreground">v: </span>
                          {version.length > 12
                            ? `${version.slice(0, 12)}…`
                            : version}
                        </div>
                      )}
                    </>
                  )}
                  {reuse != null &&
                    (reuse.reused > 0 || reuse.generated > 0) && (
                      <div>
                        <span className="text-muted-foreground">
                          Hergebruikt: {reuse.reused}, Nieuw: {reuse.generated},{' '}
                          Reuse: {reuse.reusePct}%
                        </span>
                      </div>
                    )}
                </div>
              </DropdownMenu>
            </Dropdown>
          </>
        )}
      </div>
    </div>
  );
}
