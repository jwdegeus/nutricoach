import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Link } from '@/components/catalyst/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Login | NutriCoach',
  description: 'Login to your NutriCoach account',
};

export default function LoginPage() {
  return (
    <div className="space-y-10">
      <div>
        <Link href="/" className="text-primary text-xl font-semibold">
          NutriCoach
        </Link>
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Log in op je account
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Voer je gegevens in om in te loggen
        </p>
      </div>
      <Suspense
        fallback={<div className="text-muted-foreground">Laden...</div>}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
