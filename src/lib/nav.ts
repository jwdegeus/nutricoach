import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Calendar,
  Settings,
  FileText,
  ShoppingBasket,
  Activity,
} from 'lucide-react';

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
  translationKey?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Base nav items structure (without translations)
export const baseNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    translationKey: 'dashboard',
  },
  {
    label: 'Clients',
    href: '/clients',
    icon: Users,
    translationKey: 'clients',
  },
  {
    label: 'Meal Plans',
    href: '/meal-plans',
    icon: UtensilsCrossed,
    translationKey: 'mealPlans',
  },
  {
    label: 'Recepten',
    href: '/recipes',
    icon: UtensilsCrossed,
    translationKey: 'recipes',
  },
  {
    label: 'Pantry',
    href: '/pantry',
    icon: ShoppingBasket,
    translationKey: 'pantry',
  },
  {
    label: 'Runs',
    href: '/runs',
    icon: Activity,
    translationKey: 'runs',
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: Calendar,
    translationKey: 'calendar',
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileText,
    group: 'secondary',
    translationKey: 'reports',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    group: 'secondary',
    translationKey: 'settings',
  },
];

// For backward compatibility, export navItems (will be overridden by hook/function)
export const navItems: NavItem[] = baseNavItems;

export const navGroups: NavGroup[] = [
  {
    label: 'Main',
    items: navItems.filter((item) => !item.group),
  },
  {
    label: 'Other',
    items: navItems.filter((item) => item.group === 'secondary'),
  },
];

// Helper function to get translated nav items
export function getTranslatedNavItems(t: (key: string) => string): NavItem[] {
  return baseNavItems.map((item) => ({
    ...item,
    label: item.translationKey ? t(`nav.${item.translationKey}`) : item.label,
  }));
}

// Helper function to get page title from route
export function getPageTitle(
  pathname: string,
  t?: (key: string) => string,
): string {
  // Check exact matches first
  const item = baseNavItems.find((item) => item.href === pathname);
  if (item) {
    if (t && item.translationKey) {
      return t(`nav.${item.translationKey}`);
    }
    return item.label;
  }

  // Check for account and settings routes
  if (pathname === '/account' || pathname.startsWith('/account')) {
    return t ? t('account.title') : 'Mijn Account';
  }
  if (pathname === '/settings' || pathname.startsWith('/settings')) {
    return t ? t('nav.settings') : 'Instellingen';
  }

  return t ? t('nav.dashboard') : 'Dashboard';
}

// Helper function to get breadcrumbs from route
export function getBreadcrumbs(
  pathname: string,
  t?: (key: string) => string,
): Array<{ label: string; href: string }> {
  const homeLabel = t ? t('common.home') : 'Home';
  const breadcrumbs = [{ label: homeLabel, href: '/dashboard' }];

  if (pathname === '/dashboard') {
    return breadcrumbs;
  }

  const item = baseNavItems.find((item) => item.href === pathname);
  if (item) {
    const label =
      t && item.translationKey ? t(`nav.${item.translationKey}`) : item.label;
    breadcrumbs.push({ label, href: item.href });
  }

  return breadcrumbs;
}
