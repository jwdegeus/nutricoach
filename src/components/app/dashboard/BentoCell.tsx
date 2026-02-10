'use client';

import type { ReactNode } from 'react';

/**
 * Bento cell — matches Tailwind UI bento pattern (no borders):
 * 1. Wrapper: relative, grid placement only.
 * 2. Background plane: absolute inset-px + round + bg (1px of section bg shows around card).
 * 3. Content: relative, same rounding, overflow-hidden.
 * 4. Decorative layer: pointer-events-none, outline outline-white/15 for soft edge.
 */
type BentoCellProps = {
  children: ReactNode;
  /** Grid placement: e.g. "lg:row-span-2", "lg:col-start-2 lg:row-start-2" */
  placement?: string;
  /** Rounding for bg, content and outline: e.g. "rounded-lg", "lg:rounded-l-4xl" */
  round?: string;
  /** Background for the card plane. Default bg-muted (gray-800 in dark). */
  bg?: string;
  className?: string;
};

export function BentoCell({
  children,
  placement = '',
  round = 'rounded-lg',
  bg = 'bg-muted',
  className = '',
}: BentoCellProps) {
  return (
    <div className={`relative ${placement} ${className}`}>
      {/* Layer 2: card plane — inset-px so 1px of page background shows around card */}
      <div className={`absolute inset-px ${round} ${bg}`} aria-hidden />
      {/* Layer 3: content */}
      <div
        className={`relative flex h-full min-h-0 flex-col overflow-hidden ${round}`}
      >
        {children}
      </div>
      {/* Layer 4: soft edge in dark mode (subtle outline, no border) */}
      <div
        className={`pointer-events-none absolute inset-px ${round} shadow-sm dark:outline dark:outline-white/15`}
        aria-hidden
      />
    </div>
  );
}
