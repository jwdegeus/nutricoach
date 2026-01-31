'use client';

import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarBody,
  SidebarHeader,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
} from '@/components/catalyst/sidebar';
import { navItems } from '@/src/lib/nav';

export function CatalystSidebar() {
  const pathname = usePathname();

  const mainItems = navItems.filter((item) => !item.group);
  const secondaryItems = navItems.filter((item) => item.group === 'secondary');

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarSection>
          <SidebarItem href="/dashboard" current={pathname === '/dashboard'}>
            <SidebarLabel>NutriCoach</SidebarLabel>
          </SidebarItem>
        </SidebarSection>
      </SidebarHeader>

      <SidebarBody>
        <SidebarSection>
          {mainItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <SidebarItem key={item.href} href={item.href} current={isActive}>
                <Icon data-slot="icon" />
                <SidebarLabel>{item.label}</SidebarLabel>
              </SidebarItem>
            );
          })}
        </SidebarSection>

        {secondaryItems.length > 0 && (
          <SidebarSection>
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <SidebarItem
                  key={item.href}
                  href={item.href}
                  current={isActive}
                >
                  <Icon data-slot="icon" />
                  <SidebarLabel>{item.label}</SidebarLabel>
                </SidebarItem>
              );
            })}
          </SidebarSection>
        )}
      </SidebarBody>
    </Sidebar>
  );
}
