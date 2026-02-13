'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/components/catalyst/link';
import { Text } from '@/components/catalyst/text';
import type { ComponentType, SVGProps } from 'react';
import {
  TagIcon,
  Squares2X2Icon,
  ArrowRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChartBarIcon,
  BeakerIcon,
  Cog6ToothIcon,
  ClipboardDocumentListIcon,
  ShoppingBagIcon,
  BuildingStorefrontIcon,
  SparklesIcon,
} from '@heroicons/react/20/solid';

type StatItem = {
  label: string;
  value: number | string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  iconColor?: string;
  /** Als gezet: deze stat is een link (bijv. naar gefilterd overzicht) */
  href?: string;
};

type AdminStats = {
  dietTypes: {
    total: number;
    active: number;
    inactive: number;
  };
  recipeSources: {
    total: number;
    system: number;
    user: number;
    totalUsage: number;
  };
  ingredients: {
    nevo: number;
    custom: number;
    fndds: number;
    withoutCategory: number;
  };
  generator: {
    templatesTotal: number;
    templatesActive: number;
    poolItems: number;
  };
  therapeuticProtocols: {
    total: number;
    active: number;
    inactive: number;
  };
  productSources: {
    total: number;
    enabled: number;
  };
  stores: {
    total: number;
  };
  magicianOverrides: number;
};

type AdminDashboardClientProps = {
  stats: AdminStats;
};

