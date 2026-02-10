'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Subheading } from '@/components/catalyst/heading';
import { Select } from '@/components/catalyst/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/catalyst/table';

// ——— Static mock data ———

type MockFamilyMember = { id: string; name: string; isSelf: boolean };

const MOCK_MEMBERS: MockFamilyMember[] = [
  { id: '1', name: 'Ik', isSelf: true },
  { id: '2', name: 'Partner', isSelf: false },
  { id: '3', name: 'Kind 1', isSelf: false },
  { id: '4', name: 'Kind 2', isSelf: false },
];

type MockNutrientRow = {
  name: string;
  unit: string;
  value: string;
  target?: string;
};

function mockMacros(memberId: string): MockNutrientRow[] {
  const base = memberId === '1' ? 100 : memberId === '2' ? 95 : 85;
  return [
    { name: 'Eiwit', unit: 'g', value: `${base}`, target: '90' },
    { name: 'Koolhydraten', unit: 'g', value: `${base + 20}`, target: '200' },
    { name: 'Vet', unit: 'g', value: `${base - 10}`, target: '70' },
    {
      name: 'Vezels',
      unit: 'g',
      value: `${Math.floor(base / 4)}`,
      target: '30',
    },
    {
      name: 'Calorieën',
      unit: 'kcal',
      value: `${(base * 4 + (base + 20) * 4 + (base - 10) * 9).toFixed(0)}`,
      target: '2000',
    },
  ];
}

function mockMicros(memberId: string): MockNutrientRow[] {
  const pct = memberId === '1' ? 98 : memberId === '2' ? 102 : 88;
  return [
    { name: 'Vitamine A', unit: 'µg', value: `${pct}%`, target: '900' },
    { name: 'Vitamine C', unit: 'mg', value: `${pct - 5}%`, target: '90' },
    { name: 'Vitamine D', unit: 'µg', value: `${pct + 2}%`, target: '20' },
    { name: 'Vitamine E', unit: 'mg', value: `${pct}%`, target: '15' },
    { name: 'Vitamine B12', unit: 'µg', value: `${pct + 5}%`, target: '2.4' },
  ];
}

function mockSupplementen(memberId: string): MockNutrientRow[] {
  return [
    {
      name: 'Omega-3 (EPA/DHA)',
      unit: 'mg',
      value: memberId === '1' ? '1200' : memberId === '2' ? '1000' : '—',
      target: '1000',
    },
    {
      name: 'Vitamine D3',
      unit: 'IE',
      value: memberId === '1' ? '2000' : '1000',
      target: '2000',
    },
    {
      name: 'Magnesium',
      unit: 'mg',
      value: memberId === '1' ? '400' : '300',
      target: '400',
    },
    { name: 'Multivitamine', unit: '—', value: '1×', target: '1×' },
  ];
}

function mockMineralen(memberId: string): MockNutrientRow[] {
  const pct = memberId === '1' ? 105 : memberId === '2' ? 98 : 92;
  return [
    { name: 'Calcium', unit: 'mg', value: `${pct}%`, target: '1000' },
    { name: 'IJzer', unit: 'mg', value: `${pct - 3}%`, target: '8' },
    { name: 'Magnesium', unit: 'mg', value: `${pct + 2}%`, target: '400' },
    { name: 'Zink', unit: 'mg', value: `${pct}%`, target: '11' },
    { name: 'Kalium', unit: 'mg', value: `${pct + 1}%`, target: '2600' },
  ];
}

function mockSpoorelementen(memberId: string): MockNutrientRow[] {
  return [
    {
      name: 'Selenium',
      unit: 'µg',
      value: memberId === '1' ? '65' : '55',
      target: '55',
    },
    {
      name: 'Jodium',
      unit: 'µg',
      value: memberId === '1' ? '150' : '120',
      target: '150',
    },
    { name: 'Koper', unit: 'mg', value: '1.0', target: '0.9' },
    { name: 'Mangaan', unit: 'mg', value: '2.2', target: '2.3' },
    { name: 'Chroom', unit: 'µg', value: '35', target: '35' },
  ];
}

// Mock % for summary (macro/micro/supp/mineral) — one per member for "all" we average
function mockSummaryPct(
  memberId: string,
  type: 'macro' | 'micro' | 'supp' | 'mineral',
): number {
  const base =
    memberId === '1' ? 92 : memberId === '2' ? 88 : memberId === '3' ? 85 : 82;
  const offset =
    type === 'macro' ? 0 : type === 'micro' ? 2 : type === 'supp' ? -3 : 1;
  return Math.min(100, Math.max(0, base + offset));
}

