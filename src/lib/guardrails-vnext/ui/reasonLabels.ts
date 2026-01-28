/**
 * Guard Rails Reason Code Labels
 *
 * Maps technical reason codes to human-readable Dutch labels for UI display.
 * This is a client-safe utility that can be used in both server and client components.
 */

import type { GuardReasonCode } from '../types';

/**
 * Mapping of reason codes to human-readable Dutch labels
 */
const REASON_CODE_LABELS: Record<GuardReasonCode, string> = {
  // Ingredient violations
  FORBIDDEN_INGREDIENT: 'Verboden ingrediënt',
  ALLERGEN_PRESENT: 'Allergeen aanwezig',
  DISLIKED_INGREDIENT: 'Niet gewenst ingrediënt',

  // Category violations
  MISSING_REQUIRED_CATEGORY: 'Verplichte categorie ontbreekt',
  INVALID_CATEGORY: 'Ongeldige categorie',

  // NEVO/Canonical violations
  INVALID_NEVO_CODE: 'Ongeldige NEVO code',
  INVALID_CANONICAL_ID: 'Ongeldige ingrediënt ID',

  // Macro/Calorie violations
  CALORIE_TARGET_MISS: 'Calorie doel niet gehaald',
  MACRO_TARGET_MISS: 'Macro doel niet gehaald',

  // Meal structure violations
  MEAL_PREFERENCE_MISS: 'Maaltijd voorkeur niet voldaan',
  MEAL_STRUCTURE_VIOLATION: 'Maaltijd structuur schending',

  // Soft constraints
  SOFT_CONSTRAINT_VIOLATION: 'Zachte regel schending',

  // Errors
  EVALUATOR_ERROR: 'Validatie fout (veilig geblokkeerd)',
  EVALUATOR_WARNING: 'Validatie waarschuwing',
  RULESET_LOAD_ERROR: 'Regelset laad fout',
  UNKNOWN_ERROR: 'Onbekende fout',
};

/**
 * Get human-readable label for a reason code
 *
 * @param code - Reason code (may be unknown)
 * @returns Human-readable label in Dutch
 */
export function getGuardReasonLabel(code: string): string {
  // Check if it's a known GuardReasonCode
  if (code in REASON_CODE_LABELS) {
    return REASON_CODE_LABELS[code as GuardReasonCode];
  }

  // Fallback: convert code to readable format
  // FORBIDDEN_INGREDIENT -> "Verboden ingrediënt"
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Format reason code for badge display
 *
 * Returns both label and code for tooltip/accessibility
 *
 * @param code - Reason code
 * @returns Object with label and code
 */
export function formatReasonForBadge(code: string): {
  label: string;
  code: string;
} {
  return {
    label: getGuardReasonLabel(code),
    code,
  };
}
