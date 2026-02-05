/**
 * Candidate pool sanitization: dedupe, exclude-term filter, and metrics.
 * Used for both template and Gemini paths; no new DB queries.
 */

import type {
  CandidatePool,
  NevoFoodCandidate,
} from '@/src/lib/agents/meal-planner/mealPlannerAgent.tools';

/**
 * Lowercase, trim, collapse whitespace, remove punctuation.
 * TODO: No locale folding (e.g. NFD strip diacritics); names with accents are left as-is.
 */
export function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '');
}

/**
 * Dedupe list: unique by nevoCode; if nevoCode missing/empty, fallback to normalized name.
 * Returns kept list and count of removed duplicates.
 */
export function dedupeByNevoOrName(list: NevoFoodCandidate[]): {
  kept: NevoFoodCandidate[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const kept: NevoFoodCandidate[] = [];
  for (const c of list) {
    const key =
      c.nevoCode?.trim() !== ''
        ? c.nevoCode
        : normalizeName(c.name) || 'unknown';
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(c);
  }
  return { kept, removedCount: list.length - kept.length };
}

/**
 * Filter out candidates whose normalized name contains any exclude term (case-insensitive substring).
 * Empty/undefined terms → no-op.
 */
export function filterByExcludeTerms(
  list: NevoFoodCandidate[],
  terms: string[] | undefined,
): { kept: NevoFoodCandidate[]; removedCount: number } {
  if (!terms?.length) return { kept: list, removedCount: 0 };
  const normalizedTerms = terms.map((t) => normalizeName(t)).filter(Boolean);
  if (normalizedTerms.length === 0) return { kept: list, removedCount: 0 };
  const kept = list.filter((c) => {
    const nameNorm = normalizeName(c.name);
    return !normalizedTerms.some((term) => nameNorm.includes(term));
  });
  return { kept, removedCount: list.length - kept.length };
}

/** Category counts for observability (proteins, vegetables, fruits, fats only). */
export type PoolCategoryCounts = {
  proteins: number;
  vegetables: number;
  fruits: number;
  fats: number;
};

export type PoolSanitizationMetrics = {
  before: PoolCategoryCounts;
  after: PoolCategoryCounts;
  removedDuplicates: number;
  removedByExcludeTerms: number;
  /** When extraExcludeTerms was provided: count removed by those terms only. */
  removedByGuardrailsTerms?: number;
};

const METRIC_CATEGORIES = ['proteins', 'vegetables', 'fruits', 'fats'] as const;

function toCategoryCounts(pool: CandidatePool): PoolCategoryCounts {
  return {
    proteins: (pool.proteins ?? []).length,
    vegetables: (pool.vegetables ?? []).length,
    fruits: (pool.fruits ?? []).length,
    fats: (pool.fats ?? []).length,
  };
}

/**
 * Sanitize pool: per-category dedupe then exclude-term filter.
 * Uses same excludeTerms as buildCandidatePool (allergies, dislikes, excludeIngredients).
 * When extraExcludeTerms is provided (e.g. guardrails hard-block terms), they are applied
 * in addition and removedByGuardrailsTerms is set to the count removed by those terms only.
 * Returns sanitized pool and metrics for metadata.generator.poolMetrics.
 */
export function sanitizeCandidatePool(
  pool: CandidatePool,
  excludeTerms: string[] = [],
  options?: { extraExcludeTerms?: string[] },
): { pool: CandidatePool; metrics: PoolSanitizationMetrics } {
  const before = toCategoryCounts(pool);
  let totalDeduped = 0;
  let totalExcluded = 0;
  let removedByGuardrails = 0;
  const afterPool: CandidatePool = { ...pool };

  for (const cat of METRIC_CATEGORIES) {
    const list = pool[cat] ?? [];
    const { kept: deduped, removedCount: dupRemoved } =
      dedupeByNevoOrName(list);
    totalDeduped += dupRemoved;
    const { kept: afterUser, removedCount: userRemoved } = filterByExcludeTerms(
      deduped,
      excludeTerms,
    );
    const { kept: filtered, removedCount: extraRemoved } = options
      ?.extraExcludeTerms?.length
      ? filterByExcludeTerms(afterUser, options.extraExcludeTerms)
      : { kept: afterUser, removedCount: 0 };
    totalExcluded += userRemoved + extraRemoved;
    removedByGuardrails += extraRemoved;
    afterPool[cat] = filtered;
  }

  // Other categories (carbs, dairy_liquids, etc.): sanitize but don't include in metrics
  const otherCategories = Object.keys(pool).filter(
    (k) => !METRIC_CATEGORIES.includes(k as (typeof METRIC_CATEGORIES)[number]),
  );
  for (const cat of otherCategories) {
    const list = pool[cat] ?? [];
    const { kept: deduped } = dedupeByNevoOrName(list);
    const { kept: afterUser } = filterByExcludeTerms(deduped, excludeTerms);
    const { kept: filtered, removedCount: extraRemoved } = options
      ?.extraExcludeTerms?.length
      ? filterByExcludeTerms(afterUser, options.extraExcludeTerms)
      : { kept: afterUser, removedCount: 0 };
    removedByGuardrails += extraRemoved;
    afterPool[cat] = filtered;
  }

  const after = toCategoryCounts(afterPool);

  const metrics: PoolSanitizationMetrics = {
    before,
    after,
    removedDuplicates: totalDeduped,
    removedByExcludeTerms: totalExcluded,
  };
  if (options?.extraExcludeTerms?.length && removedByGuardrails > 0) {
    metrics.removedByGuardrailsTerms = removedByGuardrails;
  }

  return {
    pool: afterPool,
    metrics,
  };
}
