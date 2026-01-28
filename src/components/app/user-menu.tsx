'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import { User, Settings, LogOut } from 'lucide-react';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownDivider,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown';
import { AvatarButton } from '@/components/catalyst/avatar';
function updateInitials(
  user: { user_metadata?: Record<string, unknown>; email?: string },
  setInitials: (v: string | ((prev: string) => string)) => void,
) {
  const metadata = user.user_metadata || {};
  const fullName = (metadata.full_name as string) || '';
  const displayName = (metadata.display_name as string) || '';
  const email = user.email || '';

  // Generate initials
  if (fullName) {
    const names = fullName.split(' ').filter(Boolean);
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

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<{
    email?: string;
    user_metadata?: Record<string, unknown>;
  } | null>(null);
  const [initials, setInitials] = useState('U');

  useEffect(() => {
    const supabase = createClient();

    // Get initial user
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) {
        setUser(u);
        updateInitials(u, setInitials);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        updateInitials(session.user, setInitials);
      } else {
        setUser(null);
        setInitials('U');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const userEmail = user?.email || '';
  const userMetadata = user?.user_metadata || {};
  const displayNameRaw =
    userMetadata.display_name ?? userMetadata.full_name ?? userEmail;
  const displayName =
    typeof displayNameRaw === 'string'
      ? displayNameRaw
      : String(displayNameRaw ?? '');

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
