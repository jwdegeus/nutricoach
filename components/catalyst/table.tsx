'use client';

import clsx from 'clsx';
import type React from 'react';
import { createContext, useContext, useState } from 'react';
import { Link } from './link';

const TableContext = createContext<{
  bleed: boolean;
  dense: boolean;
  grid: boolean;
  striped: boolean;
  outlined: boolean;
}>({
  bleed: false,
  dense: false,
  grid: false,
  striped: false,
  outlined: false,
});

export function Table({
  bleed = false,
  dense = false,
  grid = false,
  striped = false,
  outlined = false,
  className,
  children,
  ...props
}: {
  bleed?: boolean;
  dense?: boolean;
  grid?: boolean;
  striped?: boolean;
  /** When true, wrap table in bg-card + outline (use when table is standalone; omit when inside modal/card) */
  outlined?: boolean;
} & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <TableContext.Provider
      value={
        { bleed, dense, grid, striped, outlined } as React.ContextType<
          typeof TableContext
        >
      }
    >
      <div
        className={clsx(
          'flow-root',
          outlined &&
            'rounded-lg bg-card shadow-sm outline outline-1 -outline-offset-1 outline-border/50',
        )}
      >
        <div
          {...props}
          className={clsx(
            className,
            '-mx-(--gutter) overflow-x-auto whitespace-nowrap',
          )}
        >
          <div
            className={clsx(
              'inline-block min-w-full align-middle',
              !bleed && 'sm:px-(--gutter)',
            )}
          >
            <table className="min-w-full text-left text-sm/6 text-foreground">
              {children}
            </table>
          </div>
        </div>
      </div>
    </TableContext.Provider>
  );
}

export function TableHead({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'thead'>) {
  return (
    <thead {...props} className={clsx(className, 'text-muted-foreground')} />
  );
}

export function TableBody(props: React.ComponentPropsWithoutRef<'tbody'>) {
  return <tbody {...props} />;
}

const TableRowContext = createContext<{
  href?: string;
  target?: string;
  title?: string;
}>({
  href: undefined,
  target: undefined,
  title: undefined,
});

export function TableRow({
  href,
  target,
  title,
  className,
  ...props
}: {
  href?: string;
  target?: string;
  title?: string;
} & React.ComponentPropsWithoutRef<'tr'>) {
  const { striped } = useContext(TableContext);

  return (
    <TableRowContext.Provider
      value={
        { href, target, title } as React.ContextType<typeof TableRowContext>
      }
    >
      <tr
        {...props}
        className={clsx(
          className,
          href &&
            'has-[[data-row-link][data-focus]]:outline-2 has-[[data-row-link][data-focus]]:-outline-offset-2 has-[[data-row-link][data-focus]]:outline-ring',
          striped && 'even:bg-muted/20',
          href && striped && 'hover:bg-muted/30',
          href && !striped && 'hover:bg-muted/30',
        )}
      />
    </TableRowContext.Provider>
  );
}

export function TableHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'th'>) {
  const { bleed, dense, grid } = useContext(TableContext);

  return (
    <th
      {...props}
      className={clsx(
        className,
        'border-b border-border px-4 font-medium first:pl-(--gutter,--spacing(2)) last:pr-(--gutter,--spacing(2))',
        dense ? 'py-2.5' : 'py-3',
        grid && 'border-l border-border/50 first:border-l-0',
        !bleed && 'sm:first:pl-1 sm:last:pr-1',
      )}
    />
  );
}

export function TableCell({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'td'>) {
  const { bleed, dense, grid, striped } = useContext(TableContext);
  const { href, target, title } = useContext(TableRowContext);
  const [cellRef, setCellRef] = useState<HTMLElement | null>(null);

  return (
    <td
      ref={href ? setCellRef : undefined}
      {...props}
      className={clsx(
        className,
        'relative px-4 first:pl-(--gutter,--spacing(2)) last:pr-(--gutter,--spacing(2))',
        !striped && 'border-b border-border/50',
        grid && 'border-l border-border/50 first:border-l-0',
        dense ? 'py-2.5' : 'py-3',
        !bleed && 'sm:first:pl-1 sm:last:pr-1',
      )}
    >
      {href && (
        <Link
          data-row-link
          href={href}
          target={target}
          aria-label={title}
          tabIndex={cellRef?.previousElementSibling === null ? 0 : -1}
          className="absolute inset-0 focus:outline-hidden"
        />
      )}
      {children}
    </td>
  );
}
