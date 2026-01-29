'use client';

import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/**
 * Returns true on the client after hydration, false during SSR/initial render.
 * Use to avoid hydration mismatches (e.g. theme, layout that uses browser-only APIs).
 * No setState in effect – uses useSyncExternalStore so no react-hooks/set-state-in-effect.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
