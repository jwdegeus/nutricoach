import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Login | NutriCoach",
  description: "Login to your NutriCoach account",
};

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="text-sm text-muted-foreground">
          Voer je gegevens in om in te loggen
        </p>
      </div>
      <Suspense fallback={<div>Laden...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
