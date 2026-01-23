"use client";

import { useState, useTransition } from "react";
import { updatePassword } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Fout:</strong> {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Nieuw wachtwoord
        </label>
        <Input
          id="password"
          type="password"
          name="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={6}
        />
        <p className="text-xs text-muted-foreground">Minimaal 6 tekens</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="passwordConfirm" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Bevestig nieuw wachtwoord
        </label>
        <Input
          id="passwordConfirm"
          type="password"
          name="passwordConfirm"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          minLength={6}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Wachtwoord bijwerken..." : "Wachtwoord bijwerken"}
      </Button>
    </form>
  );
}
