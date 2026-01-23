import type { Metadata } from "next";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = {
  title: "Nieuw wachtwoord instellen | NutriCoach",
  description: "Stel een nieuw wachtwoord in",
};

export default function ConfirmResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Nieuw wachtwoord instellen</h1>
        <p className="text-sm text-muted-foreground">
          Voer een nieuw wachtwoord in voor je account
        </p>
      </div>
      <UpdatePasswordForm />
    </div>
  );
}
