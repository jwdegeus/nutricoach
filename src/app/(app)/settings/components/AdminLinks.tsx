'use client';

import { Button } from '@/components/catalyst/button';
import { Link } from '@/components/catalyst/link';
import { TagIcon, Squares2X2Icon } from '@heroicons/react/20/solid';

export function AdminLinks() {
  return (
    <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="mb-6">
        <h2 className="text-base/6 font-semibold text-zinc-950 sm:text-sm/6 dark:text-white">
          Admin Beheer
        </h2>
        <p className="mt-1 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
          Beheer systeem instellingen en data
        </p>
      </div>
      <div className="space-y-3">
        <Link href="/admin/recipe-sources">
          <Button outline className="w-full justify-start">
            <TagIcon className="h-4 w-4 mr-2" />
            Recept Bronnen Beheer
          </Button>
        </Link>
        <Link href="/admin/diet-types">
          <Button outline className="w-full justify-start">
            <Squares2X2Icon className="h-4 w-4 mr-2" />
            Dieettypes Beheer
          </Button>
        </Link>
      </div>
    </div>
  );
}
