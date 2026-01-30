'use client';

import React from 'react';
import { Link } from '@/components/catalyst/link';
import { HomeIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import clsx from 'clsx';

export type BreadcrumbItem = {
  label: string;
  href: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  /** Optionally hide the home icon and show label for the first item. Default: true (show home icon for first item). */
  homeIcon?: boolean;
  className?: string;
  /** Optionele extra class voor het laatste item (huidige pagina), bijv. lichter grijs. */
  currentPageClassName?: string;
};

/**
 * Breadcrumb navigation: Home icon + trail with chevron separators.
 * Last item is rendered as current page (aria-current="page").
 */
export function Breadcrumbs({
  items,
  homeIcon = true,
  className,
  currentPageClassName,
}: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={clsx('flex', className)}>
      <ol role="list" className="flex items-center space-x-4">
        {items.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === items.length - 1;

          return (
            <li key={item.href + index}>
              <div className="flex items-center">
                {index > 0 && (
                  <ChevronRightIcon
                    className="size-5 shrink-0 text-zinc-500 dark:text-zinc-400"
                    aria-hidden
                  />
                )}
                {isFirst && homeIcon ? (
                  <Link
                    href={item.href}
                    className={clsx(
                      index > 0 && 'ml-4',
                      'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors',
                    )}
                  >
                    <HomeIcon className="size-5 shrink-0" aria-hidden />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                ) : isLast ? (
                  <span
                    aria-current="page"
                    className={clsx(
                      index > 0 && 'ml-4',
                      'text-sm font-medium text-zinc-700 dark:text-zinc-200',
                      currentPageClassName,
                    )}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className={clsx(
                      index > 0 && 'ml-4',
                      'text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors',
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
