import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Check onboarding status before redirecting
    const { data: preferences } = await supabase
      .from("user_preferences")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle();

    // Redirect to onboarding if not completed, otherwise to dashboard
    const redirectPath = preferences?.onboarding_completed ? "/dashboard" : "/onboarding";
    redirect(redirectPath);
  } else {
    redirect("/login");
  }
}
