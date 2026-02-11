import clsx from 'clsx';
import type React from 'react';

/**
 * Canonical Card primitive — semantic tokens, consistent radius/shadow/padding.
 * Use for content surfaces in dashboards, lists, modals.
 *
 * - Surface: bg-card, text-card-foreground
 * - Edge: outline (no border, per AGENTS 4.0)
 * - Radius: rounded-lg (app-wide baseline)
 * - Shadow: shadow-sm
 * - Padding: CardBody p-6; CardHeader px-6 pt-6; CardFooter px-6 pb-6
 */
export function Card({
  className,
  as: Component = 'div',
  ...props
}: {
  className?: string;
  as?: React.ElementType;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<'div'>, 'as'>) {
  return (
    <Component
      {...props}
      className={clsx(
        className,
        // Surface
        'bg-card text-card-foreground',
        // Radius + shadow (consistent baseline)
        'rounded-lg shadow-sm',
        // Light outline for contrast (per AGENTS 4.0, no heavy borders)
        'outline outline-1 -outline-offset-1 outline-border/50',
        // Flex for header/body/footer layout
        'flex flex-col',
      )}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'px-6 pt-6 pb-4')} />;
}

export function CardBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'flex-1 px-6 py-6')} />;
}

export function CardFooter({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'px-6 pt-4 pb-6')} />;
}