export function AdminDashboardClient({ stats }: AdminDashboardClientProps) {
  const t = useTranslations('admin');
  const tProtocols = useTranslations('admin.therapeuticProtocols');
  const adminSections: Array<{
    name: string;
    description: string;
    href: string;
    icon: typeof TagIcon;
    iconBackground: string;
    stats: StatItem[];
  }> = [
    {
      name: 'Receptenbeheer',
      description:
        'Beheer recept bronnen, categorieën, tags en keukens (Indiaas, Japans, etc.).',
      href: '/admin/receptenbeheer',
      icon: TagIcon,
      iconBackground: 'bg-blue-500',
      stats: [
        {
          label: 'Totaal bronnen',
          value: stats.recipeSources.total,
        },
        {
          label: 'Systeem bronnen',
          value: stats.recipeSources.system,
        },
        {
          label: 'Gebruiker bronnen',
          value: stats.recipeSources.user,
        },
        {
          label: 'Totaal gebruik',
          value: stats.recipeSources.totalUsage.toLocaleString('nl-NL'),
        },
      ],
    },
    {
      name: 'Productbronnen voorraad',
      description:
        'Beheer bronnen voor productlookup (barcode/zoeken) in de voorraad: Open Food Facts, Albert Heijn.',
      href: '/admin/product-sources',
      icon: ShoppingBagIcon,
      iconBackground: 'bg-sky-500',
      stats: [
        { label: 'Bronnen', value: stats.productSources.total },
        {
          label: 'Actief',
          value: stats.productSources.enabled,
          icon: CheckCircleIcon,
          iconColor: 'text-green-600 dark:text-green-400',
        },
      ],
    },
    {
      name: 'Winkels & Assortiment',
      description:
        'Beheer winkels (sitemap, sync) en start catalog sync. Zoek later winkelproducten in voorraad.',
      href: '/admin/stores',
      icon: BuildingStorefrontIcon,
      iconBackground: 'bg-amber-500',
      stats: [{ label: 'Winkels', value: stats.stores.total }],
    },
    {
      name: 'AI Magician overrides',
      description:
        'False-positive uitsluitingen: zoete aardappel, bloemkool, pasta-as-spread. Beheer welke ingrediëntpatronen een dieet-violation negeren.',
      href: '/admin/ai-magician',
      icon: SparklesIcon,
      iconBackground: 'bg-fuchsia-500',
      stats: [
        { label: 'Actieve uitsluitingen', value: stats.magicianOverrides },
      ],
    },
    {
      name: 'Dieettypes',
      description:
        'Maak en beheer dieettypes die beschikbaar zijn in de onboarding en account pagina.',
      href: '/admin/diet-types',
      icon: Squares2X2Icon,
      iconBackground: 'bg-green-500',
      stats: [
        {
          label: 'Totaal dieettypes',
          value: stats.dietTypes.total,
        },
        {
          label: 'Actief',
          value: stats.dietTypes.active,
          icon: CheckCircleIcon,
          iconColor: 'text-green-600 dark:text-green-400',
        },
        {
          label: 'Inactief',
          value: stats.dietTypes.inactive,
          icon: XCircleIcon,
          iconColor: 'text-zinc-400',
        },
      ],
    },
    {
      name: 'Ingrediënten',
      description:
        'Beheer ingrediënten uit alle bronnen: NEVO, FNDDS en eigen ingrediënten. Bekijk voedingswaarden en koppel categorieën.',
      href: '/admin/ingredients',
      icon: BeakerIcon,
      iconBackground: 'bg-amber-500',
      stats: [
        {
          label: 'NEVO',
          value: stats.ingredients.nevo.toLocaleString('nl-NL'),
        },
        {
          label: 'FNDDS',
          value: stats.ingredients.fndds.toLocaleString('nl-NL'),
        },
        {
          label: 'Eigen ingrediënten',
          value: stats.ingredients.custom,
        },
        {
          label: 'Zonder categorie',
          value: stats.ingredients.withoutCategory,
          href: '/admin/ingredients?filter=noCategory',
        },
      ],
    },
    {
      name: 'Generator beheer',
      description:
        'Beheer templates, slots, pools en instellingen voor de weekmenu-generator. Genereer een preview zonder plan op te slaan.',
      href: '/admin/generator-config',
      icon: Cog6ToothIcon,
      iconBackground: 'bg-emerald-500',
      stats: [
        { label: 'Templates totaal', value: stats.generator.templatesTotal },
        {
          label: 'Templates actief',
          value: stats.generator.templatesActive,
          icon: CheckCircleIcon,
          iconColor: 'text-green-600 dark:text-green-400',
        },
        { label: 'Pool items', value: stats.generator.poolItems },
      ],
    },
    {
      name: 'Generator v2 (diagnostiek)',
      description:
        'Database-eerst modus: gedetailleerde redenen per slot in het Generator-inzicht panel. Bepaal wanneer de generator zelf maaltijden maakt.',
      href: '/admin/generator-v2',
      icon: ChartBarIcon,
      iconBackground: 'bg-teal-500',
      stats: [],
    },
    {
      name: tProtocols('name'),
      description: tProtocols('description'),
      href: '/admin/therapeutic-protocols',
      icon: ClipboardDocumentListIcon,
      iconBackground: 'bg-violet-500',
      stats: [
        {
          label: tProtocols('totalProtocols'),
          value: stats.therapeuticProtocols.total,
        },
        {
          label: tProtocols('active'),
          value: stats.therapeuticProtocols.active,
          icon: CheckCircleIcon,
          iconColor: 'text-green-600 dark:text-green-400',
        },
        {
          label: tProtocols('inactive'),
          value: stats.therapeuticProtocols.inactive,
          icon: XCircleIcon,
          iconColor: 'text-zinc-400',
        },
      ],
    },
  ];

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          {t('dashboardTitle')}
        </h1>
        <p className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
          {t('dashboardDescription')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        {adminSections.map((section) => (
          <div
            key={section.name}
            className="group relative overflow-hidden rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 transition hover:ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10 dark:hover:ring-white/20"
          >
            <Link href={section.href} className="block">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${section.iconBackground} text-white`}
                    >
                      <section.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
                        {section.name}
                      </h3>
                    </div>
                  </div>
                  <Text className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
                    {section.description}
                  </Text>
                </div>
                <ArrowRightIcon className="h-5 w-5 text-zinc-400 transition group-hover:translate-x-1 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300" />
              </div>
            </Link>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-950/5 pt-4 dark:border-white/10">
              {section.stats.map((stat, index) => {
                const content = (
                  <>
                    <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {stat.icon && (
                        <stat.icon
                          className={`h-4 w-4 ${stat.iconColor ?? 'text-zinc-400'}`}
                        />
                      )}
                      {stat.label}
                    </dt>
                    <dd className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
                      {stat.value}
                    </dd>
                  </>
                );
                if (stat.href) {
                  return (
                    <Link
                      key={index}
                      href={stat.href}
                      className="-m-1 rounded-md p-1 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                    >
                      {content}
                    </Link>
                  );
                }
                return <div key={index}>{content}</div>;
              })}
            </dl>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <ChartBarIcon className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h3 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
              {t('systemOverviewTitle')}
            </h3>
            <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {t('systemOverviewDescription')}
            </Text>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t('totalManageItems')}
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
              {stats.dietTypes.total + stats.recipeSources.total}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t('activeDietTypes')}
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
              {stats.dietTypes.active}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {t('totalRecipeUsage')}
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
              {stats.recipeSources.totalUsage.toLocaleString('nl-NL')}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
