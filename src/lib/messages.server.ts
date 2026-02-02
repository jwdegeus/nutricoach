/**
 * Server-side message loader for meal planner and meal plans.
 * Use messages JSON so content is editable without code changes.
 */

import nlMessages from '@/messages/nl.json';
import enMessages from '@/messages/en.json';

type Messages = typeof nlMessages;

const messagesByLocale: Record<'nl' | 'en', Messages> = {
  nl: nlMessages as Messages,
  en: enMessages as Messages,
};

/** Get full messages for locale (server-only). */
export function getMessagesForLocale(locale: 'nl' | 'en'): Messages {
  return messagesByLocale[locale];
}

/** Slot style labels for prompt (from messages.mealPlan.slotStylePromptLabels). */
export type SlotStylePromptLabels = Record<string, string>;

export function getSlotStylePromptLabels(
  locale: 'nl' | 'en',
): SlotStylePromptLabels {
  const messages = messagesByLocale[locale];
  const mealPlan = (messages as Record<string, unknown>).mealPlan as
    | { slotStylePromptLabels?: SlotStylePromptLabels }
    | undefined;
  return mealPlan?.slotStylePromptLabels ?? {};
}

/** Shake/smoothie guidance text for prompt (from messages.mealPlanner.shakeSmoothieGuidance). */
export function getShakeSmoothieGuidance(locale: 'nl' | 'en'): string {
  const messages = messagesByLocale[locale];
  const mealPlanner = (messages as Record<string, unknown>).mealPlanner as
    | { shakeSmoothieGuidance?: string }
    | undefined;
  return mealPlanner?.shakeSmoothieGuidance ?? '';
}
