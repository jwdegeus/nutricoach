import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { loadMealPlanAction } from '../actions/mealPlans.actions';
import { getNevoFoodByCode } from '@/src/lib/nevo/nutrition-calculator';
import { MealPlanSummary } from './components/MealPlanSummary';
import { MealPlanActionsClient } from './components/MealPlanActionsClient';
import { MealPlanPageWrapper } from './components/MealPlanPageWrapper';
import { MealPlanDraftBannerClient } from './components/MealPlanDraftBannerClient';
import { MealPlanProvenance } from './components/MealPlanProvenance';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Badge } from '@/components/catalyst/badge';

export const metadata: Metadata = {
  title: 'Weekmenu | NutriCoach',
  description: 'Bekijk en beheer je weekmenu',
};

type PageProps = {
  params: Promise<{ planId: string }>;
};

/**
 * Meal plan detail page
 */
export default async function MealPlanDetailPage({ params }: PageProps) {
  const { planId } = await params;

  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Load meal plan
  const planResult = await loadMealPlanAction(planId);

  if (!planResult.ok) {
    if (planResult.error.code === 'AUTH_ERROR') {
      redirect('/login');
    }
    notFound();
  }

  const plan = planResult.data;

  // Provenance: was this plan created by a cron job?
  const { data: cronJob } = await supabase
    .from('meal_plan_generation_jobs')
    .select('id')
    .eq('meal_plan_id', plan.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const cronJobId = (cronJob as { id: string } | null)?.id ?? null;

  // Get diet type name - first try from user's active profile, then from diet_types table by name
  let dietTypeName = plan.dietKey.replace(/_/g, ' '); // Fallback

  // First, try to get from user's active profile
  const { data: dietProfile } = await supabase
    .from('user_diet_profiles')
    .select('diet_type_id, diet_types(name)')
    .eq('user_id', user.id)
    .is('ends_on', null) // Active profile
    .maybeSingle();

  let dietTypeNameFromDB: string | null = null;

  if (dietProfile?.diet_types) {
    const dietTypesRow = dietProfile.diet_types as
      | { name: string }[]
      | { name: string }
      | null;
    dietTypeNameFromDB = Array.isArray(dietTypesRow)
      ? (dietTypesRow[0]?.name ?? null)
      : ((dietTypesRow as { name: string } | null)?.name ?? null);
  }

  // If not found in profile, try to find by name in diet_types table (using plan.dietKey)
  if (!dietTypeNameFromDB) {
    const { data: dietType } = await supabase
      .from('diet_types')
      .select('name')
      .eq('name', plan.dietKey)
      .eq('is_active', true)
      .maybeSingle();

    dietTypeNameFromDB = dietType?.name || null;
  }

  // Map diet type name to display name
  if (dietTypeNameFromDB) {
    const nameMap: Record<string, string> = {
      wahls_paleo_plus: 'Wahls Paleo',
      'wahls-paleo-plus': 'Wahls Paleo',
      'wahls paleo plus': 'Wahls Paleo',
      keto: 'Ketogeen',
      ketogenic: 'Ketogeen',
      mediterranean: 'Mediterraan',
      vegan: 'Veganistisch',
      balanced: 'Gebalanceerd',
    };
    dietTypeName =
      nameMap[dietTypeNameFromDB.toLowerCase()] || dietTypeNameFromDB;
  } else {
    // Final fallback: map plan.dietKey
    const nameMap: Record<string, string> = {
      wahls_paleo_plus: 'Wahls Paleo',
      'wahls-paleo-plus': 'Wahls Paleo',
      'wahls paleo plus': 'Wahls Paleo',
      keto: 'Ketogeen',
      ketogenic: 'Ketogeen',
      mediterranean: 'Mediterraan',
      vegan: 'Veganistisch',
      balanced: 'Gebalanceerd',
    };
    dietTypeName =
      nameMap[plan.dietKey.toLowerCase()] || plan.dietKey.replace(/_/g, ' ');
  }

  // Current snapshot for display (draft takes precedence when in review)
  const currentSnapshot =
    plan.status === 'draft' && plan.draftPlanSnapshot != null
      ? plan.draftPlanSnapshot
      : plan.planSnapshot;
  const provenance = (
    currentSnapshot?.metadata as Record<string, unknown> | undefined
  )?.provenance as
    | { reusedRecipeCount?: number; generatedRecipeCount?: number }
    | undefined;
  const reused =
    provenance != null && typeof provenance.reusedRecipeCount === 'number'
      ? provenance.reusedRecipeCount
      : null;
  const generated =
    provenance != null && typeof provenance.generatedRecipeCount === 'number'
      ? provenance.generatedRecipeCount
      : null;
  const showProvenanceCounters =
    reused !== null && generated !== null && (reused > 0 || generated > 0);
  const total = showProvenanceCounters ? reused! + generated! : 0;
  const reusePct = total > 0 ? Math.round((reused! / total) * 100) : 0;

  // Servings metadata (defensive: plan may have been scaled to household)
  const servingsMeta = (
    currentSnapshot?.metadata as Record<string, unknown> | undefined
  )?.servings as { householdSize?: number; policy?: string } | undefined;
  const householdSize =
    servingsMeta != null &&
    typeof servingsMeta.householdSize === 'number' &&
    servingsMeta.householdSize > 0
      ? servingsMeta.householdSize
      : null;
  const servingsPolicy =
    servingsMeta?.policy === 'scale_to_household' ||
    servingsMeta?.policy === 'keep_recipe_servings'
      ? servingsMeta.policy
      : null;
  const showServingsMeta = householdSize !== null && servingsPolicy !== null;
  const SERVINGS_POLICY_LABELS: Record<string, string> = {
    scale_to_household: 'Porties: geschaald',
    keep_recipe_servings: 'Porties: recept',
  };

  // Weekend dinner override from request snapshot (defensive: slotPreferences may be missing)
  const slotPrefs = (
    plan.requestSnapshot as Record<string, unknown> | undefined
  )?.slotPreferences as
    | { weekendDinnerStyle?: string; weekendDays?: number[] }
    | undefined;
  const weekendDinnerStyle =
    typeof slotPrefs?.weekendDinnerStyle === 'string' &&
    slotPrefs.weekendDinnerStyle.trim() !== ''
      ? slotPrefs.weekendDinnerStyle.trim()
      : null;
  const weekendDaysRaw = Array.isArray(slotPrefs?.weekendDays)
    ? slotPrefs.weekendDays.filter((d) => d === 0 || d === 6)
    : [];
  const weekendDaysLabels = [...new Set(weekendDaysRaw)]
    .sort((a, b) => a - b)
    .map((d) => (d === 6 ? 'Za' : 'Zo'));
  const weekendDaysDisplay =
    weekendDaysLabels.length > 0 ? weekendDaysLabels.join(', ') : null;
  const showWeekendOverride =
    weekendDinnerStyle != null && weekendDinnerStyle !== '';
  const WEEKEND_STYLE_LABELS: Record<string, string> = {
    any: 'elk',
    quick: 'snel',
    family: 'gezin',
    high_protein: 'eiwitrijk',
    special: 'bijzonder',
  };
  const weekendStyleDisplay = showWeekendOverride
    ? (WEEKEND_STYLE_LABELS[weekendDinnerStyle!] ?? weekendDinnerStyle)
    : null;

  // Guardrails meta from snapshot (defensive: no DB, render only if present)
  const guardrailsMeta = (
    currentSnapshot?.metadata as Record<string, unknown> | undefined
  )?.guardrails as
    | { constraintsInPrompt?: boolean; contentHash?: string; version?: string }
    | undefined;
  const constraintsInPrompt = guardrailsMeta?.constraintsInPrompt === true;
  const contentHash =
    typeof guardrailsMeta?.contentHash === 'string' &&
    guardrailsMeta.contentHash.length > 0
      ? guardrailsMeta.contentHash
      : null;
  const version =
    typeof guardrailsMeta?.version === 'string' &&
    guardrailsMeta.version.length > 0
      ? guardrailsMeta.version
      : null;
  const showGuardrailsMeta =
    constraintsInPrompt === true || contentHash != null || version != null;

  // Build NEVO food names map for client components
  const nevoCodes = new Set<string>();
  for (const day of plan.planSnapshot.days) {
    for (const meal of day.meals) {
      if (meal.ingredientRefs) {
        for (const ref of meal.ingredientRefs) {
          nevoCodes.add(ref.nevoCode);
        }
      }
    }
  }

  const nevoFoodNamesByCode: Record<string, string> = {};
  for (const code of nevoCodes) {
    try {
      const codeNum = parseInt(code, 10);
      if (!isNaN(codeNum)) {
        const food = await getNevoFoodByCode(codeNum);
        nevoFoodNamesByCode[code] =
          String(food?.name_nl ?? '').trim() ||
          String(food?.name_en ?? '').trim() ||
          `NEVO ${code}`;
      } else {
        nevoFoodNamesByCode[code] = `NEVO ${code}`;
      }
    } catch {
      nevoFoodNamesByCode[code] = `NEVO ${code}`;
    }
  }

  return (
    <div className="space-y-6">
      {plan.status === 'draft' && (
        <MealPlanDraftBannerClient planId={plan.id} />
      )}
      <div>
        <Heading level={1}>Weekmenu</Heading>
        <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
          Plan ID: {plan.id.substring(0, 8)}...
        </Text>
        <MealPlanProvenance cronJobId={cronJobId} />
        {showProvenanceCounters && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>Hergebruikt: {reused}</Badge>
            <Badge>Nieuw: {generated}</Badge>
            <Text className="text-sm text-muted-foreground">
              Reuse: {reusePct}%
            </Text>
          </div>
        )}
        {showServingsMeta && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>Huishouden: {householdSize}</Badge>
            <Badge>{SERVINGS_POLICY_LABELS[servingsPolicy!]}</Badge>
          </div>
        )}
        {showWeekendOverride && weekendStyleDisplay && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>Weekend</Badge>
            <Text className="text-sm text-muted-foreground">
              Diner: {weekendStyleDisplay}
              {weekendDaysDisplay ? ` · Dagen: ${weekendDaysDisplay}` : ''}
            </Text>
          </div>
        )}
        {showGuardrailsMeta && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge>Guardrails</Badge>
            <Badge color={constraintsInPrompt ? 'green' : 'zinc'}>
              Constraints: {constraintsInPrompt ? 'ja' : 'nee'}
            </Badge>
            {contentHash && (
              <Text className="text-sm text-muted-foreground font-mono">
                hash:{' '}
                {contentHash.length > 8
                  ? `${contentHash.slice(0, 8)}…`
                  : contentHash}
              </Text>
            )}
            {version && (
              <Text className="text-sm text-muted-foreground">
                v: {version.length > 12 ? `${version.slice(0, 12)}…` : version}
              </Text>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MealPlanSummary plan={plan} dietTypeName={dietTypeName} />
        <MealPlanActionsClient
          planId={plan.id}
          plan={plan.planSnapshot}
          planStatus={plan.status}
        />
      </div>

      {/* Plan Cards or Guardrails Violation */}
      <MealPlanPageWrapper
        planId={plan.id}
        plan={plan.planSnapshot}
        enrichment={plan.enrichmentSnapshot}
        nevoFoodNamesByCode={nevoFoodNamesByCode}
        planStatus={plan.status}
      />
    </div>
  );
}
