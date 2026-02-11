'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  updateDietType,
  type DietTypeOutput,
  type DietTypeInput,
} from '../../../actions/diet-admin.actions';
import { Button } from '@/components/catalyst/button';
import { Input } from '@/components/catalyst/input';
import {
  Field,
  FieldGroup,
  Label,
  Description,
} from '@/components/catalyst/fieldset';
import { Text } from '@/components/catalyst/text';
import { Textarea } from '@/components/catalyst/textarea';
import { Checkbox, CheckboxField } from '@/components/catalyst/checkbox';
import { FirewallRulesCombined } from '../../../components/FirewallRulesCombined';
import { GuardrailsPreviewPanel } from '../../../components/GuardrailsPreviewPanel';

type DietEditPageProps = {
  dietType: DietTypeOutput;
};

export function DietEditPage({ dietType: initialDietType }: DietEditPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dietType, setDietType] = useState<DietTypeOutput>(initialDietType);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Initialize active tab from URL query parameter or default
  const tabParam = searchParams.get('tab');
  const initialTab: 'diet' | 'guardrails' | 'test-rules' =
    tabParam === 'test-rules'
      ? 'test-rules'
      : tabParam === 'guardrails'
        ? 'guardrails'
        : 'diet';
  const [activeTab, setActiveTab] = useState<
    'diet' | 'guardrails' | 'test-rules'
  >(initialTab);

  // Update tab when URL changes (defer to avoid set-state-in-effect)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const nextTab =
      tabParam === 'test-rules'
        ? 'test-rules'
        : tabParam === 'guardrails'
          ? 'guardrails'
          : 'diet';
    queueMicrotask(() => setActiveTab(nextTab));
  }, [searchParams]);

  // Diet form state
  const [dietFormData, setDietFormData] = useState<DietTypeInput>({
    name: dietType.name,
    description: dietType.description || '',
    displayOrder: dietType.displayOrder,
    isActive: dietType.isActive,
  });

  async function handleDietSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!dietFormData.name.trim()) {
      setError('Naam is verplicht');
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateDietType(dietType.id, dietFormData);
        if ('error' in result) {
          setError(result.error);
        } else if (result.data) {
          setSuccess('Dieettype succesvol bijgewerkt');
          setDietType(result.data);
        }
      } catch (_err) {
        setError('Onverwachte fout bij opslaan');
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button onClick={() => router.push('/settings')} color="zinc">
            ← Terug naar instellingen
          </Button>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {dietType.name} bewerken
          </h1>
          <Text className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6 dark:text-zinc-400">
            Bewerk dieettype instellingen en regels
          </Text>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
          <strong>Fout:</strong> {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <strong>Succes:</strong> {success}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => {
              setActiveTab('diet');
              router.replace(`/settings/diets/${dietType.id}/edit?tab=diet`);
            }}
            className={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap ${
              activeTab === 'diet'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            Dieettype
          </button>
          <button
            onClick={() => {
              setActiveTab('guardrails');
              router.replace(
                `/settings/diets/${dietType.id}/edit?tab=guardrails`,
              );
            }}
            className={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap ${
              activeTab === 'guardrails'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            Dieetregels
          </button>
          <button
            onClick={() => {
              setActiveTab('test-rules');
              router.replace(
                `/settings/diets/${dietType.id}/edit?tab=test-rules`,
              );
            }}
            className={`border-b-2 px-1 py-4 text-sm font-medium whitespace-nowrap ${
              activeTab === 'test-rules'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
            }`}
          >
            Regels testen
          </button>
        </nav>
      </div>

      {/* Diet Tab */}
      {activeTab === 'diet' && (
        <div className="rounded-lg bg-white p-6 shadow-xs ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <form onSubmit={handleDietSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="name">Naam *</Label>
                <Input
                  id="name"
                  value={dietFormData.name}
                  onChange={(e) =>
                    setDietFormData({ ...dietFormData, name: e.target.value })
                  }
                  required
                  placeholder="Bijv. Keto, Vegetarisch, etc."
                />
              </Field>

              <Field>
                <Label htmlFor="description">Beschrijving</Label>
                <Textarea
                  id="description"
                  value={dietFormData.description ?? ''}
                  onChange={(e) =>
                    setDietFormData({
                      ...dietFormData,
                      description: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="Beschrijving van het dieettype"
                />
              </Field>

              <Field>
                <Label htmlFor="displayOrder">Weergave volgorde</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={dietFormData.displayOrder}
                  onChange={(e) =>
                    setDietFormData({
                      ...dietFormData,
                      displayOrder: parseInt(e.target.value) || 0,
                    })
                  }
                  min={0}
                />
                <Description>
                  Lagere nummers verschijnen eerst in de lijst
                </Description>
              </Field>

              <CheckboxField>
                <Checkbox
                  checked={dietFormData.isActive}
                  onChange={(value) =>
                    setDietFormData({ ...dietFormData, isActive: value })
                  }
                />
                <Label>Actief</Label>
                <Description>
                  Alleen actieve dieettypes zijn zichtbaar voor gebruikers
                </Description>
              </CheckboxField>

              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Opslaan...' : 'Bijwerken'}
                </Button>
                <Button
                  type="button"
                  onClick={() => router.push('/settings')}
                  color="zinc"
                >
                  Annuleren
                </Button>
              </div>
            </FieldGroup>
          </form>
        </div>
      )}

      {/* Dieetregels Tab - Overview and Management (zonder Regels testen) */}
      {activeTab === 'guardrails' && (
        <FirewallRulesCombined
          dietTypeId={dietType.id}
          dietTypeName={dietType.name}
        />
      )}

      {/* Regels testen Tab */}
      {activeTab === 'test-rules' && (
        <GuardrailsPreviewPanel dietTypeId={dietType.id} />
      )}
    </div>
  );
}
