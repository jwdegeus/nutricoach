'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Link } from '@/components/catalyst/link';
import { Listbox, ListboxOption } from '@/components/catalyst/listbox';
import { useTranslations } from 'next-intl';

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
      {/* Mobile: Tailwind-styled Listbox (non-native dropdown) */}
      <div className="sm:hidden">
        <label htmlFor="account-tabs" className="sr-only">
          Account secties
        </label>
        <Listbox
          value={currentHref}
          onChange={(val) => router.push(val)}
          aria-label="Account secties"
          className="w-full"
        >
          {tabs.map((t) => (
            <ListboxOption key={t.href} value={t.href}>
              {getLabel(t.labelKey)}
            </ListboxOption>
          ))}
        </Listbox>
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
