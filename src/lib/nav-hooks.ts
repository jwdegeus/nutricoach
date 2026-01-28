'use client';

import { useTranslations } from 'next-intl';
import { baseNavItems, type NavItem } from './nav';

/**
 * Hook to get translated navigation items
 * Use this in client components
 */
export function useTranslatedNavItems(): NavItem[] {
  const t = useTranslations('nav');

  return baseNavItems.map((item) => ({
    ...item,
    label: item.translationKey ? t(item.translationKey) : item.label,
  }));
}
