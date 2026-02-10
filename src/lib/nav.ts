import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Sparkles,
  UtensilsCrossed,
  Calendar,
  Settings,
  FileText,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Users,
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
    label: 'Supermarkten',
    href: '/grocery-stores',
    icon: Store,
    translationKey: 'groceryStores',
  },
  {
    label: 'Calendar',
    href: '/calendar',
    icon: Calendar,
    translationKey: 'calendar',
  },
  {
    label: 'Familie',
    href: '/familie',
    icon: Users,
    translationKey: 'family',
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
  if (pathname === '/runs' || pathname.startsWith('/runs')) {
    return t ? t('nav.runs') : 'Runs';
  }
  if (pathname === '/familie' || pathname.startsWith('/familie')) {
    return t ? t('nav.family') : 'Familie';
  }
  if (pathname === '/pantry/settings') {
    return t ? t('pantry.settingsTitle') : 'Pantry instellingen';
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
  { path: '/admin/product-sources', label: 'Productbronnen voorraad' },
  { path: '/admin/ingredients', label: 'Ingrediënten' },
  { path: '/admin/diet-types', label: 'Dieettypes' },
  { path: '/admin/therapeutic-protocols', label: 'Therapeutische protocollen' },
];

/** Optional query for tab-specific breadcrumbs (e.g. Receptenbeheer > Classificatie beheer). */
export type BreadcrumbOptions = { tab?: string; accountLabel?: string };

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
        // Therapeutische protocollen: Protocol > Supplement toevoegen / Supplement bewerken
        if (
          path === '/admin/therapeutic-protocols' &&
          pathname.startsWith(path + '/')
        ) {
          const segments = pathname
            .slice(path.length + 1)
            .split('/')
            .filter(Boolean);
          if (segments.length >= 1) {
            breadcrumbs.push({
              label: 'Protocol',
              href: `${path}/${segments[0]}`,
            });
            if (segments[1] === 'supplements' && segments[2] === 'new') {
              breadcrumbs.push({
                label: 'Supplement toevoegen',
                href: pathname,
              });
            } else if (
              segments[1] === 'supplements' &&
              segments[3] === 'edit'
            ) {
              breadcrumbs.push({
                label: 'Supplement bewerken',
                href: pathname,
              });
            }
          }
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

  const accountLabel =
    options?.accountLabel ?? (t ? t('account.title') : 'Mijn Account');

  // Account section: Mijn Account / weergavenaam, Runs, Instellingen
  if (pathname === '/account' || pathname.startsWith('/account')) {
    breadcrumbs.push({
      label: accountLabel,
      href: '/account',
    });
    return breadcrumbs;
  }
  if (pathname === '/runs' || pathname.startsWith('/runs')) {
    breadcrumbs.push({
      label: accountLabel,
      href: '/account',
    });
    breadcrumbs.push({
      label: t ? t('nav.runs') : 'Runs',
      href: '/runs',
    });
    return breadcrumbs;
  }
  if (pathname === '/settings' || pathname.startsWith('/settings')) {
    breadcrumbs.push({
      label: accountLabel,
      href: '/account',
    });
    breadcrumbs.push({
      label: t ? t('nav.settings') : 'Instellingen',
      href: '/settings',
    });
    return breadcrumbs;
  }
  if (pathname === '/familie' || pathname.startsWith('/familie')) {
    breadcrumbs.push({
      label: accountLabel,
      href: '/account',
    });
    breadcrumbs.push({
      label: t ? t('nav.family') : 'Familie',
      href: '/familie',
    });
    if (pathname !== '/familie') {
      breadcrumbs.push({ label: 'Lid', href: pathname });
    }
    return breadcrumbs;
  }
  if (
    pathname.startsWith('/grocery-stores/') &&
    pathname !== '/grocery-stores'
  ) {
    const groceryItem = baseNavItems.find((i) => i.href === '/grocery-stores');
    const groceryLabel =
      t && groceryItem?.translationKey
        ? t(`nav.${groceryItem.translationKey}`)
        : 'Supermarkten';
    breadcrumbs.push({ label: groceryLabel, href: '/grocery-stores' });
    breadcrumbs.push({
      label: pathname.split('/').pop() ?? 'Winkel',
      href: pathname,
    });
    return breadcrumbs;
  }
  if (pathname === '/pantry/settings') {
    const pantryItem = baseNavItems.find((i) => i.href === '/pantry');
    const pantryLabel =
      t && pantryItem?.translationKey
        ? t(`nav.${pantryItem.translationKey}`)
        : 'Voorraad';
    breadcrumbs.push({ label: pantryLabel, href: '/pantry' });
    breadcrumbs.push({
      label: t ? t('pantry.settingsTitle') : 'Pantry instellingen',
      href: '/pantry/settings',
    });
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
