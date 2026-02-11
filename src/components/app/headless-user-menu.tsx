'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/src/lib/supabase/client';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

function updateUserInfo(
  user: { user_metadata?: Record<string, unknown>; email?: string },
  setInitials: (v: string | ((prev: string) => string)) => void,
  setDisplayName: (v: string) => void,
) {
  const metadata = user.user_metadata || {};
  const fullName = (metadata.full_name as string) || '';
  const displayNameValue = (metadata.display_name as string) || '';
  const email = user.email || '';

  // Generate initials
  if (fullName) {
    const names = fullName.split(' ').filter(Boolean);
    if (names.length >= 2) {
      setInitials((names[0][0] + names[names.length - 1][0]).toUpperCase());
    } else {
      setInitials(fullName.substring(0, 2).toUpperCase());
    }
  } else if (displayNameValue) {
    setInitials(displayNameValue.substring(0, 2).toUpperCase());
  } else if (email) {
    setInitials(email.substring(0, 2).toUpperCase());
  }

  setDisplayName(displayNameValue || fullName || email);
}

export function HeadlessUserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [initials, setInitials] = useState('U');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const supabase = createClient();

    // Get initial user
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (u) {
        setUser(u);
        updateUserInfo(u, setInitials, setDisplayName);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        updateUserInfo(session.user, setInitials, setDisplayName);
      } else {
        setUser(null);
        setInitials('U');
        setDisplayName('');
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

  const _userEmail = user?.email || '';

  return (
    <Menu as="div" className="relative">
      <MenuButton className="relative flex items-center">
        <span className="absolute -inset-1.5" />
        <span className="sr-only">Open user menu</span>
        <div className="bg-primary flex size-8 items-center justify-center rounded-full text-sm font-medium text-primary-foreground">
          {initials}
        </div>
        <span className="hidden lg:flex lg:items-center">
          <span
            aria-hidden="true"
            className="ml-4 text-sm font-semibold text-foreground"
          >
            {displayName}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className="ml-2 size-5 text-muted-foreground"
          />
        </span>
      </MenuButton>
      <MenuItems
        transition
        className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md border border-border bg-popover py-2 shadow-md transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
      >
        <MenuItem>
          <Link
            href="/account"
            className="block px-3 py-1 text-sm text-popover-foreground data-focus:bg-accent data-focus:text-accent-foreground data-focus:outline-hidden"
          >
            Mijn Account
          </Link>
        </MenuItem>
        <MenuItem>
          <Link
            href="/settings"
            className="block px-3 py-1 text-sm text-popover-foreground data-focus:bg-accent data-focus:text-accent-foreground data-focus:outline-hidden"
          >
            Instellingen
          </Link>
        </MenuItem>
        <MenuItem>
          <button
            onClick={handleLogout}
            className="block w-full px-3 py-1 text-left text-sm text-popover-foreground data-focus:bg-accent data-focus:text-accent-foreground data-focus:outline-hidden"
          >
            Uitloggen
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
