'use client';

import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '@/components/catalyst/dropdown';

export type FamilyMemberOption = { id: string; name: string };

type Props = {
  members: FamilyMemberOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
};

/**
 * Filter: Hele familie of per persoon.
 * Pass real members from listFamilyMembersAction.
 */
export function FamilyMemberFilter({
  members,
  value,
  onChange,
  className,
}: Props) {
  const t = useTranslations('family.dashboard');

  const displayLabel =
    value === 'all'
      ? t('allMembers')
      : (members.find((m) => m.id === value)?.name ?? t('allMembers'));

  return (
    <label className={`flex items-center gap-2 ${className ?? ''}`}>
      <span className="text-sm font-medium text-foreground">
        {t('filterByMember')}
      </span>
      <Dropdown>
        <DropdownButton
          as="button"
          aria-label={t('filterByMember')}
          className="inline-flex min-w-[180px] items-center justify-between gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground shadow-sm outline outline-1 -outline-offset-1 outline-white/10 hover:bg-muted/80 data-open:bg-muted/80 dark:outline-white/10"
        >
          {displayLabel}
          <ChevronDownIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </DropdownButton>
        <DropdownMenu anchor="bottom start" className="min-w-[180px]">
          <DropdownItem onClick={() => onChange('all')}>
            {t('allMembers')}
          </DropdownItem>
          {members.map((m) => (
            <DropdownItem key={m.id} onClick={() => onChange(m.id)}>
              {m.name}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
    </label>
  );
}
