import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { loadMealPlanAction } from "../../actions/mealPlans.actions";
import { PlanChatClient } from "./components/PlanChatClient";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";

export const metadata: Metadata = {
  title: "Plan Chat | NutriCoach",
  description: "Chat met je meal plan om aanpassingen te maken",
};

type PageProps = {
  params: Promise<{ planId: string }>;
};

/**
 * Plan chat page
 */
export default async function PlanChatPage({
  params,
}: PageProps) {
  const { planId } = await params;

  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Load meal plan to verify access
  const planResult = await loadMealPlanAction(planId);

  if (!planResult.ok) {
    if (planResult.error.code === "AUTH_ERROR") {
      redirect("/login");
    }
    redirect(`/meal-plans/${planId}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <Heading level={1}>Plan Chat</Heading>
        <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
          Pas je meal plan aan via chat
        </Text>
      </div>

      <PlanChatClient planId={planId} />
    </div>
  );
}
