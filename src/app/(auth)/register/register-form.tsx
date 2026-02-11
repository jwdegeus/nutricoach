'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { signUp } from '../actions';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import { Field, Label, Description } from '@/components/catalyst/fieldset';

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await signUp(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(result.message);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
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
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={6}
        />
        <Description>Minimaal 6 tekens</Description>
      </Field>

      <Field>
        <Label htmlFor="passwordConfirm">Bevestig wachtwoord</Label>
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Registreren...' : 'Registreer'}
      </Button>

      <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Al een account?{' '}
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:underline dark:text-blue-400"
        >
          Log hier in
        </Link>
      </div>
    </form>
  );
}
