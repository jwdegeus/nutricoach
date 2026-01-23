"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { signUp } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-500/10 p-4 text-sm text-green-600 dark:text-green-400">
          <strong>Succes:</strong> {success}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          E-mail
        </label>
        <Input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="jouw@email.nl"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Wachtwoord
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
          Bevestig wachtwoord
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
        {isPending ? "Registreren..." : "Registreer"}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        Al een account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log hier in
        </Link>
      </div>
    </form>
  );
}
