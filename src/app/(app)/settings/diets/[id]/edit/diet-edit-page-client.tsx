"use client";

import { useEffect, useState } from "react";
import { DietEditPage } from "./diet-edit-page";
import type { DietTypeOutput } from "../../../actions/diet-admin.actions";

/**
 * Client-only wrapper for DietEditPage to prevent hydration mismatches
 * Headless UI generates random IDs that differ between server and client.
 * This component ensures the page only renders on the client side after hydration.
 */
export function DietEditPageClient({ dietType }: { dietType: DietTypeOutput }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR and initial render, return a simple loading state
  // This prevents hydration mismatches
  if (!mounted) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-96 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse mt-2" />
        </div>
        <div className="space-y-4">
          <div className="h-10 w-full bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-24 w-full bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return <DietEditPage dietType={dietType} />;
}
