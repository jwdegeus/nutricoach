import { redirect } from "next/navigation";

// Redirect /meals to /recipes for consistency
export default function MealsRedirectPage() {
  redirect("/recipes");
}
