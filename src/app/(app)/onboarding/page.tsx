import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { OnboardingWizard } from './components/OnboardingWizard';

export default async function OnboardingPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if onboarding is already completed to prevent showing wizard unnecessarily
  // (though layout should have redirected, this is a safety check)
  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('onboarding_completed')
    .eq('user_id', user.id)
    .maybeSingle();

  // If already completed, redirect to dashboard
  // This prevents redirect loops and handles edge cases
  if (preferences?.onboarding_completed) {
    redirect('/dashboard');
  }

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          {/* TODO: i18n key: onboarding.title */}
          Welkom bij NutriCoach
        </h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
          {/* TODO: i18n key: onboarding.description */}
          Laten we je voorkeuren instellen om een persoonlijk maaltijdplan voor
          je te maken.
        </p>
      </div>
      <OnboardingWizard />
    </div>
  );
}
