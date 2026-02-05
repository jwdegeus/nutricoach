'use client';

import { usePathname } from 'next/navigation';
import { Link } from '@/components/catalyst/link';
import { useTranslations } from 'next-intl';

export function AccountSectionTabs() {
  const pathname = usePathname();
  const tAccount = useTranslations('account');
  const tNav = useTranslations('nav');

  const isActive = (href: string) =>
    pathname === href || (href !== '/account' && pathname.startsWith(href));

  const linkClass = (href: string) =>
    isActive(href)
      ? 'inline-block border-b-2 border-primary pb-1 -mb-px text-primary'
      : 'text-muted-foreground hover:text-foreground';

  return (
    <header className="sticky top-16 z-10 border-b border-zinc-200 bg-white lg:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:lg:bg-zinc-950">
      <nav className="flex overflow-x-auto py-4" aria-label="Account secties">
        <ul
          role="list"
          className="flex min-w-full flex-none gap-x-6 px-4 text-sm/6 font-semibold text-zinc-500 sm:px-6 dark:text-zinc-400 lg:px-8"
        >
          <li>
            <Link href="/account" className={linkClass('/account')}>
              {tAccount('title')}
            </Link>
          </li>
          <li>
            <Link href="/runs" className={linkClass('/runs')}>
              {tNav('runs')}
            </Link>
          </li>
          <li>
            <Link href="/settings" className={linkClass('/settings')}>
              {tNav('settings')}
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
