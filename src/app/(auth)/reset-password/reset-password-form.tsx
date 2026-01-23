"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPassword } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await resetPassword(formData);
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Verzenden..." : "Verstuur reset link"}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Terug naar login
        </Link>
      </div>
    </form>
  );
}
