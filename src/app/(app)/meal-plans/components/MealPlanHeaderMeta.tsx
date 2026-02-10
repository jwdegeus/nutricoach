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
  /** Therapeutische targets aanwezig (toon "Therapeutisch: aan" in rij 2) */
  hasTherapeuticTargets?: boolean;
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
  hasTherapeuticTargets = false,
  reuse,
}: MealPlanHeaderMetaProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <Heading level={1} className="text-2xl font-semibold text-foreground">
          Weekmenu
        </Heading>
        {/* Single line: diet, period, days, meals */}
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{dietTypeName}</span>
          <span aria-hidden> · </span>
          <span>{periodText}</span>
          <span aria-hidden> · </span>
          <span>{days} dagen</span>
          <span aria-hidden> · </span>
          <span>{totalMeals} maaltijden</span>
        </p>
      </div>
      {/* Secondary meta only in Details dropdown */}
      <div className="flex items-center gap-2 text-sm">
        <Dropdown>
          <DropdownButton
            plain
            className="text-muted-foreground hover:text-foreground"
          >
            Details
            <ChevronDownIcon className="ml-0.5 h-4 w-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom start" className="min-w-[18rem]">
            <div className="px-3.5 py-3 text-sm text-muted-foreground space-y-2">
              <div>
                <span className="text-muted-foreground">Plan ID: </span>
                <span className="font-mono">{planId.slice(0, 8)}…</span>
              </div>
              {householdSize != null && <div>Huishouden: {householdSize}</div>}
              {servingsPolicyLabel && <div>{servingsPolicyLabel}</div>}
              <div>
                {hasEnrichment
                  ? 'Enrichment beschikbaar'
                  : 'Enrichment: niet beschikbaar'}
              </div>
              {hasTherapeuticTargets && <div>Therapeutisch: aan</div>}
              {weekendText && <div>Weekend: {weekendText}</div>}
              {showGuardrailsMeta && (
                <>
                  <div>Constraints: {constraintsInPrompt ? 'ja' : 'nee'}</div>
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
              {cronJobId && cronJobId.length > 0 && (
                <div>
                  Aangemaakt door cron job{' '}
                  <Link
                    href="/meal-plans/jobs"
                    className="text-foreground underline hover:no-underline"
                  >
                    {cronJobId.slice(0, 8)}…
                  </Link>
                </div>
              )}
              {reuse != null && (reuse.reused > 0 || reuse.generated > 0) && (
                <div>
                  Hergebruikt: {reuse.reused}, Nieuw: {reuse.generated}, Reuse:{' '}
                  {reuse.reusePct}%
                </div>
              )}
            </div>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}
