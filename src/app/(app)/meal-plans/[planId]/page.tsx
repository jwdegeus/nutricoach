import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { loadMealPlanAction } from "../actions/mealPlans.actions";
import { getNevoFoodByCode } from "@/src/lib/nevo/nutrition-calculator";
import { MealPlanSummary } from "./components/MealPlanSummary";
import { MealPlanActionsClient } from "./components/MealPlanActionsClient";
import { MealPlanPageWrapper } from "./components/MealPlanPageWrapper";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";

export const metadata: Metadata = {
  title: "Meal Plan Details | NutriCoach",
  description: "Bekijk en beheer je meal plan",
};

type PageProps = {
  params: Promise<{ planId: string }>;
};

/**
 * Meal plan detail page
 */
export default async function MealPlanDetailPage({
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

  // Load meal plan
  const planResult = await loadMealPlanAction(planId);

  if (!planResult.ok) {
    if (planResult.error.code === "AUTH_ERROR") {
      redirect("/login");
    }
    notFound();
  }

  const plan = planResult.data;

  // Get diet type name - first try from user's active profile, then from diet_types table by name
  let dietTypeName = plan.dietKey.replace(/_/g, " "); // Fallback
  
  // First, try to get from user's active profile
  const { data: dietProfile } = await supabase
    .from("user_diet_profiles")
    .select("diet_type_id, diet_types(name)")
    .eq("user_id", user.id)
    .is("ends_on", null) // Active profile
    .maybeSingle();

  let dietTypeNameFromDB: string | null = null;
  
  if (dietProfile?.diet_types) {
    const dietType = dietProfile.diet_types as { name: string } | null;
    dietTypeNameFromDB = dietType?.name || null;
  }
  
  // If not found in profile, try to find by name in diet_types table (using plan.dietKey)
  if (!dietTypeNameFromDB) {
    const { data: dietType } = await supabase
      .from("diet_types")
      .select("name")
      .eq("name", plan.dietKey)
      .eq("is_active", true)
      .maybeSingle();
    
    dietTypeNameFromDB = dietType?.name || null;
  }

  // Map diet type name to display name
  if (dietTypeNameFromDB) {
    const nameMap: Record<string, string> = {
      wahls_paleo_plus: "Wahls Paleo",
      "wahls-paleo-plus": "Wahls Paleo",
      "wahls paleo plus": "Wahls Paleo",
      keto: "Ketogeen",
      ketogenic: "Ketogeen",
      mediterranean: "Mediterraan",
      vegan: "Veganistisch",
      balanced: "Gebalanceerd",
    };
    dietTypeName = nameMap[dietTypeNameFromDB.toLowerCase()] || dietTypeNameFromDB;
  } else {
    // Final fallback: map plan.dietKey
    const nameMap: Record<string, string> = {
      wahls_paleo_plus: "Wahls Paleo",
      "wahls-paleo-plus": "Wahls Paleo",
      "wahls paleo plus": "Wahls Paleo",
      keto: "Ketogeen",
      ketogenic: "Ketogeen",
      mediterranean: "Mediterraan",
      vegan: "Veganistisch",
      balanced: "Gebalanceerd",
    };
    dietTypeName = nameMap[plan.dietKey.toLowerCase()] || plan.dietKey.replace(/_/g, " ");
  }

  // Build NEVO food names map for client components
  const nevoCodes = new Set<string>();
  for (const day of plan.planSnapshot.days) {
    for (const meal of day.meals) {
      if (meal.ingredientRefs) {
        for (const ref of meal.ingredientRefs) {
          nevoCodes.add(ref.nevoCode);
        }
      }
    }
  }

  const nevoFoodNamesByCode: Record<string, string> = {};
  for (const code of nevoCodes) {
    try {
      const codeNum = parseInt(code, 10);
      if (!isNaN(codeNum)) {
        const food = await getNevoFoodByCode(codeNum);
        nevoFoodNamesByCode[code] = food?.name_nl || food?.name_en || `NEVO ${code}`;
      } else {
        nevoFoodNamesByCode[code] = `NEVO ${code}`;
      }
    } catch {
      nevoFoodNamesByCode[code] = `NEVO ${code}`;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Heading level={1}>Meal Plan Details</Heading>
        <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
          Plan ID: {plan.id.substring(0, 8)}...
        </Text>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MealPlanSummary plan={plan} dietTypeName={dietTypeName} />
        <MealPlanActionsClient 
          planId={plan.id} 
          plan={plan.planSnapshot}
          onGuardrailsViolation={(violation) => {
            // Communicate violation state to MealPlanPageWrapper via custom event
            if (violation) {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('guardrails-violation', { detail: violation }));
              }
            } else {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('guardrails-violation-cleared'));
              }
            }
          }}
        />
      </div>

      {/* Plan Cards or Guardrails Violation */}
      <MealPlanPageWrapper
        planId={plan.id}
        plan={plan.planSnapshot}
        enrichment={plan.enrichmentSnapshot}
        nevoFoodNamesByCode={nevoFoodNamesByCode}
      />
    </div>
  );
}
