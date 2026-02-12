import { Link } from '@/components/catalyst/link';

const REASON_LABELS: Record<string, string> = {
  no_candidates: 'Geen passende recepten',
  repeat_window_blocked: 'Variatie-venster te streng',
  missing_ingredient_refs: 'NEVO ontbreekt',
  all_candidates_blocked_by_constraints: 'Geblokkeerd door regels',
  ai_candidate_blocked_by_constraints: 'AI voorstel geblokkeerd',
};

function reasonLabelFor(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

type GeneratorInzichtPanelProps = {
  dbCoverageMeta: { dbSlots: number; totalSlots: number; percent: number };
  fallbackReasonsMeta?: { reason: string; count: number }[];
  aiSlotsDisplay: { date: string; slotLabel: string; reasonLabel: string }[];
  hasMissingRefs: boolean;
};

/** Actie-tips per reden, zodat je gericht kunt perfectioneren */
const REASON_ACTIONS: Record<string, { label: string; href: string }> = {
  no_candidates: {
    label: 'Meer recepten toevoegen voor dit slot',
    href: '/recipes',
  },
  repeat_window_blocked: {
    label: 'Variatie-venster aanpassen in generator-config',
    href: '/admin/generator-config',
  },
  missing_ingredient_refs: {
    label: 'NEVO ontbreekt bij recepten fixen',
    href: '/recipes?filter=nevo-missing',
  },
  all_candidates_blocked_by_constraints: {
    label: 'Dieetregels of allergieën controleren',
    href: '/settings/diets',
  },
  ai_candidate_blocked_by_constraints: {
    label: 'Dieetregels of allergieën controleren',
    href: '/settings/diets',
  },
};

export function GeneratorInzichtPanel({
  dbCoverageMeta,
  fallbackReasonsMeta,
  aiSlotsDisplay,
  hasMissingRefs,
}: GeneratorInzichtPanelProps) {
  const { dbSlots, totalSlots, percent } = dbCoverageMeta;
  const aiSlots = totalSlots - dbSlots;
  const hasAiSlots = aiSlots > 0;
  const hasReasons =
    Array.isArray(fallbackReasonsMeta) && fallbackReasonsMeta.length > 0;
  const hasPerSlotReasons = aiSlotsDisplay.length > 0;

  if (!hasAiSlots) {
    return (
      <div className="rounded-xl bg-muted/20 px-4 py-3 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          Generator-inzicht: alle {totalSlots} maaltijden uit je recepten.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Geen AI nodig — je database dekt het volledige weekmenu.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-muted/20 px-4 py-3 shadow-sm">
      <p className="text-sm font-medium text-foreground">
        Generator-inzicht: {dbSlots} van {totalSlots} uit recepten ({percent}%),{' '}
        {aiSlots} nieuw gegenereerd.
      </p>

      {hasReasons ? (
        <>
          <p className="mt-2 text-sm font-medium text-foreground">
            Waarom AI ingevuld:
          </p>
          <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
            {fallbackReasonsMeta!.map((r) => {
              const action = REASON_ACTIONS[r.reason];
              return (
                <li
                  key={r.reason}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span>
                    {reasonLabelFor(r.reason)} ({r.count}×)
                  </span>
                  {action && (
                    <Link
                      href={action.href}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      → {action.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Geen specifieke reden per slot beschikbaar (standaard modus). Voor
          gedetailleerde diagnostiek:{' '}
          <Link
            href="/admin/generator-v2"
            className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            zet database-eerst modus aan
          </Link>{' '}
          in admin (Generator v2).
        </p>
      )}

      {hasPerSlotReasons && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground hover:text-primary-600 dark:hover:text-primary-400">
            Per slot: wanneer AI
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {aiSlotsDisplay.map((item) => (
              <li key={`${item.date}-${item.slotLabel}`}>
                {item.date} – {item.slotLabel}: {item.reasonLabel}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
        <span className="text-xs font-medium text-muted-foreground">
          Acties om te perfectioneren:
        </span>
        {hasMissingRefs && (
          <Link
            href="/recipes?filter=nevo-missing"
            className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Fix NEVO ontbreekt
          </Link>
        )}
        <Link
          href="/recipes"
          className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          Receptenbank
        </Link>
        <Link
          href="/settings/diets"
          className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          Dieetregels
        </Link>
        <Link
          href="/admin/generator-config"
          className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          Generator-config
        </Link>
      </div>
    </div>
  );
}
