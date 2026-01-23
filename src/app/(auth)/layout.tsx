import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication | NutriCoach",
  description: "NutriCoach Authentication",
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md p-6">{children}</div>
    </div>
  );
}
