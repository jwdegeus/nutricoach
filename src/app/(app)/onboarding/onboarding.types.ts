/**
 * Onboarding types - User preferences and diet profile configuration
 */

/**
 * Diet strictness level
 */
export type DietStrictness = "strict" | "flexible";

/**
 * Variety level for meal planning
 */
export type VarietyLevel = "low" | "std" | "high";

/**
 * Input type for onboarding form data
 */
export type OnboardingInput = {
  dietTypeId: string;
  strictness?: DietStrictness;
  allergies: string[];
  dislikes: string[];
  maxPrepMinutes: number;
  servingsDefault: number;
  kcalTarget?: number | null;
  varietyLevel?: VarietyLevel;
  mealPreferences?: {
    breakfast?: string[];
    lunch?: string[];
    dinner?: string[];
  };
};

/**
 * Onboarding completion status and summary
 */
export type OnboardingStatus = {
  completed: boolean;
  completedAt?: string | null;
  summary: {
    dietTypeId?: string;
    maxPrepMinutes?: number;
    servingsDefault?: number;
    kcalTarget?: number | null;
    strictness?: DietStrictness;
    varietyLevel?: VarietyLevel;
    allergies?: string[];
    dislikes?: string[];
    mealPreferences?: {
      breakfast?: string[];
      lunch?: string[];
      dinner?: string[];
    };
  };
};

/**
 * Helper function to map variety level to days
 * @param level - The variety level
 * @returns Number of days for the variety window
 */
export function mapVarietyLevelToDays(level: VarietyLevel): number {
  switch (level) {
    case "low":
      return 3;
    case "std":
      return 7;
    case "high":
      return 14;
    default:
      return 7; // Default to standard
  }
}

/**
 * Helper function to map diet strictness to numeric value (1-10)
 * @param strictness - The diet strictness level
 * @returns Numeric strictness value (1-10)
 */
export function mapStrictnessToNumber(strictness?: DietStrictness): number {
  switch (strictness) {
    case "strict":
      return 9; // High strictness
    case "flexible":
      return 2; // Low strictness
    default:
      return 5; // Default to middle
  }
}

/**
 * Helper function to map numeric strictness (1-10) back to DietStrictness
 * @param strictness - Numeric strictness value
 * @returns DietStrictness level
 */
export function mapNumberToStrictness(strictness: number): DietStrictness {
  // 1-5 = flexible, 6-10 = strict
  return strictness <= 5 ? "flexible" : "strict";
}

/**
 * Helper function to map variety window days back to VarietyLevel
 * @param days - Number of days
 * @returns VarietyLevel
 */
export function mapDaysToVarietyLevel(days: number): VarietyLevel {
  if (days <= 3) return "low";
  if (days <= 7) return "std";
  return "high";
}
