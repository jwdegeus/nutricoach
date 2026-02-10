import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getTranslations } from 'next-intl/server';
import { AccountSectionTabs } from '@/src/components/app/AccountSectionTabs';
import { FamilyDietCard } from '../components/FamilyDietCard';
import { FamilieEditSections } from './FamilieEditSections';
import { Link } from '@/components/catalyst/link';
import { ArrowLeftIcon } from '@heroicons/react/16/solid';
import { getMealPlanSchedulePreferencesAction } from '@/src/app/(app)/settings/actions/meal-plan-schedule-preferences.actions';
import { getFamilyDietPrefsAction } from '../actions/family-diet.actions';
import { getDietTypes } from '@/src/app/(app)/onboarding/queries/diet-types.queries';
import { listHouseholdAvoidRulesAction } from '@/src/app/(app)/settings/actions/household-avoid-rules.actions';
import { getHouseholdServingsPrefsAction } from '@/src/app/(app)/settings/actions/household-servings.actions';
import { getMealSlotStylePreferencesAction } from '@/src/app/(app)/settings/actions/meal-slot-style-preferences.actions';

export const metadata: Metadata = {
  title: 'Gezinsdieet bewerken | NutriCoach',
  description: 'Bewerk gezinsdieet en gezinsvoorkeuren',
};

export default async function FamilieEditPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const t = await getTranslations('family');

  // Load all section data server-side so client doesn't fire many POSTs on mount
  const [
    schedulePrefsResult,
    familyDietResult,
    dietTypes,
    avoidRulesResult,
    servingsResult,
    slotPrefsResult,
  ] = await Promise.all([
    getMealPlanSchedulePreferencesAction(),
    getFamilyDietPrefsAction(),
    getDietTypes(),
    listHouseholdAvoidRulesAction(),
    getHouseholdServingsPrefsAction(),
    getMealSlotStylePreferencesAction(),
  ]);

  const schedulePrefs =
    schedulePrefsResult.ok && schedulePrefsResult.data
      ? schedulePrefsResult.data
      : null;
  const familyDietPrefs = familyDietResult.ok ? familyDietResult.prefs : null;
  const avoidRules = avoidRulesResult.ok ? avoidRulesResult.data : null;
  const householdServings = servingsResult.ok ? servingsResult.data : null;
  const mealSlotStylePrefs = slotPrefsResult.ok ? slotPrefsResult.data : null;

  return (
    <>
      <h1 className="sr-only">{t('familyDietHeading')}</h1>
      <AccountSectionTabs />

      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        <section
          id="family-diet"
          className="grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8"
          aria-labelledby="family-diet-heading"
        >
          <div>
            <Link
              href="/familie"
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white mb-4"
            >
              <ArrowLeftIcon className="size-4" />
              {t('backToList')}
            </Link>
            <h2
              id="family-diet-heading"
              className="text-base/7 font-semibold text-zinc-950 dark:text-white"
            >
              {t('familyDietHeading')}
            </h2>
            <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
              {t('familyDietDescription')}
            </p>
          </div>
          <div className="md:col-span-2">
            <FamilyDietCard
              hideHeading
              initialDietTypes={dietTypes}
              initialPrefs={familyDietPrefs}
            />
          </div>
        </section>

        <FamilieEditSections
          schedulePrefs={schedulePrefs}
          initialAvoidRules={avoidRules}
          initialHouseholdServings={householdServings}
          initialMealSlotStylePrefs={mealSlotStylePrefs}
        />
      </div>
    </>
  );
}
