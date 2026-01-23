"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
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
export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [initials, setInitials] = useState("U");

  useEffect(() => {
    const supabase = createClient();
    
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
        updateInitials(user);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        updateInitials(session.user);
      } else {
        setUser(null);
        setInitials("U");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  function updateInitials(user: any) {
    const metadata = user.user_metadata || {};
    const fullName = metadata.full_name || "";
    const displayName = metadata.display_name || "";
    const email = user.email || "";
    
    // Generate initials
    if (fullName) {
      const names = fullName.split(" ").filter(Boolean);
      if (names.length >= 2) {
        setInitials((names[0][0] + names[names.length - 1][0]).toUpperCase());
      } else {
        setInitials(fullName.substring(0, 2).toUpperCase());
      }
    } else if (displayName) {
      setInitials(displayName.substring(0, 2).toUpperCase());
    } else if (email) {
      setInitials(email.substring(0, 2).toUpperCase());
    }
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const userEmail = user?.email || "";
  const userMetadata = user?.user_metadata || {};
  const displayName = userMetadata.display_name || userMetadata.full_name || userEmail;

  return (
    <Dropdown>
      <DropdownButton as={AvatarButton} initials={initials} alt="User menu" />
      <DropdownMenu>
        <DropdownLabel>
          {displayName}
          {userEmail && (
            <span className="block text-xs text-muted-foreground">
              {userEmail}
            </span>
          )}
        </DropdownLabel>
        <DropdownDivider />
        <DropdownItem href="/account">
          <User data-slot="icon" />
          Mijn Account
        </DropdownItem>
        <DropdownItem href="/settings">
          <Settings data-slot="icon" />
          Instellingen
        </DropdownItem>
        <DropdownDivider />
        <DropdownItem onClick={handleLogout}>
          <LogOut data-slot="icon" />
          Uitloggen
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
