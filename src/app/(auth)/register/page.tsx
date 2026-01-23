import type { Metadata } from "next";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Registreer | NutriCoach",
  description: "Maak een nieuw NutriCoach account aan",
};

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Registreer</h1>
        <p className="text-sm text-muted-foreground">
          Maak een nieuw account aan om te beginnen
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
