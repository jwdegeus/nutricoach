'use client'

import { useEffect, useState } from 'react'
import { ApplicationLayout } from './ApplicationLayout'

/**
 * Client-only wrapper for ApplicationLayout to prevent hydration mismatches
 * Headless UI generates random IDs that differ between server and client.
 * This component ensures the layout only renders on the client side after hydration.
 */
export function ClientOnlyApplicationLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // During SSR and initial render, return a simple structure without Headless UI
  // This prevents hydration mismatches while maintaining the layout structure
  if (!mounted) {
    return (
      <div className="relative isolate flex min-h-svh w-full bg-white max-lg:flex-col lg:bg-stone-50 dark:bg-stone-950 dark:lg:bg-stone-900">
        {/* Sidebar placeholder */}
        <div className="fixed inset-y-0 left-0 w-64 max-lg:hidden">
          <nav className="flex h-full min-h-0 flex-col">
            <div className="flex h-16 shrink-0 items-center px-6">
              <div className="h-8 w-8 rounded-lg bg-primary-600 dark:bg-primary-400" />
            </div>
          </nav>
        </div>
        {/* Content */}
        <main className="flex flex-1 flex-col pb-2 lg:min-w-0 lg:pt-2 lg:pr-2 lg:pl-64">
          <header className="hidden lg:block px-4 pt-2.5">
            <div className="flex h-16 items-center justify-end gap-4">
              <div className="h-8 w-8 rounded bg-stone-300 dark:bg-stone-700" />
            </div>
          </header>
          <div className="grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-stone-950/5 dark:lg:bg-stone-900 dark:lg:ring-white/10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </div>
        </main>
      </div>
    )
  }

  return <ApplicationLayout>{children}</ApplicationLayout>
}
