import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { isAdmin } from "@/src/lib/auth/roles";
import { RecipeSourcesAdminClient } from "./components/RecipeSourcesAdminClient";

export const metadata = {
  title: "Recept Bronnen Beheer | NutriCoach Admin",
  description: "Beheer recept bronnen",
};

export default async function RecipeSourcesAdminPage() {
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

  return <RecipeSourcesAdminClient />;
}
