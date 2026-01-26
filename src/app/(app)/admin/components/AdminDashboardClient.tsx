"use client";

import { Link } from "@/components/catalyst/link";
import { Text } from "@/components/catalyst/text";
import {
  TagIcon,
  Squares2X2Icon,
  ArrowRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  UsersIcon,
  ChartBarIcon,
} from "@heroicons/react/20/solid";

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
};

type AdminDashboardClientProps = {
  stats: AdminStats;
};

export function AdminDashboardClient({ stats }: AdminDashboardClientProps) {
  const adminSections = [
    {
      name: "Recept Bronnen",
      description: "Beheer alle recept bronnen in het systeem. Wijzig, verwijder of voeg samen.",
      href: "/admin/recipe-sources",
      icon: TagIcon,
      iconBackground: "bg-blue-500",
      stats: [
        {
          label: "Totaal bronnen",
          value: stats.recipeSources.total,
        },
        {
          label: "Systeem bronnen",
          value: stats.recipeSources.system,
        },
        {
          label: "Gebruiker bronnen",
          value: stats.recipeSources.user,
        },
        {
          label: "Totaal gebruik",
          value: stats.recipeSources.totalUsage.toLocaleString(),
        },
      ],
    },
    {
      name: "Dieettypes",
      description: "Maak en beheer dieettypes die beschikbaar zijn in de onboarding en account pagina.",
      href: "/admin/diet-types",
      icon: Squares2X2Icon,
      iconBackground: "bg-green-500",
      stats: [
        {
          label: "Totaal dieettypes",
          value: stats.dietTypes.total,
        },
        {
          label: "Actief",
          value: stats.dietTypes.active,
          icon: CheckCircleIcon,
          iconColor: "text-green-600 dark:text-green-400",
        },
        {
          label: "Inactief",
          value: stats.dietTypes.inactive,
          icon: XCircleIcon,
          iconColor: "text-zinc-400",
        },
      ],
    },
  ];

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
          Admin Dashboard
        </h1>
        <p className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
          Beheer systeem instellingen en data
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-2">
        {adminSections.map((section) => (
          <Link
            key={section.name}
            href={section.href}
            className="group relative overflow-hidden rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 transition hover:ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10 dark:hover:ring-white/20"
          >
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
              <ArrowRightIcon className="h-5 w-5 text-zinc-400 transition group-hover:text-zinc-600 group-hover:translate-x-1 dark:text-zinc-500 dark:group-hover:text-zinc-300" />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-950/5 pt-4 dark:border-white/10">
              {section.stats.map((stat, index) => (
                <div key={index}>
                  <dt className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {stat.icon && (
                      <stat.icon className={`h-4 w-4 ${stat.iconColor || "text-zinc-400"}`} />
                    )}
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold text-zinc-950 dark:text-white">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Link>
        ))}
      </div>

      <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
            <ChartBarIcon className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
          </div>
          <div>
            <h3 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
              Systeem Overzicht
            </h3>
            <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Algemene statistieken en informatie
            </Text>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Totaal beheer items
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
              {stats.dietTypes.total + stats.recipeSources.total}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Actieve dieettypes
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
              {stats.dietTypes.active}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Totaal recept gebruik
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">
              {stats.recipeSources.totalUsage.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
