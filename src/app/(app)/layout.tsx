import type { Metadata } from "next";
import { ClientOnlyApplicationLayout } from "@/src/components/app/ClientOnlyApplicationLayout";

export const metadata: Metadata = {
  title: "Dashboard | NutriCoach",
  description: "NutriCoach Dashboard",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Onboarding gating is handled in middleware.ts for better performance
  // Use ClientOnlyApplicationLayout to prevent hydration mismatches with Headless UI
  return <ClientOnlyApplicationLayout>{children}</ClientOnlyApplicationLayout>;
}
