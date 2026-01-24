'use client'

import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@/components/catalyst/navbar'
import {
  Sidebar,
  SidebarBody,
  SidebarFooter,
  SidebarHeader,
  SidebarHeading,
  SidebarItem,
  SidebarLabel,
  SidebarSection,
  SidebarSpacer,
} from '@/components/catalyst/sidebar'
import { SidebarLayout } from '@/components/catalyst/sidebar-layout'
import { Avatar } from '@/components/catalyst/avatar'
import { Link } from '@/components/catalyst/link'
import { useTranslatedNavItems } from '@/src/lib/nav-hooks'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/client'
import { useEffect, useState } from 'react'
import {
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Cog8ToothIcon,
  LightBulbIcon,
  PlusIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/16/solid'
import {
  MagnifyingGlassIcon,
  InboxIcon,
} from '@heroicons/react/20/solid'
import { ThemeSwitcher } from './theme-switcher'
import { ShoppingCart } from './ShoppingCart'
import { PlanEditStatusIndicator } from './PlanEditStatusIndicator'
import { NotificationsIndicator } from './NotificationsIndicator'
import { useTranslations } from 'next-intl'

function AccountDropdownMenu({
  anchor,
  onLogout,
}: {
  anchor: 'top start' | 'bottom end'
  onLogout: () => void
}) {
  const t = useTranslations('menu')
  
  return (
    <DropdownMenu className="min-w-64" anchor={anchor}>
      <DropdownItem href="/account">
        <UserIcon />
        <DropdownLabel>{t('myProfile')}</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="/settings">
        <Cog8ToothIcon />
        <DropdownLabel>{t('settings')}</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem href="/privacy-policy">
        <ShieldCheckIcon />
        <DropdownLabel>{t('privacyPolicy')}</DropdownLabel>
      </DropdownItem>
      <DropdownItem href="/share-feedback">
        <LightBulbIcon />
        <DropdownLabel>{t('shareFeedback')}</DropdownLabel>
      </DropdownItem>
      <DropdownDivider />
      <DropdownItem onClick={onLogout}>
        <ArrowRightStartOnRectangleIcon />
        <DropdownLabel>{t('logout')}</DropdownLabel>
      </DropdownItem>
    </DropdownMenu>
  )
}

export function ApplicationLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations('common')
  const tNav = useTranslations('nav')
  const tMenu = useTranslations('menu')
  const [initials, setInitials] = useState('U')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    function updateUserInfo(user: any) {
      const metadata = user.user_metadata || {}
      const fullName = metadata.full_name || ''
      const displayNameValue = metadata.display_name || ''
      const userEmail = user.email || ''

      if (fullName) {
        const names = fullName.split(' ').filter(Boolean)
        if (names.length >= 2) {
          setInitials((names[0][0] + names[names.length - 1][0]).toUpperCase())
        } else {
          setInitials(fullName.substring(0, 2).toUpperCase())
        }
      } else if (displayNameValue) {
        setInitials(displayNameValue.substring(0, 2).toUpperCase())
      } else if (userEmail) {
        setInitials(userEmail.substring(0, 2).toUpperCase())
      }

      setDisplayName(displayNameValue || fullName || userEmail)
      setEmail(userEmail)
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        updateUserInfo(user)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        updateUserInfo(session.user)
      } else {
        setInitials('U')
        setDisplayName('')
        setEmail('')
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItems = useTranslatedNavItems()
  const mainItems = navItems.filter((item) => !item.group)
  const secondaryItems = navItems.filter((item) => item.group === 'secondary')

  return (
    <SidebarLayout
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <NavbarItem href="/search" aria-label={t('search')}>
              <MagnifyingGlassIcon />
            </NavbarItem>
            <ShoppingCart />
            <PlanEditStatusIndicator />
            <NotificationsIndicator />
            <NavbarItem href="/inbox" aria-label={t('inbox')}>
              <InboxIcon />
            </NavbarItem>
            <ThemeSwitcher variant="navbar" />
            {mounted && (
              <Dropdown>
                <DropdownButton as={NavbarItem}>
                  <Avatar initials={initials} square />
                </DropdownButton>
                <AccountDropdownMenu anchor="bottom end" onLogout={handleLogout} />
              </Dropdown>
            )}
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <Dropdown>
              <DropdownButton as={SidebarItem} className="lg:mb-2.5">
                <Avatar initials="NC" />
                <SidebarLabel>NutriCoach</SidebarLabel>
                <ChevronDownIcon />
              </DropdownButton>
              <DropdownMenu className="min-w-80 lg:min-w-64" anchor="bottom start">
                <DropdownItem href="/settings">
                  <Cog8ToothIcon />
                  <DropdownLabel>{t('settings')}</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/dashboard">
                  <Avatar data-slot="icon" initials="NC" />
                  <DropdownLabel>NutriCoach</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem href="/teams/create">
                  <PlusIcon />
                  <DropdownLabel>{tMenu('newTeam')}</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
            <SidebarSection className="max-lg:hidden">
              <SidebarItem href="/search">
                <MagnifyingGlassIcon />
                <SidebarLabel>{t('search')}</SidebarLabel>
              </SidebarItem>
              <SidebarItem href="/inbox">
                <InboxIcon />
                <SidebarLabel>{t('inbox')}</SidebarLabel>
              </SidebarItem>
            </SidebarSection>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              {mainItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <SidebarItem key={item.href} href={item.href} current={isActive}>
                    <span data-slot="icon">
                      <Icon className="size-6 sm:size-5" />
                    </span>
                    <SidebarLabel>{item.label}</SidebarLabel>
                  </SidebarItem>
                )
              })}
            </SidebarSection>

            {secondaryItems.length > 0 && (
              <SidebarSection>
                <SidebarHeading>{tNav('other')}</SidebarHeading>
                {secondaryItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <SidebarItem key={item.href} href={item.href} current={isActive}>
                      <span data-slot="icon">
                        <Icon className="size-6 sm:size-5" />
                      </span>
                      <SidebarLabel>{item.label}</SidebarLabel>
                    </SidebarItem>
                  )
                })}
              </SidebarSection>
            )}

            <SidebarSpacer />
          </SidebarBody>

          <SidebarFooter className="max-lg:hidden">
            {mounted && (
              <Dropdown>
                <DropdownButton as={SidebarItem}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar initials={initials} className="size-10" square alt="" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                        {displayName}
                      </span>
                      <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                        {email}
                      </span>
                    </span>
                  </span>
                  <ChevronUpIcon />
                </DropdownButton>
                <AccountDropdownMenu anchor="top start" onLogout={handleLogout} />
              </Dropdown>
            )}
          </SidebarFooter>
        </Sidebar>
      }
    >
      {children}
    </SidebarLayout>
  )
}
