'use client';

import {
  MoonIcon,
  SunIcon,
  ComputerDesktopIcon,
  CheckIcon,
} from '@heroicons/react/20/solid';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown';
import { NavbarItem } from '@/components/catalyst/navbar';
import { Button } from '@/components/catalyst/button';
import type { ComponentPropsWithoutRef } from 'react';

type ThemeSwitcherProps = {
  /**
   * Whether to render as a NavbarItem (default) or as a standalone Button
   */
  variant?: 'navbar' | 'button';
  /**
   * Additional className for the button
   */
  className?: string;
} & ComponentPropsWithoutRef<typeof DropdownButton>;

export function ThemeSwitcher({
  variant = 'navbar',
  className,
  ...props
}: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getIcon = () => {
    if (!mounted) return <SunIcon data-slot="icon" />;
    if (theme === 'dark') return <MoonIcon data-slot="icon" />;
    if (theme === 'light') return <SunIcon data-slot="icon" />;
    return <ComputerDesktopIcon data-slot="icon" />;
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  };

  // Always render the same structure to avoid hydration mismatches
  return (
    <Dropdown>
      {variant === 'navbar' ? (
        <DropdownButton
          as={NavbarItem}
          aria-label="Thema wijzigen"
          className={className}
          {...props}
        >
          {getIcon()}
        </DropdownButton>
      ) : (
        <DropdownButton
          as={Button}
          aria-label="Thema wijzigen"
          className={className}
          {...props}
        >
          {getIcon()}
        </DropdownButton>
      )}
      {mounted && (
        <DropdownMenu anchor="bottom end">
          <DropdownItem onClick={() => handleThemeChange('light')}>
            <SunIcon data-slot="icon" />
            <DropdownLabel>Licht</DropdownLabel>
            {theme === 'light' && (
              <CheckIcon
                className="col-start-5 row-start-1 size-4 text-zinc-500 dark:text-zinc-400"
                data-slot="icon"
              />
            )}
          </DropdownItem>
          <DropdownItem onClick={() => handleThemeChange('dark')}>
            <MoonIcon data-slot="icon" />
            <DropdownLabel>Donker</DropdownLabel>
            {theme === 'dark' && (
              <CheckIcon
                className="col-start-5 row-start-1 size-4 text-zinc-500 dark:text-zinc-400"
                data-slot="icon"
              />
            )}
          </DropdownItem>
          <DropdownItem onClick={() => handleThemeChange('system')}>
            <ComputerDesktopIcon data-slot="icon" />
            <DropdownLabel>Systeem</DropdownLabel>
            {theme === 'system' && (
              <CheckIcon
                className="col-start-5 row-start-1 size-4 text-zinc-500 dark:text-zinc-400"
                data-slot="icon"
              />
            )}
          </DropdownItem>
        </DropdownMenu>
      )}
    </Dropdown>
  );
}
