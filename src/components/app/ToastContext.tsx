'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircleIcon, XMarkIcon } from '@heroicons/react/20/solid';

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
      {/* Global notification live region */}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6"
      >
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto w-full max-w-sm translate-y-0 transform rounded-lg bg-zinc-800 opacity-100 shadow-lg outline-1 -outline-offset-1 outline-white/10 transition duration-300 ease-out sm:translate-x-0"
            >
              <div className="p-4">
                <div className="flex items-start">
                  <div className="shrink-0">
                    {toast.type === 'success' ? (
                      <CheckCircleIcon
                        className="size-6 text-green-400"
                        aria-hidden
                      />
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        className="size-6 text-red-400"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="ml-3 w-0 flex-1 pt-0.5">
                    <p className="text-sm font-medium text-white">
                      {toast.title}
                    </p>
                    {toast.description && (
                      <p className="mt-1 text-sm text-zinc-400">
                        {toast.description}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex shrink-0">
                    <button
                      type="button"
                      onClick={() => dismiss(toast.id)}
                      className="inline-flex rounded-md text-zinc-400 hover:text-white focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
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
