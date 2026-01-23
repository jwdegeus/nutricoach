"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  TransitionChild,
} from "@headlessui/react";
import {
  Bars3Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { navItems } from "@/src/lib/nav";
import { HeadlessUserMenu } from "./headless-user-menu";
import { Settings } from "lucide-react";
import { cn } from "@/src/lib/utils";

export function HeadlessSidebar({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const mainItems = navItems.filter((item) => !item.group);
  const secondaryItems = navItems.filter((item) => item.group === "secondary");

  return (
    <>
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm transition-opacity duration-300 ease-linear data-closed:opacity-0"
        />

        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-closed:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute top-0 left-full flex w-16 justify-center pt-5 duration-300 ease-in-out data-closed:opacity-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="-m-2.5 p-2.5"
                >
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-gray-900 dark:text-white" />
                </button>
              </div>
            </TransitionChild>

            {/* Mobile Sidebar */}
            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white border-r border-gray-200 px-6 pb-4 dark:bg-gray-800/75 dark:border-gray-700">
              <div className="flex h-16 shrink-0 items-center">
                <Link href="/dashboard" className="text-xl font-bold text-gray-900 dark:text-white">
                  NutriCoach
                </Link>
              </div>
              <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  <li>
                    <ul role="list" className="-mx-2 space-y-1">
                      {mainItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "group flex gap-x-3 rounded-md p-2 text-sm font-medium transition-colors",
                                isActive
                                  ? "bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white"
                                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                              )}
                            >
                              <Icon
                                aria-hidden="true"
                                className="size-6 shrink-0"
                              />
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                  {secondaryItems.length > 0 && (
                    <li>
                      <div className="text-xs font-semibold text-gray-500 px-2 dark:text-gray-400">Overig</div>
                      <ul role="list" className="-mx-2 mt-2 space-y-1">
                        {secondaryItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = pathname === item.href;
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className={cn(
                                  "group flex gap-x-3 rounded-md p-2 text-sm font-medium transition-colors",
                                  isActive
                                    ? "bg-accent text-accent-foreground"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                              >
                                <Icon
                                  aria-hidden="true"
                                  className="size-6 shrink-0"
                                />
                                {item.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  )}
                  <li className="mt-auto">
                    <Link
                      href="/settings"
                      className="group -mx-2 flex gap-x-3 rounded-md p-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white transition-colors"
                    >
                      <Settings
                        aria-hidden="true"
                        className="size-6 shrink-0"
                      />
                      Instellingen
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4 dark:bg-gray-800/75 dark:border-gray-700">
          <div className="flex h-16 shrink-0 items-center">
            <Link href="/dashboard" className="text-xl font-bold text-foreground">
              NutriCoach
            </Link>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {mainItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "group flex gap-x-3 rounded-md p-2 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          <Icon
                            aria-hidden="true"
                            className="size-6 shrink-0"
                          />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
              {secondaryItems.length > 0 && (
                <li>
                  <div className="text-xs font-semibold text-gray-500 px-2 dark:text-gray-400">Overig</div>
                  <ul role="list" className="-mx-2 mt-2 space-y-1">
                    {secondaryItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={cn(
                              "group flex gap-x-3 rounded-md p-2 text-sm font-medium transition-colors",
                              isActive
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                          >
                            <Icon
                              aria-hidden="true"
                              className="size-6 shrink-0"
                            />
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              )}
              <li className="mt-auto">
                <Link
                  href="/settings"
                  className="group -mx-2 flex gap-x-3 rounded-md p-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Settings
                    aria-hidden="true"
                    className="size-6 shrink-0"
                  />
                  Instellingen
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <div className="lg:pl-72">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 sm:gap-x-6 sm:px-6 lg:px-8 dark:bg-gray-800/75 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
                  className="-m-2.5 p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white lg:hidden"
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon aria-hidden="true" className="size-6" />
          </button>

          {/* Separator */}
          <div aria-hidden="true" className="h-6 w-px bg-gray-200 lg:hidden dark:bg-gray-700" />

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <form action="#" method="GET" className="grid flex-1 grid-cols-1">
              <input
                name="search"
                placeholder="Zoeken"
                aria-label="Zoeken"
                className="col-start-1 row-start-1 block size-full rounded-md border border-gray-300 bg-white px-8 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:bg-gray-800/75 dark:text-white dark:placeholder:text-gray-400"
              />
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="pointer-events-none col-start-1 row-start-1 size-5 self-center ml-2 text-gray-500 dark:text-gray-400"
              />
            </form>
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* Separator */}
              <div aria-hidden="true" className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200 dark:lg:bg-gray-700" />

              {/* Profile dropdown */}
              <HeadlessUserMenu />
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="bg-white py-10 dark:bg-gray-900">
          <div className="px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </>
  );
}
