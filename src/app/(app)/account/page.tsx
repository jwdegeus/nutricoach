import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { AccountProfile } from "./account-profile";

export const metadata: Metadata = {
  title: "Mijn Account | NutriCoach",
  description: "Beheer je accountgegevens",
};

export default async function AccountPage() {
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
          Mijn Account
        </h1>
        <p className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
          Beheer je accountgegevens en voorkeuren
        </p>
      </div>

      <AccountProfile user={user} />
    </div>
  );
}
