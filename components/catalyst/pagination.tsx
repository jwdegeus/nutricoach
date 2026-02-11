import clsx from 'clsx';
import type React from 'react';
import { Button } from './button';

export function Pagination({
  'aria-label': ariaLabel = 'Page navigation',
  className,
  ...props
}: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav
      aria-label={ariaLabel}
      {...props}
      className={clsx(
        className,
        'flex items-center justify-between border-t border-zinc-200 px-4 sm:px-0 dark:border-white/10',
      )}
    />
  );
}

// Native button styles for prev/next (avoids Headless Button so clicks always work)
const plainNavButtonClass = clsx(
  'relative inline-flex items-center justify-center gap-x-2 rounded-lg border border-transparent text-base/6 font-semibold',
  'text-zinc-950 dark:text-white',
  'px-[calc(theme(spacing.3.5)-1px)] py-[calc(theme(spacing.2.5)-1px)] sm:py-[calc(theme(spacing.1.5)-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:text-sm/6',
  'focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-zinc-950',
  'hover:bg-zinc-950/5 active:bg-zinc-950/5 dark:hover:bg-white/10 dark:active:bg-white/10',
  'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  'cursor-pointer',
);

const ChevronLeftIcon = () => (
  <svg
    className="size-5 shrink-0 stroke-current sm:size-4"
    data-slot="icon"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M2.75 8H13.25M2.75 8L5.25 5.5M2.75 8L5.25 10.5"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    className="size-5 shrink-0 stroke-current sm:size-4"
    data-slot="icon"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M13.25 8L2.75 8M13.25 8L10.75 10.5M13.25 8L10.75 5.5"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function PaginationPrevious({
  href = null,
  disabled: disabledProp,
  className,
  children = 'Previous',
  onClick,
}: React.PropsWithChildren<{
  href?: string | null;
  /** When using onClick-based pagination, set to true on first page so Previous is disabled. */
  disabled?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}>) {
  const isLink = typeof href === 'string' && href.length > 0;
  const disabled = disabledProp ?? href === null;

  return (
    <span className={clsx(className, '-mt-px flex w-0 flex-1')}>
      {isLink ? (
        <Button href={href} plain aria-label="Previous page">
          <ChevronLeftIcon />
          {children}
        </Button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          aria-label="Previous page"
          className={plainNavButtonClass}
        >
          <ChevronLeftIcon />
          {children}
        </button>
      )}
    </span>
  );
}

export function PaginationNext({
  href = null,
  disabled: disabledProp,
  className,
  children = 'Next',
  onClick,
}: React.PropsWithChildren<{
  href?: string | null;
  /** When using onClick-based pagination, set to true on last page so Next is disabled. */
  disabled?: boolean;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}>) {
  const isLink = typeof href === 'string' && href.length > 0;
  const disabled = disabledProp ?? href === null;

  return (
    <span className={clsx(className, '-mt-px flex w-0 flex-1 justify-end')}>
      {isLink ? (
        <Button href={href} plain aria-label="Next page">
          {children}
          <ChevronRightIcon />
        </Button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          aria-label="Next page"
          className={plainNavButtonClass}
        >
          {children}
          <ChevronRightIcon />
        </button>
      )}
    </span>
  );
}

export function PaginationList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      {...props}
      className={clsx(
        className,
        '-mt-px hidden items-baseline gap-x-2 md:flex',
      )}
    />
  );
}

export function PaginationPage({
  href,
  className,
  current = false,
  children,
  onClick,
}: React.PropsWithChildren<{
  href?: string;
  className?: string;
  current?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}>) {
  const isLink = typeof href === 'string' && href.length > 0;
  return (
    <Button
      {...(isLink ? { href } : { type: 'button' })}
      {...(onClick ? { onClick } : {})}
      plain
      aria-label={`Page ${children}`}
      aria-current={current ? 'page' : undefined}
      className={clsx(
        className,
        'min-w-9 before:absolute before:-inset-px before:rounded-lg',
        current && 'before:bg-zinc-950/5 dark:before:bg-white/10',
      )}
    >
      <span className="-mx-0.5">{children}</span>
    </Button>
  );
}

export function PaginationGap({
  className,
  children = <>&hellip;</>,
  ...props
}: React.ComponentPropsWithoutRef<'span'>) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={clsx(
        className,
        'w-9 text-center text-sm/6 font-semibold text-zinc-950 select-none dark:text-white',
      )}
    >
      {children}
    </span>
  );
}
