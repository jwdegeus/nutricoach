import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { RunDueClient } from './RunDueClient';

export const metadata: Metadata = {
  title: 'Run due job (test) | NutriCoach',
  description: 'Handmatig één due weekmenu-job uitvoeren voor test',
};

export default async function RunDueJobPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <div>
          <Heading level={1}>Run due job (test)</Heading>
          <Text className="mt-2 text-muted-foreground">
            Voer handmatig één due weekmenu-job uit. Handig om de cron-pipeline
            te testen zonder externe scheduler.
          </Text>
        </div>

        <RunDueClient />
      </div>
    </div>
  );
}
