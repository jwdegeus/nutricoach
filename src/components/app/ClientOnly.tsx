'use client';

import { useEffect, useState } from 'react';

/**
 * Renders children only after the component has mounted on the client.
 * Use this to avoid hydration mismatches with components that generate
 * non-deterministic IDs (e.g. Headless UI's useId) between server and client.
 */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return fallback;
  return <>{children}</>;
}
