'use client';

import { usePathname } from 'next/navigation';
import {
  Navbar,
  NavbarItem,
  NavbarLabel,
  NavbarSection,
} from '@/components/catalyst/navbar';
import { getPageTitle } from '@/src/lib/nav';
import { UserMenu } from './user-menu';

export function CatalystNavbar() {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <Navbar>
      <NavbarSection>
        <NavbarItem>
          <NavbarLabel>{pageTitle}</NavbarLabel>
        </NavbarItem>
      </NavbarSection>

      <NavbarSection className="ml-auto">
        <UserMenu />
      </NavbarSection>
    </Navbar>
  );
}
