'use client';

import { Text } from '@/components/catalyst/text';
import type { RecipeNutritionSummary } from '../actions/ingredient-matching.actions';
import type { NutriScoreGrade } from '@/src/lib/nevo/nutrition-calculator';

type RecipeNutritionKpiProps = {
  summary: RecipeNutritionSummary | null;
  loading: boolean;
};

function getNutriScoreBgClass(grade: NutriScoreGrade | null): string {
  if (!grade) return 'bg-zinc-200 dark:bg-zinc-600';
  switch (grade) {
    case 'A':
      return 'bg-green-500 text-white';
    case 'B':
      return 'bg-lime-500 text-white';
    case 'C':
      return 'bg-yellow-500 text-zinc-900';
    case 'D':
      return 'bg-orange-500 text-white';
    case 'E':
      return 'bg-red-500 text-white';
    default:
      return 'bg-zinc-200 dark:bg-zinc-600';
  }
}

export function RecipeNutritionKpi({
  summary,
  loading,
}: RecipeNutritionKpiProps) {
  if (loading) {
    return (
      <div className="rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <Text className="text-sm text-zinc-500 dark:text-zinc-400">
          Voedingswaarden berekenen…
        </Text>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const {
    totalKcal,
    totalProtein,
    totalCarbs,
    totalFat,
    totalFiber,
    totalSodium,
    totalG,
    nutriscoreGrade,
    servings,
  } = summary;

  const perPortionKcal =
    servings != null && servings > 0 ? Math.round(totalKcal / servings) : null;
  const perPortionProtein =
    servings != null && servings > 0 ? totalProtein / servings : null;
  const perPortionCarbs =
    servings != null && servings > 0 ? totalCarbs / servings : null;
  const perPortionFat =
    servings != null && servings > 0 ? totalFat / servings : null;

  return (
    <div className="rounded-lg bg-white p-4 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Voeding van dit gerecht
      </h3>
      <div className="flex flex-wrap items-start gap-6">
        {/* Nutri-Score: alleen bovenaan als er geen porties zijn (anders staat hij bij Per portie) */}
        {nutriscoreGrade != null && (servings == null || servings <= 0) && (
          <div className="flex flex-col items-center gap-1">
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold ${getNutriScoreBgClass(nutriscoreGrade)}`}
              title="Nutri-Score (per 100 g)"
            >
              {nutriscoreGrade}
            </span>
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              Nutri-Score (per 100 g)
            </Text>
          </div>
        )}

        {/* Total */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Energie</span>
            <div className="font-semibold text-zinc-900 dark:text-white">
              {Math.round(totalKcal)} kcal
            </div>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Eiwit</span>
            <div className="font-semibold text-zinc-900 dark:text-white">
              {Math.round(totalProtein)} g
            </div>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Koolhydr.</span>
            <div className="font-semibold text-zinc-900 dark:text-white">
              {Math.round(totalCarbs)} g
            </div>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Vet</span>
            <div className="font-semibold text-zinc-900 dark:text-white">
              {Math.round(totalFat)} g
            </div>
          </div>
          {totalFiber > 0 && (
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Vezels</span>
              <div className="font-semibold text-zinc-900 dark:text-white">
                {Math.round(totalFiber)} g
              </div>
            </div>
          )}
          {totalSodium > 0 && (
            <div>
              <span className="text-zinc-500 dark:text-zinc-400">Natrium</span>
              <div className="font-semibold text-zinc-900 dark:text-white">
                {Math.round(totalSodium)} mg
              </div>
            </div>
          )}
        </div>

        {/* Per portion: altijd Nutri-Score per portie tonen wanneer er porties zijn */}
        {servings != null && servings > 0 && (
          <div className="flex items-start gap-4 border-l border-zinc-200 pl-4 dark:border-zinc-700">
            <div className="flex flex-wrap gap-3 text-sm">
              <div>
                <Text className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Per portie ({servings} {servings === 1 ? 'portie' : 'porties'}
                  )
                </Text>
                <div className="flex flex-wrap gap-3">
                  {perPortionKcal != null && (
                    <span className="font-medium text-zinc-900 dark:text-white">
                      {perPortionKcal} kcal
                    </span>
                  )}
                  {perPortionProtein != null && (
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Eiwit {perPortionProtein.toFixed(1)} g
                    </span>
                  )}
                  {perPortionCarbs != null && (
                    <span className="text-zinc-600 dark:text-zinc-400">
                      KH {perPortionCarbs.toFixed(1)} g
                    </span>
                  )}
                  {perPortionFat != null && (
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Vet {perPortionFat.toFixed(1)} g
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Nutri-Score per portie */}
            {nutriscoreGrade != null && (
              <div className="flex shrink-0 flex-col items-center gap-1">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold ${getNutriScoreBgClass(nutriscoreGrade)}`}
                  title="Nutri-Score per portie"
                >
                  {nutriscoreGrade}
                </span>
                <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                  Nutri-Score per portie
                </Text>
              </div>
            )}
          </div>
        )}
      </div>
      <Text className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Totaal gewicht ingrediënten: {Math.round(totalG)} g
      </Text>
    </div>
  );
}
