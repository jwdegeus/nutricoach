"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  async function handleSubmit(formData: FormData) {
    setError(null);
    if (redirect) {
      formData.append("redirect", redirect);
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
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Fout:</strong> {error}
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
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center justify-between">
        <Link href="/reset-password" className="text-sm text-primary hover:underline">
          Wachtwoord vergeten?
        </Link>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Inloggen..." : "Inloggen"}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        Nog geen account?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Registreer hier
        </Link>
      </div>
    </form>
  );
}
