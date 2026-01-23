"use client";

import { usePathname } from "next/navigation";
import { Navbar, NavbarItem, NavbarLabel, NavbarSection } from "@/components/catalyst/navbar";
import { getPageTitle } from "@/src/lib/nav";
import { User, Settings, LogOut } from "lucide-react";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownDivider,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { AvatarButton } from "@/components/catalyst/avatar";
import { UserMenu } from "./user-menu";

export function CatalystNavbar() {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);

  return (
    <Navbar>
      <NavbarSection>
        <NavbarItem>
          <NavbarLabel>{pageTitle}</NavbarLabel>
        </NavbarItem>
      </NavbarSection>

      <NavbarSection className="ml-auto">
        <UserMenu />
      </NavbarSection>
    </Navbar>
  );
}
