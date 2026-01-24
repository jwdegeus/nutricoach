import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { isAdmin } from "@/src/lib/auth/roles";
import { getAllDietTypes } from "../../../actions/diet-admin.actions";
import { DietEditPage } from "./diet-edit-page";

export const metadata: Metadata = {
  title: "Dieettype bewerken | NutriCoach",
  description: "Bewerk dieettype en regels",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditDietPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const admin = await isAdmin();
  if (!admin) {
    redirect("/settings");
  }

  // Fetch diet type to verify it exists
  const dietTypesResult = await getAllDietTypes();
  if ("error" in dietTypesResult || !dietTypesResult.data) {
    redirect("/settings");
  }

  const dietType = dietTypesResult.data.find((dt) => dt.id === id);
  if (!dietType) {
    redirect("/settings");
  }

  return <DietEditPage dietType={dietType} />;
}
