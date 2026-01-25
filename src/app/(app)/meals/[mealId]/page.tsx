import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { MealDetailPageClient } from "./components/MealDetailPageClient";

export const metadata: Metadata = {
  title: "Maaltijd Details | NutriCoach",
  description: "Bekijk details van een maaltijd",
};

// Prevent automatic revalidation and caching issues
export const dynamic = 'force-dynamic';
export const revalidate = false;
export const fetchCache = 'force-no-store';

type PageProps = {
  params: Promise<{ mealId: string }>;
  searchParams: Promise<{ source?: string }>;
};

/**
 * Meal detail page - client-side rendering to avoid POST request loops
 */
export default async function MealDetailPage({
  params,
  searchParams,
}: PageProps) {
  // Check authentication
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { mealId } = await params;
  const { source } = await searchParams;
  const mealSource = (source === "gemini" ? "gemini" : "custom") as "custom" | "gemini";

  return <MealDetailPageClient mealId={mealId} mealSource={mealSource} />;
}
