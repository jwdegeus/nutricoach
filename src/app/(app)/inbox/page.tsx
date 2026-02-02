import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { listInboxNotificationsAction } from './actions/inboxNotifications.actions';
import { InboxListClient } from './components/InboxListClient';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';

export const metadata: Metadata = {
  title: 'Inbox | NutriCoach',
  description: 'Bekijk je notificaties',
};

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const result = await listInboxNotificationsAction({ limit: 20 });

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <Heading level={1}>Inbox</Heading>
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
          role="alert"
        >
          <Text className="font-medium">Fout</Text>
          <Text className="mt-1">{result.error.message}</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="space-y-4">
        <div>
          <Heading level={1}>Inbox</Heading>
          <Text className="mt-2 text-muted-foreground">
            Notificaties over mislukte generaties en andere meldingen
          </Text>
        </div>
        <InboxListClient initialNotifications={result.data} />
      </div>
    </div>
  );
}
