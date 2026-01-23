"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "./account-actions";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Field, FieldGroup, Label, Description } from "@/components/catalyst/fieldset";
import { Text } from "@/components/catalyst/text";
import type { User } from "@supabase/supabase-js";

interface AccountProfileProps {
  user: User;
}

export function AccountProfile({ user }: AccountProfileProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setSuccess(result.message);
      }
    });
  }

  const userMetadata = user.user_metadata || {};
  const fullName = userMetadata.full_name || "";
  const displayName = userMetadata.display_name || "";

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
            Profielgegevens
          </h2>
          <Text className="mt-1">
            Update je persoonlijke informatie. Je e-mailadres kan niet worden gewijzigd.
          </Text>
        </div>
        <form action={handleSubmit}>
          <FieldGroup>
            <Field>
              <Label htmlFor="email">E-mailadres</Label>
              <Description>Je e-mailadres kan niet worden gewijzigd.</Description>
              <Input
                id="email"
                type="email"
                value={user.email || ""}
                disabled
              />
            </Field>

            <Field>
              <Label htmlFor="full_name">Volledige naam</Label>
              <Input
                id="full_name"
                type="text"
                name="full_name"
                defaultValue={fullName}
                placeholder="Je volledige naam"
                autoComplete="name"
              />
            </Field>

            <Field>
              <Label htmlFor="display_name">Weergavenaam</Label>
              <Description>Deze naam wordt getoond in de applicatie.</Description>
              <Input
                id="display_name"
                type="text"
                name="display_name"
                defaultValue={displayName}
                placeholder="Je weergavenaam"
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Opslaan..." : "Opslaan"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="mb-6">
          <h2 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
            Account informatie
          </h2>
        </div>
        <div className="space-y-4">
          <div className="flex justify-between py-2">
            <span className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
              Account aangemaakt
            </span>
            <span className="text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
              {new Date(user.created_at).toLocaleDateString("nl-NL", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
              Laatste login
            </span>
            <span className="text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
              {user.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleDateString("nl-NL", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Nog niet ingelogd"}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-base/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">
              E-mail bevestigd
            </span>
            <span className="text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
              {user.email_confirmed_at ? "Ja" : "Nee"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
