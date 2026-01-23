import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Instellingen | NutriCoach",
  description: "Beheer je applicatie instellingen",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Instellingen
        </h1>
        <p className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
          Beheer je applicatie voorkeuren en instellingen
        </p>
      </div>

      <SettingsForm user={user} />
    </div>
  );
}
