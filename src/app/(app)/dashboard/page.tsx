import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | NutriCoach",
  description: "NutriCoach Dashboard Overview",
};

export default async function DashboardPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
    </div>
  );
}
