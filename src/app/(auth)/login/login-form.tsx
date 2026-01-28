'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from '../actions';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, Label } from '@/components/catalyst/fieldset';

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');

  async function handleSubmit(formData: FormData) {
    setError(null);
    if (redirect) {
      formData.append('redirect', redirect);
    }
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950/50 p-4 text-sm text-red-600 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      <Field>
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="jouw@email.nl"
        />
      </Field>

      <Field>
        <Label htmlFor="password">Wachtwoord</Label>
        <Input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </Field>

      <div className="flex items-center justify-between">
        <Link
          href="/reset-password"
          className="text-sm text-primary hover:underline"
        >
          Wachtwoord vergeten?
        </Link>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Inloggen...' : 'Inloggen'}
      </Button>

      <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Nog geen account?{' '}
        <Link
          href="/register"
          className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Registreer hier
        </Link>
      </div>
    </form>
  );
}
