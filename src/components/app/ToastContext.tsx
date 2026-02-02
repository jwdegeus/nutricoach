'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { ExclamationTriangleIcon } from '@heroicons/react/20/solid';

export type ToastType = 'success' | 'error';

export type ToastMessage = {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
};

type ToastContextValue = {
  showToast: (options: {
    type: ToastType;
    title: string;
    description?: string;
  }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5000;

/**
 * Global notification toasts. Uses Tailwind UI Notifications "Simple" block styling
 * and app theme (same card style as Catalyst / rest of app).
 * @see https://tailwindcss.com/plus/ui-blocks/application-ui/overlays/notifications
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (options: { type: ToastType; title: string; description?: string }) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, ...options }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_DURATION_MS);
    },
    [],
  );

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Tailwind UI Notifications — Simple: same theme as app (white/zinc card, icon indicates type) */}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6"
      >
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-zinc-950/10 transition duration-300 ease-out dark:bg-zinc-900 dark:ring-white/10 sm:translate-x-0"
            >
              <div className="p-4">
                <div className="flex items-start">
                  <div className="shrink-0">
                    {toast.type === 'success' ? (
                      <CheckCircleIcon
                        className="size-6 text-emerald-600 dark:text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <ExclamationTriangleIcon
                        className="size-6 text-red-600 dark:text-red-400"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="ml-3 w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-zinc-950 dark:text-white">
                      {toast.title}
                    </p>
                    {toast.description && (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {toast.description}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex shrink-0">
                    <button
                      type="button"
                      onClick={() => dismiss(toast.id)}
                      className="inline-flex rounded-md text-zinc-500 hover:text-zinc-700 focus:outline-2 focus:outline-offset-2 focus:outline-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-300 dark:focus:outline-zinc-400"
                    >
                      <span className="sr-only">Sluiten</span>
                      <XMarkIcon className="size-5" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (_: {
        type: ToastType;
        title: string;
        description?: string;
      }) => {},
    };
  }
  return ctx;
}
