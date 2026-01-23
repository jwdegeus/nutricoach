import type { Metadata } from "next";
import { ApplicationLayout } from "@/src/components/app/ApplicationLayout";

export const metadata: Metadata = {
  title: "Dashboard | NutriCoach",
  description: "NutriCoach Dashboard",
};

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ApplicationLayout>{children}</ApplicationLayout>;
}
