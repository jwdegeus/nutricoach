import type { Metadata } from "next";
import { MealsPageClient } from "./components/MealsPageClient";
import { getAllMealsAction } from "./actions/meals.actions";

export const metadata: Metadata = {
  title: "Maaltijden Database | NutriCoach",
  description: "Bekijk en beheer alle maaltijden",
};

export default async function MealsPage() {
  const result = await getAllMealsAction();

  if (!result.ok) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold tracking-tight mb-4">Maaltijden Database</h1>
        <div className="text-red-600">Fout: {result.error.message}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Maaltijden Database</h1>
      </div>
      <MealsPageClient initialMeals={result.data} />
    </div>
  );
}
