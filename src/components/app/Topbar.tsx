'use client';

import { usePathname } from 'next/navigation';
import { Search, User, Settings, LogOut } from 'lucide-react';
import { getPageTitle, getBreadcrumbs } from '@/src/lib/nav';
import { Input } from '@/components/catalyst/input';
import { Breadcrumbs } from '@/components/catalyst/breadcrumbs';
import { MobileSidebar } from '@/src/components/app/MobileSidebar';
import {
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownHeader,
  DropdownDivider,
} from '@/components/catalyst/dropdown';
import { useTranslations } from 'next-intl';

export function Topbar() {
  const pathname = usePathname();
  const t = useTranslations();
  const pageTitle = getPageTitle(pathname, (key: string) => t(key));
  const breadcrumbs = getBreadcrumbs(pathname, (key: string) => t(key));
  const tCommon = useTranslations('common');
  const tMenu = useTranslations('menu');

  return (
    <header className="flex h-16 items-center border-b border-gray-200 bg-white px-4 md:px-6 dark:bg-gray-800/75 dark:border-gray-700">
      <div className="flex flex-1 items-center justify-between gap-4">
        {/* Left side: Mobile sidebar trigger, breadcrumbs, and page title */}
        <div className="flex flex-1 items-center gap-4 min-w-0">
          {/* Mobile Sidebar Trigger */}
          <div className="md:hidden">
            <MobileSidebar />
          </div>

          {/* Breadcrumbs */}
          <div className="hidden md:flex items-center">
            <Breadcrumbs items={breadcrumbs} />
          </div>

          {/* Page title (mobile) */}
          <h2 className="text-sm font-medium text-gray-500 md:hidden dark:text-gray-400">
            {pageTitle}
          </h2>
        </div>

        {/* Right side: Search, Theme Switcher and User menu */}
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="hidden md:flex items-center relative">
            <Search className="absolute left-3 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
            <Input
              type="search"
              placeholder={tCommon('search') + '...'}
              className="w-64 pl-9 pr-4"
            />
          </div>

          {/* User Dropdown Menu */}
          <Dropdown>
            <DropdownButton>
              <div className="h-8 w-8 rounded-full bg-zinc-600 dark:bg-zinc-500 flex items-center justify-center text-white">
                <User className="h-4 w-4" />
              </div>
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownHeader>{tMenu('myAccount')}</DropdownHeader>
              <DropdownDivider />
              <DropdownItem href="/account">
                <User className="h-4 w-4" />
                <span>{tMenu('myProfile')}</span>
              </DropdownItem>
              <DropdownItem href="/settings">
                <Settings className="h-4 w-4" />
                <span>{tCommon('settings')}</span>
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem
                onClick={() => {
                  // TODO: Implement logout logic
                  console.log('Logout clicked');
                }}
              >
                <LogOut className="h-4 w-4" />
                <span>{tCommon('logout')}</span>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
