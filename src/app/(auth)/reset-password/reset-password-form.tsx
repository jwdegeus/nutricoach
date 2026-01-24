"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resetPassword } from "../actions";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, Label } from "@/components/catalyst/fieldset";

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
        <div className="rounded-lg bg-red-50 dark:bg-red-950/50 p-4 text-sm text-red-600 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/50 p-4 text-sm text-green-600 dark:text-green-400">
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

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Verzenden..." : "Verstuur reset link"}
      </Button>

      <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        <Link href="/login" className="font-medium text-blue-600 dark:text-blue-400 hover:underline">
          Terug naar login
        </Link>
      </div>
    </form>
  );
}
