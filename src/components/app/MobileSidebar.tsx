"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useTranslatedNavItems } from "@/src/lib/nav-hooks";
import {
  Dialog,
  DialogTitle,
  DialogBody,
} from "@/components/catalyst/dialog";
import { Divider } from "@/components/catalyst/divider";
import { Button } from "@/components/catalyst/button";

// Separator is an alias for Divider
const Separator = Divider;

export function MobileSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const navItems = useTranslatedNavItems();

  const mainItems = navItems.filter((item) => !item.group);
  const secondaryItems = navItems.filter((item) => item.group === "secondary");

  return (
    <>
      <Button
        plain
        onClick={() => setOpen(true)}
        className="md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>NutriCoach</DialogTitle>
        <DialogBody className="p-0">

        <nav className="flex flex-col space-y-1 p-4">
          {/* Main Navigation */}
          <div className="space-y-1">
            {mainItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Separator */}
          {secondaryItems.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                {secondaryItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>
        </DialogBody>
      </Dialog>
    </>
  );
}
