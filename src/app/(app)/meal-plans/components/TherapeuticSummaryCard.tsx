'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/catalyst/button';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';
import { Link } from '@/components/catalyst/link';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/16/solid';
import type {
  TherapeuticTargetsSnapshot,
  TherapeuticCoverageSnapshot,
  TherapeuticSupplementsSummary,
} from '@/src/lib/diets/diet.types';

export type TherapeuticSummaryCardProps = {
  targets?: TherapeuticTargetsSnapshot | null;
  coverage?: TherapeuticCoverageSnapshot | null;
  /** Uit plan metadata; geen extra fetch. */
  supplementsSummary?: TherapeuticSupplementsSummary | null;
};

function formatDateLabel(isoDate: string): string {
  try {
    return new Date(isoDate + 'T12:00:00').toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return isoDate;
  }
}

/** Compacte sectie alleen uit plan metadata; alleen tonen bij waarschuwingen of aandachtspunten. */
function SupplementenSummaryBlock({
  supplementsSummary,
}: {
  supplementsSummary: TherapeuticSupplementsSummary | null | undefined;
}) {
  if (supplementsSummary == null) return null;

  const { errorCount, warnCount, totalApplicableRules, topMessagesNl } =
    supplementsSummary;
  const messages = Array.isArray(topMessagesNl)
    ? topMessagesNl
        .slice(0, 3)
        .filter((m) => typeof m === 'string' && m.trim() !== '')
    : [];
  const hasRelevantContent =
    errorCount > 0 ||
    warnCount > 0 ||
    (totalApplicableRules > 0 && messages.length > 0);
  if (!hasRelevantContent) return null;

  return (
    <div className="mt-6 rounded-xl bg-muted/30 p-3 shadow-sm">
      <Heading level={3} className="text-base font-semibold text-foreground">
        Supplementen
      </Heading>
      <Text className="mt-1 text-sm text-muted-foreground">
        {errorCount} waarschuwingen · {warnCount} aandachtspunten
      </Text>
      {totalApplicableRules === 0 ? (
        <Text className="mt-2 text-sm text-muted-foreground">
          Geen waarschuwingen op basis van je profiel.
        </Text>
      ) : messages.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-foreground">
          {messages.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function isAbsoluteTarget(
  t: unknown,
): t is { kind: 'absolute'; value: number; unit?: string } {
  return (
    t != null &&
    typeof t === 'object' &&
    (t as { kind?: string }).kind === 'absolute' &&
    typeof (t as { value?: unknown }).value === 'number'
  );
}

function isAdhPercentTarget(
  t: unknown,
): t is { kind: 'adh_percent'; value: number; unit?: string } {
  return (
    t != null &&
    typeof t === 'object' &&
    (t as { kind?: string }).kind === 'adh_percent' &&
    typeof (t as { value?: unknown }).value === 'number'
  );
}

type DisplayRow = {
  baseKey: string;
  percentTarget?: { value: number; unit?: string };
  absoluteTarget?: { value: number; unit?: string };
};

/** Normalise macro/micro map into display rows: merge %ADH + __absolute into one row per baseKey. */
function getMacroMicroDisplayRows(
  map:
    | Record<string, { kind?: string; value?: number; unit?: string }>
    | undefined,
): DisplayRow[] {
  if (!map || typeof map !== 'object') return [];
  const byBase: Record<string, DisplayRow> = {};
  for (const key of Object.keys(map)) {
    const val = map[key];
    if (val == null || typeof val !== 'object') continue;
    if (key.endsWith('__absolute')) {
      const baseKey = key.slice(0, -'__absolute'.length);
      if (!byBase[baseKey]) byBase[baseKey] = { baseKey };
      if (isAbsoluteTarget(val)) {
        byBase[baseKey].absoluteTarget = {
          value: val.value,
          unit: val.unit ?? 'g',
        };
      }
    } else {
      if (!byBase[key]) byBase[key] = { baseKey: key };
      if (isAdhPercentTarget(val)) {
        byBase[key].percentTarget = {
          value: val.value,
          unit: val.unit ?? '%_adh',
        };
      } else if (isAbsoluteTarget(val)) {
        byBase[key].absoluteTarget = {
          value: val.value,
          unit: val.unit ?? 'g',
        };
      }
    }
  }
  return Object.values(byBase)
    .filter((r) => r.percentTarget != null || r.absoluteTarget != null)
    .sort((a, b) => a.baseKey.localeCompare(b.baseKey));
}

/**
 * Presentational card: therapeutic targets, week coverage, and deficit alerts.
 * No data fetching; all data from props. Safe when targets/coverage are null/undefined.
 */
export function TherapeuticSummaryCard({
  targets,
  coverage,
  supplementsSummary,
}: TherapeuticSummaryCardProps) {
  const t = useTranslations('therapeutic');
  const [expanded, setExpanded] = useState(false);
  const hasTargets =
    targets != null &&
    typeof targets === 'object' &&
    (targets.protocol != null ||
      (targets.daily != null && typeof targets.daily === 'object'));

  const protocol =
    targets?.protocol &&
    typeof targets.protocol === 'object' &&
    typeof (targets.protocol as { labelNl?: string }).labelNl === 'string'
      ? (targets.protocol as {
          protocolKey: string;
          version?: string;
          labelNl?: string;
        })
      : null;

  const dailyTargets =
    targets?.daily &&
    typeof targets.daily === 'object' &&
    typeof (targets.daily as { foodGroups?: unknown }).foodGroups === 'object'
      ? (
          targets.daily as {
            foodGroups?: { vegetablesG?: number; fruitG?: number };
          }
        ).foodGroups
      : null;

  const macroTargets =
    targets?.daily &&
    typeof targets.daily === 'object' &&
    typeof (targets.daily as { macros?: unknown }).macros === 'object'
      ? (
          targets.daily as {
            macros: Record<
              string,
              { kind?: string; value?: number; unit?: string }
            >;
          }
        ).macros
      : null;

  const dailyByDate =
    coverage?.dailyByDate && typeof coverage.dailyByDate === 'object'
      ? coverage.dailyByDate
      : null;
  const sortedDates =
    dailyByDate && Object.keys(dailyByDate).length >= 1
      ? Object.keys(dailyByDate).sort()
      : [];

  const alerts =
    coverage?.deficits &&
    typeof coverage.deficits === 'object' &&
    Array.isArray((coverage.deficits as { alerts?: unknown }).alerts)
      ? (
          coverage.deficits as {
            alerts: Array<{
              code?: string;
              severity?: 'info' | 'warn' | 'error';
              messageNl?: string;
            }>;
          }
        ).alerts
      : [];

  const actionSuggestions =
    coverage?.deficits &&
    typeof coverage.deficits === 'object' &&
    Array.isArray((coverage.deficits as { suggestions?: unknown }).suggestions)
      ? (
          coverage.deficits as {
            suggestions: Array<{
              kind?: string;
              severity?: string;
              titleNl?: string;
              whyNl?: string;
              payload?: Record<string, unknown>;
            }>;
          }
        ).suggestions.slice(0, 3)
      : [];

  const hasCoverage =
    coverage != null &&
    typeof coverage === 'object' &&
    (coverage.dailyByDate != null ||
      coverage.weekly != null ||
      alerts.length > 0);

  // Empty: geen targets
  if (!hasTargets) {
    return (
      <div className="rounded-2xl bg-muted/20 p-6 shadow-sm">
        <Heading level={2} className="text-lg font-semibold text-foreground">
          {t('title')}
        </Heading>
        <Text className="mt-2 text-muted-foreground">{t('noProtocolSet')}</Text>
        <Link
          href="/settings#therapeutic-profile"
          className="mt-2 inline-block text-sm font-medium text-foreground underline hover:no-underline"
        >
          {t('setInAccount')}
        </Link>
        <SupplementenSummaryBlock
          supplementsSummary={supplementsSummary ?? null}
        />
      </div>
    );
  }

  // Wel targets, geen coverage
  if (!hasCoverage) {
    return (
      <div className="rounded-2xl bg-muted/20 p-6 shadow-sm">
        <Heading level={2} className="text-lg font-semibold text-foreground">
          {t('title')}
        </Heading>
        {protocol && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{protocol.labelNl ?? protocol.protocolKey}</span>
            {protocol.version && (
              <>
                <span aria-hidden>·</span>
                <span>v{protocol.version}</span>
              </>
            )}
          </div>
        )}
        <Text className="mt-3 text-muted-foreground">{t('noCoverageYet')}</Text>
        <SupplementenSummaryBlock
          supplementsSummary={supplementsSummary ?? null}
        />
      </div>
    );
  }

  // Targets + coverage
  const computedAt =
    typeof coverage?.computedAt === 'string' && coverage.computedAt
      ? new Date(coverage.computedAt).toLocaleDateString('nl-NL', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null;

  return (
    <div className="rounded-2xl bg-muted/20 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Heading level={2} className="text-lg font-semibold text-foreground">
            {t('title')}
          </Heading>
          {protocol && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{protocol.labelNl ?? protocol.protocolKey}</span>
              {protocol.version && (
                <>
                  <span aria-hidden>·</span>
                  <span>v{protocol.version}</span>
                </>
              )}
              {computedAt && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {t('coverageLabel')}: {computedAt}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <Button
          plain
          onClick={() => setExpanded((e) => !e)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? (
            <ChevronUpIcon className="h-5 w-5" />
          ) : (
            <ChevronDownIcon className="h-5 w-5" />
          )}
        </Button>
      </div>

      {!expanded && (
        <Text className="mt-2 text-sm text-muted-foreground">
          {t('weekNote')}
        </Text>
      )}

      {expanded && (
        <>
          {/* Week totalen (boven daily breakdown) */}
          {coverage?.weekly &&
            typeof coverage.weekly === 'object' &&
            (coverage.weekly.foodGroups != null ||
              (coverage.weekly as { macros?: unknown }).macros != null) && (
              <div className="mt-4 space-y-2 rounded-xl bg-muted/30 p-3 shadow-sm">
                <Text className="text-sm font-medium text-foreground">
                  {t('week')}
                </Text>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {coverage.weekly.foodGroups != null &&
                    typeof coverage.weekly.foodGroups === 'object' && (
                      <>
                        {dailyTargets &&
                          typeof dailyTargets.vegetablesG === 'number' && (
                            <span>
                              {t('vegetablesTotal')}:{' '}
                              {typeof (
                                coverage.weekly.foodGroups as {
                                  vegetablesG?: { value?: number };
                                }
                              ).vegetablesG?.value === 'number'
                                ? (
                                    coverage.weekly.foodGroups as {
                                      vegetablesG: { value: number };
                                    }
                                  ).vegetablesG.value
                                : 0}
                              g
                            </span>
                          )}
                        {dailyTargets &&
                          typeof dailyTargets.fruitG === 'number' && (
                            <span>
                              {t('fruitTotal')}:{' '}
                              {typeof (
                                coverage.weekly.foodGroups as {
                                  fruitG?: { value?: number };
                                }
                              ).fruitG?.value === 'number'
                                ? (
                                    coverage.weekly.foodGroups as {
                                      fruitG: { value: number };
                                    }
                                  ).fruitG.value
                                : 0}
                              g
                            </span>
                          )}
                      </>
                    )}
                </div>
                {(() => {
                  const weeklyMacros = (
                    coverage.weekly as {
                      macros?: Record<
                        string,
                        { value?: number; unit?: string }
                      >;
                    }
                  ).macros;
                  if (!weeklyMacros || typeof weeklyMacros !== 'object')
                    return null;
                  const macroDisplayRows = getMacroMicroDisplayRows(
                    macroTargets ?? undefined,
                  );
                  const weekRows = macroDisplayRows
                    .map((row) => {
                      const v =
                        weeklyMacros[row.baseKey] ??
                        weeklyMacros[`${row.baseKey}__absolute`];
                      const value =
                        v != null &&
                        typeof v === 'object' &&
                        typeof (v as { value?: number }).value === 'number'
                          ? (v as { value: number }).value
                          : null;
                      const unit =
                        v != null &&
                        typeof v === 'object' &&
                        typeof (v as { unit?: string }).unit === 'string'
                          ? (v as { unit: string }).unit
                          : 'g';
                      return value != null ? { row, value, unit } : null;
                    })
                    .filter((x): x is NonNullable<typeof x> => x != null)
                    .slice(0, 3);
                  if (weekRows.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {weekRows.map(({ row, value, unit }) => {
                        const p = row.percentTarget;
                        const a = row.absoluteTarget;
                        const label =
                          p != null
                            ? a != null
                              ? `${row.baseKey}: ${p.value}% ${t('adhLabel')} (≈ ${a.value}${a.unit ?? 'g'})`
                              : `${row.baseKey}: ${p.value}% ${t('adhLabel')}`
                            : a != null
                              ? `${row.baseKey}: ${t('targetLabel')} ${a.value}${a.unit ?? 'g'}`
                              : row.baseKey;
                        return (
                          <span key={row.baseKey}>
                            {label} — {t('totalLabel')}: {value}
                            {unit}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
                <Text className="text-xs text-muted-foreground">
                  {t('weekNote')}
                </Text>
              </div>
            )}

          {/* Weekoverzicht: per datum groente + fruit (indien target) + max 2 macro's */}
          {sortedDates.length >= 1 && (
            <div className="mt-4 space-y-3">
              <Text className="text-sm font-medium text-foreground">
                {t('weeklyOverview')}
              </Text>
              <div className="space-y-3 rounded-xl bg-muted/30 p-3 shadow-sm">
                {sortedDates.map((date) => {
                  const dayCoverage = dailyByDate?.[date];
                  const dayCoverageFood =
                    dayCoverage?.foodGroups &&
                    typeof dayCoverage.foodGroups === 'object'
                      ? dayCoverage.foodGroups
                      : null;
                  const vegTarget =
                    dailyTargets && typeof dailyTargets.vegetablesG === 'number'
                      ? dailyTargets.vegetablesG
                      : null;
                  const fruitTarget =
                    dailyTargets && typeof dailyTargets.fruitG === 'number'
                      ? dailyTargets.fruitG
                      : null;
                  const vegActual =
                    dayCoverageFood != null &&
                    typeof dayCoverageFood.vegetablesG === 'number'
                      ? dayCoverageFood.vegetablesG
                      : null;
                  const fruitActual =
                    dayCoverageFood != null &&
                    typeof dayCoverageFood.fruitG === 'number'
                      ? dayCoverageFood.fruitG
                      : null;

                  const dayMacros = dayCoverage?.macros ?? null;
                  const macroDisplayRows = getMacroMicroDisplayRows(
                    macroTargets ?? undefined,
                  );
                  const rowsWithActual = macroDisplayRows
                    .map((row) => {
                      const dayMacrosRecord =
                        dayMacros != null && typeof dayMacros === 'object'
                          ? (dayMacros as Record<string, unknown>)
                          : null;
                      const actualVal = dayMacrosRecord
                        ? (dayMacrosRecord[row.baseKey] ??
                          dayMacrosRecord[`${row.baseKey}__absolute`])
                        : undefined;
                      const actualNum =
                        actualVal != null &&
                        typeof actualVal === 'object' &&
                        typeof (actualVal as { value?: unknown }).value ===
                          'number'
                          ? (actualVal as { value: number }).value
                          : null;
                      const actualUnit =
                        actualVal != null &&
                        typeof actualVal === 'object' &&
                        typeof (actualVal as { unit?: unknown }).unit ===
                          'string'
                          ? (actualVal as { unit: string }).unit
                          : 'g';
                      return { row, actualNum, actualUnit };
                    })
                    .filter((x) => x.actualNum != null)
                    .slice(0, 2);

                  return (
                    <div
                      key={date}
                      className="flex flex-col gap-1 py-2 first:pt-0"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {formatDateLabel(date)}
                      </span>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                        {vegTarget != null && (
                          <span className="text-muted-foreground">
                            {t('vegetablesTotal')}:{' '}
                            {vegActual != null ? vegActual : 0}g / {vegTarget}g
                          </span>
                        )}
                        {fruitTarget != null && (
                          <span className="text-muted-foreground">
                            {t('fruitTotal')}:{' '}
                            {fruitActual != null ? fruitActual : 0}g /{' '}
                            {fruitTarget}g
                          </span>
                        )}
                      </div>
                      {rowsWithActual.length > 0 && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {rowsWithActual.map(
                            ({ row, actualNum, actualUnit }) => {
                              const p = row.percentTarget;
                              const a = row.absoluteTarget;
                              const label =
                                p != null
                                  ? a != null
                                    ? `${row.baseKey}: ${p.value}% ${t('adhLabel')} (≈ ${a.value}${a.unit ?? 'g'})`
                                    : `${row.baseKey}: ${p.value}% ${t('adhLabel')}`
                                  : a != null
                                    ? `${row.baseKey}: ${t('targetLabel')} ${a.value}${a.unit ?? 'g'}`
                                    : row.baseKey;
                              const targetNum = a?.value ?? p?.value;
                              const targetUnit = a?.unit ?? p?.unit ?? 'g';
                              if (
                                actualNum == null ||
                                !Number.isFinite(targetNum)
                              ) {
                                return null;
                              }
                              return (
                                <span key={row.baseKey}>
                                  {label}: {actualNum}
                                  {actualUnit} / {targetNum}
                                  {targetUnit}
                                </span>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deficit alerts (max 3) */}
          {alerts.length > 0 && (
            <div className="mt-4">
              <Text className="text-sm font-medium text-foreground">
                {t('deficits')}
              </Text>
              <ul className="mt-2 space-y-1.5">
                {alerts.slice(0, 3).map((a, i) => (
                  <li key={(a.code ?? '') + i}>
                    <Badge
                      color={
                        a.severity === 'error'
                          ? 'red'
                          : a.severity === 'warn'
                            ? 'amber'
                            : 'zinc'
                      }
                    >
                      {typeof a.messageNl === 'string' ? a.messageNl : '—'}
                    </Badge>
                  </li>
                ))}
                {alerts.length > 3 && (
                  <li className="text-sm text-muted-foreground">
                    {t('moreCount', { count: alerts.length - 3 })}
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Suggesties (max 3, uit coverage.deficits.suggestions) */}
          {actionSuggestions.length > 0 && (
            <div className="mt-4">
              <Text className="text-sm font-medium text-foreground">
                {t('suggestions')}
              </Text>
              <ul className="mt-2 space-y-3">
                {actionSuggestions.map((s, i) => {
                  const severity = s.severity === 'warn' ? 'amber' : 'zinc';
                  const payload =
                    s.payload != null && typeof s.payload === 'object'
                      ? (s.payload as Record<string, unknown>)
                      : null;
                  const grams =
                    payload != null && typeof payload.grams === 'number'
                      ? payload.grams
                      : null;
                  const macroKey =
                    payload != null && typeof payload.macroKey === 'string'
                      ? payload.macroKey
                      : null;
                  const appliesTo =
                    (s as { appliesTo?: unknown }).appliesTo != null &&
                    typeof (s as { appliesTo?: unknown }).appliesTo === 'object'
                      ? ((s as { appliesTo: { date?: string } }).appliesTo as {
                          date?: string;
                        })
                      : null;
                  const whenDate =
                    appliesTo != null &&
                    typeof appliesTo.date === 'string' &&
                    appliesTo.date
                      ? formatDateLabel(appliesTo.date)
                      : null;
                  const metrics =
                    (s as { metrics?: unknown }).metrics != null &&
                    typeof (s as { metrics?: unknown }).metrics === 'object'
                      ? ((s as { metrics: object }).metrics as {
                          actual?: number;
                          target?: number;
                          unit?: string;
                          ratio?: number;
                        })
                      : null;
                  const hasMetrics =
                    metrics != null &&
                    typeof metrics.actual === 'number' &&
                    typeof metrics.target === 'number';
                  const ratioPct =
                    hasMetrics &&
                    typeof metrics!.ratio === 'number' &&
                    Number.isFinite(metrics!.ratio)
                      ? Math.round(metrics!.ratio * 100)
                      : null;
                  const unitStr =
                    metrics != null && typeof metrics.unit === 'string'
                      ? metrics.unit
                      : '';

                  return (
                    <li key={i} className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color={severity}>
                          {s.severity === 'warn' ? t('warning') : t('tip')}
                        </Badge>
                        <Text className="text-sm font-medium text-foreground">
                          {typeof s.titleNl === 'string' ? s.titleNl : '—'}
                        </Text>
                      </div>
                      {typeof s.whyNl === 'string' && s.whyNl && (
                        <Text className="text-sm text-muted-foreground">
                          {s.whyNl}
                        </Text>
                      )}
                      {whenDate && (
                        <Text className="text-xs text-muted-foreground">
                          {t('when')}: {whenDate}
                        </Text>
                      )}
                      {grams != null && (
                        <Text className="text-xs text-muted-foreground">
                          {t('impactVegetables', { grams })}
                        </Text>
                      )}
                      {macroKey != null && grams == null && (
                        <Text className="text-xs text-muted-foreground">
                          {t('impactMacro', { macroKey })}
                        </Text>
                      )}
                      {hasMetrics && metrics != null && (
                        <Text className="text-xs text-muted-foreground">
                          {t('rationale')}: {metrics.actual}/{metrics.target}
                          {unitStr ? ` ${unitStr}` : ''}
                          {ratioPct != null ? ` (≈ ${ratioPct}%)` : ''}
                        </Text>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <SupplementenSummaryBlock
            supplementsSummary={supplementsSummary ?? null}
          />
        </>
      )}
    </div>
  );
}