function NutrientTable({ rows }: { rows: MockNutrientRow[] }) {
  const t = useTranslations('family.dashboard');
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>{t('nutrient')}</TableHeader>
          <TableHeader>{t('value')}</TableHeader>
          <TableHeader>{t('target')}</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.name}>
            <TableCell>
              <span className="font-medium text-foreground">{row.name}</span>
              {row.unit !== '—' && (
                <span className="ml-1 text-muted-foreground">({row.unit})</span>
              )}
            </TableCell>
            <TableCell className="text-foreground">{row.value}</TableCell>
            <TableCell className="text-muted-foreground">
              {row.target ?? '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Donut-style percentage ring (conic-gradient)
function PercentRing({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-16">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(
              var(--color-primary-500) 0%,
              var(--color-primary-500) ${pct}%,
              var(--color-zinc-200) ${pct}%,
              var(--color-zinc-200) 100%
            )`,
          }}
          aria-hidden
        />
        <div
          className="absolute inset-[20%] rounded-full bg-background"
          aria-hidden
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {pct}%
          </span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

type Props = {
  variant: 'summary' | 'detail';
  selectedMemberId?: string;
  onMemberChange?: (id: string) => void;
};

export function FamilieIntakeOverviewClient({
  variant,
  selectedMemberId: controlledMemberId,
  onMemberChange,
}: Props) {
  const t = useTranslations('family.dashboard');
  const [internalMemberId, setInternalMemberId] = useState<string>('all');

  const selectedMemberId = controlledMemberId ?? internalMemberId;
  const setSelectedMemberId = onMemberChange ?? setInternalMemberId;

  const membersToShow =
    selectedMemberId === 'all'
      ? MOCK_MEMBERS
      : MOCK_MEMBERS.filter((m) => m.id === selectedMemberId);

  if (variant === 'summary') {
    const memberIds =
      selectedMemberId === 'all'
        ? MOCK_MEMBERS.map((m) => m.id)
        : [selectedMemberId];
    const avg = (arr: number[]) =>
      Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    const macroPct = avg(memberIds.map((id) => mockSummaryPct(id, 'macro')));
    const microPct = avg(memberIds.map((id) => mockSummaryPct(id, 'micro')));
    const suppPct = avg(memberIds.map((id) => mockSummaryPct(id, 'supp')));
    const mineralPct = avg(
      memberIds.map((id) => mockSummaryPct(id, 'mineral')),
    );

    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t('title')}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('description')}
            </p>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {t('filterByMember')}
            </span>
            <Select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="min-w-[160px]"
              name="member"
              aria-label={t('filterByMember')}
            >
              <option value="all">{t('allMembers')}</option>
              {MOCK_MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <PercentRing value={macroPct} label={t('macros')} />
          <PercentRing value={microPct} label={t('micros')} />
          <PercentRing value={suppPct} label={t('supplements')} />
          <PercentRing value={mineralPct} label={t('minerals')} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Subheading level={2} className="text-foreground">
            {t('title')}
          </Subheading>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {t('filterByMember')}
          </span>
          <Select
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
            className="min-w-[180px]"
            name="member"
            aria-label={t('filterByMember')}
          >
            <option value="all">{t('allMembers')}</option>
            {MOCK_MEMBERS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {membersToShow.map((member) => (
        <section
          key={member.id}
          className="rounded-xl bg-muted/20 p-4 sm:p-5"
          aria-labelledby={`intake-section-${member.id}`}
        >
          <h3
            id={`intake-section-${member.id}`}
            className="mb-4 text-lg font-semibold text-foreground"
          >
            {t('intakeFor')} {member.name}
          </h3>

          <div className="space-y-6">
            <div>
              <Subheading level={3} className="mb-2 text-foreground">
                {t('macros')}
              </Subheading>
              <NutrientTable rows={mockMacros(member.id)} />
            </div>
            <div>
              <Subheading level={3} className="mb-2 text-foreground">
                {t('micros')}
              </Subheading>
              <NutrientTable rows={mockMicros(member.id)} />
            </div>
            <div>
              <Subheading level={3} className="mb-2 text-foreground">
                {t('supplements')}
              </Subheading>
              <NutrientTable rows={mockSupplementen(member.id)} />
            </div>
            <div>
              <Subheading level={3} className="mb-2 text-foreground">
                {t('minerals')}
              </Subheading>
              <NutrientTable rows={mockMineralen(member.id)} />
            </div>
            <div>
              <Subheading level={3} className="mb-2 text-foreground">
                {t('traceElements')}
              </Subheading>
              <NutrientTable rows={mockSpoorelementen(member.id)} />
            </div>
          </div>
        </section>
      ))}

      <p className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {t('staticNotice')}
      </p>
    </div>
  );
}
