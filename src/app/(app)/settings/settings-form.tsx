'use client';

import { useState, useTransition } from 'react';
import { updatePassword } from '@/src/app/(auth)/actions';
import { setCurrentUserAsAdmin } from './actions/set-admin.action';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import type { User } from '@supabase/supabase-js';

interface SettingsFormProps {
  user: User;
}

export function SettingsForm({ user: _user }: SettingsFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handlePasswordSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updatePassword(formData);
      if (result?.error) {
        setError(result.error);
      }
      // Note: On success, updatePassword redirects, so this code won't execute
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <strong>Succes:</strong> {success}
        </div>
      )}

      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="mb-6">
          <h2 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
            Wachtwoord wijzigen
          </h2>
          <Text className="mt-1">
            Wijzig je wachtwoord om je account veilig te houden. Gebruik
            minimaal 6 tekens.
          </Text>
        </div>
        <form action={handlePasswordSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="password">Nieuw wachtwoord</Label>
              <Description>Minimaal 6 tekens</Description>
              <Input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                minLength={6}
              />
            </Field>

            <Field>
              <Label htmlFor="passwordConfirm">Bevestig nieuw wachtwoord</Label>
              <Input
                id="passwordConfirm"
                type="password"
                name="passwordConfirm"
                required
                autoComplete="new-password"
                placeholder="••••••••"
                minLength={6}
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Wachtwoord bijwerken...' : 'Wachtwoord bijwerken'}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="mb-6">
          <h2 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
            Account acties
          </h2>
          <Text className="mt-1">Beheer je account en sessies.</Text>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
                Admin rol aanvragen
              </p>
              <p className="text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400 mt-1">
                Maak jezelf admin (alleen mogelijk als er nog geen admins zijn).
              </p>
            </div>
            <Button
              onClick={async () => {
                setError(null);
                setSuccess(null);
                startTransition(async () => {
                  const result = await setCurrentUserAsAdmin();
                  if (result.error) {
                    setError(result.error);
                  } else if (result.success) {
                    setSuccess(
                      'Je hebt nu admin rechten! Ververs de pagina om de admin functies te zien.',
                    );
                  }
                });
              }}
              disabled={isPending}
            >
              {isPending ? 'Bezig...' : 'Maak mij admin'}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
                Account verwijderen
              </p>
              <p className="text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400 mt-1">
                Verwijder permanent je account en alle bijbehorende gegevens.
              </p>
            </div>
            <Button color="red">Account verwijderen</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
