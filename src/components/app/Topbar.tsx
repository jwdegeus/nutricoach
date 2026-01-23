"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, User, Settings, LogOut, ChevronRight } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { getPageTitle, getBreadcrumbs } from "@/src/lib/nav";
import { Input } from "@/components/ui/input";
import { MobileSidebar } from "@/src/components/app/MobileSidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const breadcrumbs = getBreadcrumbs(pathname);

  return (
    <header className="flex h-16 items-center border-b border-gray-200 bg-white px-4 md:px-6 dark:bg-gray-800/75 dark:border-gray-700">
      <div className="flex flex-1 items-center justify-between gap-4">
        {/* Left side: Mobile sidebar trigger, breadcrumbs, and page title */}
        <div className="flex flex-1 items-center gap-4 min-w-0">
          {/* Mobile Sidebar Trigger */}
          <div className="md:hidden">
            <MobileSidebar />
          </div>
          
          {/* Breadcrumbs */}
          <nav className="hidden md:flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.href} className="flex items-center gap-2">
                {index > 0 && <ChevronRight className="h-4 w-4" />}
                <Link
                  href={crumb.href}
                  className={cn(
                    "hover:text-gray-900 dark:hover:text-white transition-colors",
                    index === breadcrumbs.length - 1 && "text-gray-900 dark:text-white font-medium"
                  )}
                >
                  {crumb.label}
                </Link>
              </div>
            ))}
          </nav>
          
          {/* Page title (mobile) */}
          <h2 className="text-sm font-medium text-gray-500 md:hidden dark:text-gray-400">
            {pageTitle}
          </h2>
        </div>

        {/* Right side: Search, Theme Switcher and User menu */}
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="hidden md:flex items-center relative">
            <Search className="absolute left-3 h-4 w-4 text-gray-500 dark:text-gray-400 pointer-events-none" />
            <Input
              type="search"
              placeholder="Search..."
              className="w-64 pl-9 pr-4"
            />
          </div>

          {/* User Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="User menu"
              >
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                  <User className="h-4 w-4" />
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="flex items-center gap-2 cursor-pointer">
                  <User className="h-4 w-4" />
                  <span>Profile</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer"
                onClick={() => {
                  // TODO: Implement logout logic
                  console.log("Logout clicked");
                }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
