'use client';

import { useState, useEffect } from 'react';
import {
  getGeneratorV2SettingsAction,
  updateUseDbFirstAction,
  type GeneratorV2Settings,
} from '../actions/generatorV2.actions';
import { Switch } from '@/components/catalyst/switch';
import { Heading } from '@/components/catalyst/heading';
import { Text } from '@/components/catalyst/text';
import { Field, Label } from '@/components/catalyst/fieldset';
import { useToast } from '@/src/components/app/ToastContext';
import { Link } from '@/components/catalyst/link';

export function GeneratorV2Client() {
  const [settings, setSettings] = useState<GeneratorV2Settings[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    getGeneratorV2SettingsAction().then((res) => {
      if ('data' in res) setSettings(res.data);
      setLoading(false);
    });
  }, []);

  const handleToggle = async (id: string, next: boolean) => {
    setUpdating(id);
    const res = await updateUseDbFirstAction(id, next);
    setUpdating(null);
    if ('error' in res) {
      showToast({ type: 'error', title: res.error });
      return;
    }
    setSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, use_db_first: next } : s)),
    );
    showToast({
      type: 'success',
      title: next
        ? 'Database-eerst ingeschakeld'
        : 'Database-eerst uitgeschakeld',
    });
  };

  if (loading) {
    return <Text className="text-muted-foreground">Laden…</Text>;
  }

  return (
    <div className="space-y-6">
      <div>
        <Heading level={2}>Plan generator v2</Heading>
        <Text className="mt-1 text-sm text-muted-foreground">
          Instellingen voor weekmenu-generatie (reuse, coverage, AI-cap). Deze
          config bepaalt hoe plannen worden opgebouwd.
        </Text>
      </div>

      <div className="rounded-xl bg-muted/20 p-4 shadow-sm">
        <Heading level={3} className="mb-3">
          Database-eerst modus
        </Heading>
        <Text className="mb-4 text-sm text-muted-foreground">
          Wanneer aan: eerst vullen uit recepten/history, daarna AI voor gaten.
          Geeft gedetailleerde redenen per slot in het Generator-inzicht panel
          (bijv. &quot;Geen passende recepten&quot;, &quot;Geblokkeerd door
          regels&quot;). Zonder deze modus zie je alleen een totaal-overzicht.
        </Text>

        {settings.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            Geen actieve instellingen gevonden.
          </Text>
        ) : (
          <div className="space-y-4">
            {settings.map((s) => (
              <Field key={s.id}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <Label>
                      {s.diet_key ?? 'Globaal default'}{' '}
                      <span className="font-normal text-muted-foreground">
                        ({s.diet_key ? 'dieet-specifiek' : 'alle diëten'})
                      </span>
                    </Label>
                  </div>
                  <Switch
                    name={`use_db_first_${s.id}`}
                    checked={s.use_db_first}
                    onChange={(checked) => handleToggle(s.id, checked)}
                    disabled={updating === s.id}
                  />
                </div>
              </Field>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-muted/20 p-4 shadow-sm">
        <Heading level={3} className="mb-2">
          Overige waarden
        </Heading>
        <Text className="text-sm text-muted-foreground">
          Andere parameters (reuse ratio, recency, AI-cap) staan in de database.
          Voor bulk-edit: direct in Supabase of via een toekomstige uitgebreide
          admin.
        </Text>
        {settings.length > 0 && (
          <dl className="mt-3 space-y-2 text-sm">
            {settings.map((s) => (
              <div key={s.id} className="flex gap-4">
                <dt className="w-32 font-medium">{s.diet_key ?? 'Globaal'}</dt>
                <dd className="text-muted-foreground">
                  reuse {s.min_history_reuse_ratio} · recency{' '}
                  {s.recency_window_days}d · max AI{' '}
                  {s.max_ai_generated_slots_per_week}/wk
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <Link
        href="/meal-plans"
        className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
      >
        ← Terug naar weekmenu&apos;s
      </Link>
    </div>
  );
}
