'use client';

import { useTranslations } from 'next-intl';
import { Select } from '@/components/catalyst/select';

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

  return (
    <label className={`flex items-center gap-2 ${className ?? ''}`}>
      <span className="text-sm font-medium text-foreground">
        {t('filterByMember')}
      </span>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        name="dashboard-member-filter"
        aria-label={t('filterByMember')}
        className="min-w-[180px]"
      >
        <option value="all">{t('allMembers')}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
