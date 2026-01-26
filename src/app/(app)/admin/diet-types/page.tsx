import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { isAdmin } from "@/src/lib/auth/roles";
import { DietTypesAdminClient } from "./components/DietTypesAdminClient";

export const metadata = {
  title: "Dieettypes Beheer | NutriCoach Admin",
  description: "Beheer dieettypes",
};

export default async function DietTypesAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userIsAdmin = await isAdmin();
  if (!userIsAdmin) {
    redirect("/dashboard");
  }

  return <DietTypesAdminClient />;
}
