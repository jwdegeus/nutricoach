"use client";

import { useState, useTransition } from "react";
import { updatePassword } from "../../actions";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, Label, Description } from "@/components/catalyst/fieldset";

export function UpdatePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePassword(formData);
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
        <Label htmlFor="password">Nieuw wachtwoord</Label>
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Wachtwoord bijwerken..." : "Wachtwoord bijwerken"}
      </Button>
    </form>
  );
}
