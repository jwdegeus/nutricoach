'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Link } from '@/components/catalyst/link';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/16/solid';

const tabs = [
  { href: '/account', labelKey: 'account.title' as const },
  { href: '/runs', labelKey: 'nav.runs' as const },
  { href: '/settings', labelKey: 'nav.settings' as const },
] as const;

export function AccountSectionTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const tAccount = useTranslations('account');
  const tNav = useTranslations('nav');

  const isActive = (href: string) =>
    pathname === href || (href !== '/account' && pathname.startsWith(href));

  const getLabel = (labelKey: (typeof tabs)[number]['labelKey']) => {
    if (labelKey === 'account.title') return tAccount('title');
    if (labelKey === 'nav.runs') return tNav('runs');
    return tNav('settings');
  };

  const currentHref = tabs.find((t) => isActive(t.href))?.href ?? tabs[0]!.href;

  // Page-local sticky: top-16 = below navbar (h-16); z-10 < navbar z-20
  return (
    <header
      className="sticky top-16 z-10 border-b border-border/50 bg-background/80 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:py-0"
      role="banner"
    >
      {/* Mobile: native select with chevron overlay */}
      <div className="sm:hidden">
        <label htmlFor="account-tabs" className="sr-only">
          Account secties
        </label>
        <div className="relative">
          <select
            id="account-tabs"
            value={currentHref}
            onChange={(e) => router.push(e.target.value)}
            className="block w-full appearance-none rounded-lg border border-border bg-input py-2.5 pr-10 pl-4 text-base text-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background focus:outline-none"
            aria-label="Account secties"
          >
            {tabs.map((t) => (
              <option key={t.href} value={t.href}>
                {getLabel(t.labelKey)}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </div>
      </div>

      {/* Desktop: nav with underline indicator */}
      <nav
        className="hidden overflow-x-auto sm:block"
        aria-label="Account secties"
      >
        <ul
          role="list"
          className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold sm:px-6 lg:px-8"
        >
          {tabs.map((t) => {
            const active = isActive(t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? 'page' : undefined}
                  className={`-mb-px inline-block border-b-2 pt-4 pb-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    active
                      ? 'border-primary-500 text-primary-600 dark:text-primary-500'
                      : 'border-transparent text-muted-foreground hover:border-border/60 hover:text-foreground'
                  }`}
                >
                  {getLabel(t.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
