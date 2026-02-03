import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Sparkles,
  UtensilsCrossed,
  Calendar,
  Settings,
  FileText,
  ShoppingBasket,
  ShoppingCart,
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
    label: 'Generator',
    href: '/meal-plans',
    icon: Sparkles,
    translationKey: 'generator',
  },
  {
    label: 'Boodschappenlijst',
    href: '/meal-plans/shopping',
    icon: ShoppingCart,
    translationKey: 'shoppingList',
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
  // Meal plan shopping sub-route: /meal-plans/[planId]/shopping
  if (/^\/meal-plans\/[^/]+\/shopping$/.test(pathname)) {
    return t ? t('nav.shoppingList') : 'Boodschappenlijst';
  }

  return t ? t('nav.dashboard') : 'Dashboard';
}

// Admin sub-routes for breadcrumbs (path prefix -> label)
const ADMIN_BREADCRUMB_SEGMENTS: Array<{ path: string; label: string }> = [
  { path: '/admin/receptenbeheer', label: 'Receptenbeheer' },
  { path: '/admin/recipe-sources', label: 'Recept bronnen' },
  { path: '/admin/ingredients', label: 'Ingrediënten' },
  { path: '/admin/diet-types', label: 'Dieettypes' },
];

/** Optional query for tab-specific breadcrumbs (e.g. Receptenbeheer > Classificatie beheer). */
export type BreadcrumbOptions = { tab?: string };

// Helper function to get breadcrumbs from route
export function getBreadcrumbs(
  pathname: string,
  t?: (key: string) => string,
  options?: BreadcrumbOptions,
): Array<{ label: string; href: string }> {
  const homeLabel = t ? t('common.home') : 'Home';
  const breadcrumbs = [{ label: homeLabel, href: '/dashboard' }];

  if (pathname === '/dashboard') {
    return breadcrumbs;
  }

  // Admin routes: Home > Admin > [sub-route] [> tab]
  if (pathname.startsWith('/admin')) {
    breadcrumbs.push({ label: 'Admin', href: '/admin' });
    if (pathname === '/admin') return breadcrumbs;
    for (const { path, label } of ADMIN_BREADCRUMB_SEGMENTS) {
      if (pathname === path || pathname.startsWith(path + '/')) {
        breadcrumbs.push({ label, href: path });
        // Receptenbeheer tab: extra crumb voor Classificatie beheer
        if (path === '/admin/receptenbeheer' && options?.tab === 'keukens') {
          breadcrumbs.push({
            label: 'Classificatie beheer',
            href: '/admin/receptenbeheer?tab=keukens',
          });
        }
        break;
      }
    }
    return breadcrumbs;
  }

  // Recept detail: Home > Recepten > Recept (huidige pagina)
  if (pathname.startsWith('/recipes/') && pathname !== '/recipes') {
    const recipesLabel = t
      ? baseNavItems.find((i) => i.href === '/recipes')
        ? t('nav.recipes')
        : 'Recepten'
      : 'Recepten';
    breadcrumbs.push({ label: recipesLabel, href: '/recipes' });
    breadcrumbs.push({ label: 'Recept', href: pathname });
    return breadcrumbs;
  }

  // Meal plan detail / shopping: Home > Generator [> Boodschappenlijst]
  if (pathname.startsWith('/meal-plans/') && pathname !== '/meal-plans') {
    const generatorItem = baseNavItems.find((i) => i.href === '/meal-plans');
    const generatorLabel =
      t && generatorItem?.translationKey
        ? t(`nav.${generatorItem.translationKey}`)
        : 'Generator';
    breadcrumbs.push({ label: generatorLabel, href: '/meal-plans' });
    if (pathname.endsWith('/shopping')) {
      const shoppingItem = baseNavItems.find(
        (i) => i.href === '/meal-plans/shopping',
      );
      const shoppingLabel =
        t && shoppingItem?.translationKey
          ? t(`nav.${shoppingItem.translationKey}`)
          : 'Boodschappenlijst';
      breadcrumbs.push({ label: shoppingLabel, href: pathname });
    }
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
