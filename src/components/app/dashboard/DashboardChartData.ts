/**
 * Mock time-series data for dashboard charts.
 * Replace with real intake queries when logging is implemented.
 */

export type FamilyMember = { id: string; name: string; is_self: boolean };

export type CaloriesDay = {
  date: string;
  proteinKcal: number;
  carbsKcal: number;
  fatKcal: number;
  alcoholKcal: number;
};

export type VitaminDay = {
  date: string;
  vitamineA: number;
  vitamineC: number;
  vitamineD: number;
  vitamineE: number;
  vitamineB12: number;
};

export type MineralDay = {
  date: string;
  calcium: number;
  ijzer: number;
  magnesium: number;
  zink: number;
  kalium: number;
};

export type SupplementDay = {
  date: string;
  omega3: number;
  vitamineD3: number;
  magnesium: number;
  multivitamine: number;
};

function lastNDays(n: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Base multiplier per member index (0=first, 1=second, …) for mock variance */
function memberBase(memberIndex: number): number {
  const bases = [100, 95, 85, 80];
  return bases[Math.min(memberIndex, bases.length - 1)] ?? 80;
}

/** Generate calories data for one member over last 14 days */
export function mockCaloriesData(
  memberIndex: number,
  days = 14,
): CaloriesDay[] {
  const base = memberBase(memberIndex);
  const dates = lastNDays(days);
  return dates.map((date, i) => {
    const dayVar = 0.85 + (i % 5) * 0.05;
    const protein = Math.round(base * 0.28 * dayVar * 4);
    const carbs = Math.round(base * 0.45 * dayVar * 4);
    const fat = Math.round(base * 0.27 * dayVar * 9);
    const alcohol = i % 4 === 2 ? Math.round(50 * dayVar) : 0;
    return {
      date,
      proteinKcal: protein,
      carbsKcal: carbs,
      fatKcal: fat,
      alcoholKcal: alcohol,
    };
  });
}

/** Generate vitamins (% of target) for one member */
export function mockVitaminData(memberIndex: number, days = 14): VitaminDay[] {
  const base = memberBase(memberIndex);
  const pctBase = base * 0.92;
  const dates = lastNDays(days);
  return dates.map((date, i) => {
    const v = 0.9 + (i % 7) * 0.02;
    return {
      date,
      vitamineA: Math.round(pctBase * v),
      vitamineC: Math.round((pctBase - 5) * v),
      vitamineD: Math.round((pctBase + 2) * v),
      vitamineE: Math.round(pctBase * v),
      vitamineB12: Math.round((pctBase + 5) * v),
    };
  });
}

/** Generate minerals (% of target) for one member */
export function mockMineralData(memberIndex: number, days = 14): MineralDay[] {
  const base = memberBase(memberIndex);
  const pctBase = base * 0.95;
  const dates = lastNDays(days);
  return dates.map((date, i) => {
    const v = 0.92 + (i % 5) * 0.02;
    return {
      date,
      calcium: Math.round(pctBase * v),
      ijzer: Math.round((pctBase - 3) * v),
      magnesium: Math.round((pctBase + 2) * v),
      zink: Math.round(pctBase * v),
      kalium: Math.round((pctBase + 1) * v),
    };
  });
}

/** Generate supplements (0–1 compliance) for one member */
export function mockSupplementData(
  memberIndex: number,
  days = 14,
): SupplementDay[] {
  const dates = lastNDays(days);
  const omegaCompliance = memberIndex === 0 ? 1 : memberIndex === 1 ? 0.9 : 0.5;
  const d3Compliance = 1;
  const mgCompliance = memberIndex === 0 ? 1 : 0.75;
  const multiCompliance = 1;
  return dates.map((date, i) => ({
    date,
    omega3: i % 7 === 0 ? 0 : omegaCompliance,
    vitamineD3: d3Compliance,
    magnesium: mgCompliance,
    multivitamine: multiCompliance,
  }));
}

/** Get member index for single member; returns -1 for "all" (use aggregate) */
export function getMemberIndex(
  memberId: string,
  members: FamilyMember[],
): number {
  if (memberId === 'all') return -1;
  const idx = members.findIndex((m) => m.id === memberId);
  return idx >= 0 ? idx : 0;
}

/** Average calories across members for "all" view */
export function aggregateCaloriesData(
  members: FamilyMember[],
  days = 14,
): CaloriesDay[] {
  if (members.length === 0) return mockCaloriesData(0, days);
  const byMember = members.map((_, i) => mockCaloriesData(i, days));
  const dates = lastNDays(days);
  return dates.map((date, di) => {
    let p = 0;
    let c = 0;
    let f = 0;
    let a = 0;
    byMember.forEach((arr) => {
      const row = arr[di];
      if (row) {
        p += row.proteinKcal;
        c += row.carbsKcal;
        f += row.fatKcal;
        a += row.alcoholKcal;
      }
    });
    const n = byMember.length;
    return {
      date,
      proteinKcal: Math.round(p / n),
      carbsKcal: Math.round(c / n),
      fatKcal: Math.round(f / n),
      alcoholKcal: Math.round(a / n),
    };
  });
}

/** Average vitamins across members */
export function aggregateVitaminData(
  members: FamilyMember[],
  days = 14,
): VitaminDay[] {
  if (members.length === 0) return mockVitaminData(0, days);
  const byMember = members.map((_, i) => mockVitaminData(i, days));
  const dates = lastNDays(days);
  const keys: (keyof Omit<VitaminDay, 'date'>)[] = [
    'vitamineA',
    'vitamineC',
    'vitamineD',
    'vitamineE',
    'vitamineB12',
  ];
  return dates.map((date, di) => {
    const out: VitaminDay = {
      date,
      vitamineA: 0,
      vitamineC: 0,
      vitamineD: 0,
      vitamineE: 0,
      vitamineB12: 0,
    };
    keys.forEach((k) => {
      let sum = 0;
      byMember.forEach((arr) => {
        const row = arr[di];
        if (row?.[k] != null) sum += row[k];
      });
      out[k] = Math.round(sum / byMember.length);
    });
    return out;
  });
}

/** Average minerals across members */
export function aggregateMineralData(
  members: FamilyMember[],
  days = 14,
): MineralDay[] {
  if (members.length === 0) return mockMineralData(0, days);
  const byMember = members.map((_, i) => mockMineralData(i, days));
  const dates = lastNDays(days);
  const keys: (keyof Omit<MineralDay, 'date'>)[] = [
    'calcium',
    'ijzer',
    'magnesium',
    'zink',
    'kalium',
  ];
  return dates.map((date, di) => {
    const out: MineralDay = {
      date,
      calcium: 0,
      ijzer: 0,
      magnesium: 0,
      zink: 0,
      kalium: 0,
    };
    keys.forEach((k) => {
      let sum = 0;
      byMember.forEach((arr) => {
        const row = arr[di];
        if (row?.[k] != null) sum += row[k];
      });
      out[k] = Math.round(sum / byMember.length);
    });
    return out;
  });
}

/** Average supplements across members */
export function aggregateSupplementData(
  members: FamilyMember[],
  days = 14,
): SupplementDay[] {
  if (members.length === 0) return mockSupplementData(0, days);
  const byMember = members.map((_, i) => mockSupplementData(i, days));
  const dates = lastNDays(days);
  const keys: (keyof Omit<SupplementDay, 'date'>)[] = [
    'omega3',
    'vitamineD3',
    'magnesium',
    'multivitamine',
  ];
  return dates.map((date, di) => {
    const out: SupplementDay = {
      date,
      omega3: 0,
      vitamineD3: 0,
      magnesium: 0,
      multivitamine: 0,
    };
    keys.forEach((k) => {
      let sum = 0;
      byMember.forEach((arr) => {
        const row = arr[di];
        if (row?.[k] != null) sum += row[k];
      });
      out[k] = Math.round((sum / byMember.length) * 100) / 100;
    });
    return out;
  });
}
