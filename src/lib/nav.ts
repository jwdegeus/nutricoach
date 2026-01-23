import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Calendar,
  Settings,
  FileText,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Clients",
    href: "/clients",
    icon: Users,
  },
  {
    label: "Meal Plans",
    href: "/meal-plans",
    icon: UtensilsCrossed,
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: Calendar,
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileText,
    group: "secondary",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    group: "secondary",
  },
];

export const navGroups: NavGroup[] = [
  {
    label: "Main",
    items: navItems.filter((item) => !item.group),
  },
  {
    label: "Other",
    items: navItems.filter((item) => item.group === "secondary"),
  },
];

// Helper function to get page title from route
export function getPageTitle(pathname: string): string {
  // Check exact matches first
  const item = navItems.find((item) => item.href === pathname);
  if (item) return item.label;

  // Check for account and settings routes
  if (pathname === "/account" || pathname.startsWith("/account")) {
    return "Mijn Account";
  }
  if (pathname === "/settings" || pathname.startsWith("/settings")) {
    return "Instellingen";
  }

  return "Dashboard";
}

// Helper function to get breadcrumbs from route
export function getBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  const breadcrumbs = [{ label: "Home", href: "/dashboard" }];
  
  if (pathname === "/dashboard") {
    return breadcrumbs;
  }
  
  const item = navItems.find((item) => item.href === pathname);
  if (item) {
    breadcrumbs.push({ label: item.label, href: item.href });
  }
  
  return breadcrumbs;
}
