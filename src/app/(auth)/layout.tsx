import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication | NutriCoach',
  description: 'NutriCoach Authentication',
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">{children}</div>
      </div>
      <div className="relative hidden w-0 flex-1 lg:block">
        <img
          alt=""
          src="/images/login-hero.png"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    </div>
  );
}
