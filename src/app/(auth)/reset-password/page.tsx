import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Wachtwoord resetten | NutriCoach',
  description: 'Reset je wachtwoord',
};

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">Wachtwoord vergeten?</h1>
        <p className="text-sm text-muted-foreground">
          Voer je e-mailadres in en we sturen je een link om je wachtwoord te
          resetten
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
