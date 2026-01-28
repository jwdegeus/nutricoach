/**
 * Meal Planner Agent Prompts
 * 
 * Builds prompts for the meal planning agent that explicitly enforce
 * hard and soft constraints from the diet rule set.
 */

import type { MealPlanRequest, DietRuleSet, MealPlanResponse, Meal } from "@/src/lib/diets";
import type { CandidatePool } from "./mealPlannerAgent.tools";

/**
 * Format a date range for display
 */
function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const days = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  return `${start} to ${end} (${days} days)`;
}

/**
 * Format meal slots for display
 */
function formatMealSlots(slots: string[]): string {
  const slotNames: Record<string, string> = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
  };
  return slots.map((slot) => slotNames[slot] || slot).join(", ");
}

/**
 * Build constraint summary for the prompt
 */
function buildConstraintSummary(rules: DietRuleSet): string {
  const parts: string[] = [];

  // Hard constraints
  const hardConstraints: string[] = [];
  const softConstraints: string[] = [];

  // Ingredient constraints
  rules.ingredientConstraints.forEach((constraint) => {
    const items = constraint.items.length > 0
      ? constraint.items.join(", ")
      : "N/A";
    const categories = constraint.categories?.length > 0
      ? constraint.categories.join(", ")
      : "";
    
    const desc = constraint.type === "forbidden"
      ? `FORBIDDEN: ${items}${categories ? ` (categories: ${categories})` : ""}`
      : `ALLOWED ONLY: ${items}${categories ? ` (categories: ${categories})` : ""}`;
    
    if (constraint.constraintType === "hard") {
      hardConstraints.push(`  - ${desc} [HARD]`);
    } else {
      softConstraints.push(`  - ${desc} [SOFT]`);
    }
  });

  // Required categories
  rules.requiredCategories.forEach((req) => {
    const items = req.items?.length > 0 ? req.items.join(", ") : "";
    const desc = `REQUIRED: ${req.category}${req.minPerDay ? ` (min ${req.minPerDay}/day)` : ""}${req.minPerWeek ? ` (min ${req.minPerWeek}/week)` : ""}${items ? ` - items: ${items}` : ""}`;
    
    if (req.constraintType === "hard") {
      hardConstraints.push(`  - ${desc} [HARD]`);
    } else {
      softConstraints.push(`  - ${desc} [SOFT]`);
    }
  });

  // Macro constraints
  rules.macroConstraints.forEach((macro) => {
    const parts: string[] = [];
    if (macro.maxCarbs !== undefined) parts.push(`max carbs: ${macro.maxCarbs}g`);
    if (macro.maxSaturatedFat !== undefined) parts.push(`max saturated fat: ${macro.maxSaturatedFat}g`);
    if (macro.minProtein !== undefined) parts.push(`min protein: ${macro.minProtein}g`);
    if (macro.minFat !== undefined) parts.push(`min fat: ${macro.minFat}g`);
    
    if (parts.length > 0) {
      const desc = `${macro.scope === "daily" ? "Daily" : "Per-meal"} macro limits: ${parts.join(", ")}`;
      if (macro.constraintType === "hard") {
        hardConstraints.push(`  - ${desc} [HARD]`);
      } else {
        softConstraints.push(`  - ${desc} [SOFT]`);
      }
    }
  });

  // Meal structure constraints
  rules.mealStructure.forEach((structure) => {
    if (structure.type === "vegetable_cups" && structure.vegetableCupsRequirement) {
      const req = structure.vegetableCupsRequirement;
      const desc = `Vegetable cups requirement: ${req.totalCups} total (${req.leafyCups} leafy, ${req.sulfurCups} sulfur, ${req.coloredCups} colored)`;
      if (structure.constraintType === "hard") {
        hardConstraints.push(`  - ${desc} [HARD]`);
      } else {
        softConstraints.push(`  - ${desc} [SOFT]`);
      }
    }
  });

  // Weekly variety
  if (rules.weeklyVariety.maxRepeats !== undefined) {
    softConstraints.push(
      `  - Max repeats per week: ${rules.weeklyVariety.maxRepeats} [SOFT]`
    );
  }
  if (rules.weeklyVariety.minUniqueMeals !== undefined) {
    softConstraints.push(
      `  - Min unique meals per week: ${rules.weeklyVariety.minUniqueMeals} [SOFT]`
    );
  }

  if (hardConstraints.length > 0) {
    parts.push("HARD CONSTRAINTS (must be followed 100%):");
    parts.push(...hardConstraints);
  }

  if (softConstraints.length > 0) {
    parts.push("\nSOFT CONSTRAINTS (optimize where possible):");
    parts.push(...softConstraints);
  }

  return parts.join("\n");
}

/**
 * Format candidate pool for prompt
 */
function formatCandidatePool(candidates: CandidatePool): string {
  const parts: string[] = [];
  
  for (const [category, items] of Object.entries(candidates)) {
    if (items.length === 0) continue;
    
    parts.push(`\n${category.toUpperCase()} (${items.length} candidates):`);
    for (const item of items.slice(0, 20)) { // Limit to 20 per category in prompt
      parts.push(`  - ${item.name} (nevoCode: ${item.nevoCode})${item.tags ? ` [tags: ${item.tags.join(", ")}]` : ""}`);
    }
    if (items.length > 20) {
      parts.push(`  ... and ${items.length - 20} more`);
    }
  }
  
  return parts.join("\n");
}

/**
 * Build the meal plan prompt
 * 
 * Creates a comprehensive prompt that instructs the agent to generate
 * a meal plan conforming to the provided diet rules and constraints.
 * The agent must choose ingredients ONLY from the provided candidate pool.
 * 
 * @param input - Request, rules, and candidate pool for meal planning
 * @returns Formatted prompt string
 */
/** Hint bij retry: ontbrekende FORCE-categorieën (dag-quotum niet gehaald) */
export type ForceDeficitHint = {
  categoryNames: string[];
};

export function buildMealPlanPrompt(input: {
  request: MealPlanRequest;
  rules: DietRuleSet;
  candidates?: CandidatePool;
  language?: 'nl' | 'en';
  /** Bij retry na FORCE-quotum-fout: zorg dat elke dag voldoende uit deze groepen bevat */
  forceDeficitHint?: ForceDeficitHint;
}): string {
  const { request, rules, candidates, language = 'nl', forceDeficitHint } = input;

  const dateRange = formatDateRange(
    request.dateRange.start,
    request.dateRange.end
  );
  const slots = formatMealSlots(request.slots);

  // Calorie target
  let calorieInfo = "";
  if (rules.calorieTarget.target) {
    calorieInfo = `Target calories: ${rules.calorieTarget.target} kcal/day`;
  } else if (rules.calorieTarget.min || rules.calorieTarget.max) {
    const range = [
      rules.calorieTarget.min ? `${rules.calorieTarget.min}` : "",
      rules.calorieTarget.max ? `${rules.calorieTarget.max}` : "",
    ]
      .filter(Boolean)
      .join("-");
    calorieInfo = `Calorie range: ${range} kcal/day`;
  }

  // Prep time
  const prepTime = request.maxPrepTime ?? rules.prepTimeConstraints.globalMax;
  const prepTimeInfo = prepTime ? `Max prep time per meal: ${prepTime} minutes` : "";

  // Additional exclusions/preferences
  const additionalExclusions = request.excludeIngredients?.length > 0
    ? `Additional exclusions: ${request.excludeIngredients.join(", ")}`
    : "";
  const preferredIngredients = request.preferIngredients?.length > 0
    ? `Preferred ingredients: ${request.preferIngredients.join(", ")}`
    : "";

  // Meal preferences (as tags/arrays)
  const mealPrefs = request.profile.mealPreferences;
  const mealPreferencesInfo = mealPrefs && (
    (mealPrefs.breakfast?.length || 0) > 0 || 
    (mealPrefs.lunch?.length || 0) > 0 || 
    (mealPrefs.dinner?.length || 0) > 0
  ) ? [
    mealPrefs.breakfast?.length ? `Breakfast: ${mealPrefs.breakfast.join(", ")}` : null,
    mealPrefs.lunch?.length ? `Lunch: ${mealPrefs.lunch.join(", ")}` : null,
    mealPrefs.dinner?.length ? `Dinner: ${mealPrefs.dinner.join(", ")}` : null,
  ].filter(Boolean).join("\n") : "";

  // Diet-specific rules summary
  const constraintSummary = buildConstraintSummary(rules);

  // Language instruction
  const languageInstruction = language === 'nl' 
    ? "CRITICAL LANGUAGE REQUIREMENT: All meal names, descriptions, and any text you generate MUST be in Dutch (Nederlands). Use Dutch names for meals, ingredients, and any descriptive text."
    : "CRITICAL LANGUAGE REQUIREMENT: All meal names, descriptions, and any text you generate MUST be in English. Use English names for meals, ingredients, and any descriptive text.";

  const prompt = `You are a meal planning assistant that generates personalized meal plans based on strict dietary requirements.

${languageInstruction}

TASK: Generate a meal plan for the following period and constraints.

PERIOD:
- Date range: ${dateRange}
- Meal slots per day: ${slots}

CALORIE & MACRO TARGETS:
${calorieInfo ? `- ${calorieInfo}` : "- No specific calorie target"}
${prepTimeInfo ? `- ${prepTimeInfo}` : ""}

DIET RULES & CONSTRAINTS:
${constraintSummary}
${forceDeficitHint && forceDeficitHint.categoryNames.length > 0
    ? `\nCRITICAL - DAG-QUOTUM (vorige poging afgekeurd): Zorg dat ELKE dag voldoende ingrediënten bevat uit deze groepen: ${forceDeficitHint.categoryNames.join(", ")}. Het dag-quotum voor deze groepen moet op elke afzonderlijke dag gehaald worden.\n`
    : ""}

${additionalExclusions ? `\n${additionalExclusions}` : ""}
${preferredIngredients ? `\n${preferredIngredients}` : ""}
${mealPreferencesInfo ? `\nMEAL PREFERENCES (REQUIRED):\nThe user has REQUIRED preferences for meal types. You MUST generate meals that match these preferences:\n${mealPreferencesInfo}\n\nIMPORTANT: For each meal slot, the generated meal MUST match at least one of the specified preferences. For example, if breakfast preference is "eiwit shake", the breakfast meal MUST be an eiwit shake (protein shake), not eggs or other breakfast items.\n` : ""}

${candidates ? `\nAVAILABLE INGREDIENTS (CANDIDATE POOL):\nYou MUST choose ingredients ONLY from this list. Use the exact nevoCode values provided.\n${formatCandidatePool(candidates)}\n` : ""}

CRITICAL REQUIREMENTS:
1. Output MUST be exactly ONE valid JSON object conforming to the provided schema
2. Do NOT include markdown formatting, code blocks, or explanations
3. Do NOT include any text outside the JSON object
4. All HARD constraints must be followed 100% - violations are not acceptable
5. SOFT constraints should be optimized where possible, but never at the expense of hard constraints
6. ${candidates ? "You MUST use ONLY ingredients from the candidate pool above. Each ingredient must have:" : "Each ingredient must have:"}
   - nevoCode: exact NEVO code from candidate pool (as string)
   - quantityG: amount in grams (minimum 1)
   - displayName: optional display name for UI
   - tags: optional tags for categorization
7. Each meal must have:
   - A unique ID (string)
   - A descriptive name
   - The correct meal slot (breakfast/lunch/dinner/snack)
   - The correct date (YYYY-MM-DD format)
   - ingredientRefs: array of ingredient references (required) with nevoCode and quantityG
   - Optional estimatedMacros (informative only - actual calculation happens server-side)
   - Optional prep time in minutes
   - Optional servings count
${candidates ? "8. DO NOT invent nevoCodes - use ONLY codes from the candidate pool above" : ""}
${mealPreferencesInfo ? `${candidates ? "9" : "8"}. MEAL PREFERENCES MUST be respected - each meal slot MUST match the specified preferences` : ""}
${candidates ? (mealPreferencesInfo ? "10" : "9") : (mealPreferencesInfo ? "9" : "8")}. Ensure variety across the week (respect weekly variety constraints)
${candidates ? (mealPreferencesInfo ? "11" : "10") : (mealPreferencesInfo ? "10" : "9")}. Ensure each day's meals together meet calorie/macro targets if specified
${candidates ? (mealPreferencesInfo ? "12" : "11") : (mealPreferencesInfo ? "11" : "10")}. Ensure all meals respect prep time constraints

Generate the meal plan now. Output ONLY the JSON object, nothing else.`;

  return prompt;
}

/**
 * Build prompt for generating a single day of meals
 * 
 * Creates a focused prompt for generating meals for one specific date.
 * Supports minimal-change objective: if existingDay is provided, instructs
 * the agent to preserve as many ingredients as possible.
 * 
 * @param input - Day generation request with optional existing day
 * @returns Formatted prompt string
 */
export function buildMealPlanDayPrompt(input: {
  date: string;
  request: MealPlanRequest;
  rules: DietRuleSet;
  candidates?: CandidatePool;
  existingDay?: MealPlanResponse["days"][number];
  language?: 'nl' | 'en';
}): string {
  const { date, request, rules, candidates, existingDay, language = 'nl' } = input;

  const slots = formatMealSlots(request.slots);

  // Calorie target
  let calorieInfo = "";
  if (rules.calorieTarget.target) {
    calorieInfo = `Target calories: ${rules.calorieTarget.target} kcal/day`;
  } else if (rules.calorieTarget.min || rules.calorieTarget.max) {
    const range = [
      rules.calorieTarget.min ? `${rules.calorieTarget.min}` : "",
      rules.calorieTarget.max ? `${rules.calorieTarget.max}` : "",
    ]
      .filter(Boolean)
      .join("-");
    calorieInfo = `Calorie range: ${range} kcal/day`;
  }

  // Prep time
  const prepTime = request.maxPrepTime ?? rules.prepTimeConstraints.globalMax;
  const prepTimeInfo = prepTime ? `Max prep time per meal: ${prepTime} minutes` : "";

  // Additional exclusions/preferences
  const additionalExclusions = request.excludeIngredients?.length > 0
    ? `Additional exclusions: ${request.excludeIngredients.join(", ")}`
    : "";
  const preferredIngredients = request.preferIngredients?.length > 0
    ? `Preferred ingredients: ${request.preferIngredients.join(", ")}`
    : "";

  // Meal preferences (as tags/arrays) - REQUIRED constraints
  const mealPrefs = request.profile.mealPreferences;
  const mealPreferencesInfo = mealPrefs && (
    (mealPrefs.breakfast?.length || 0) > 0 || 
    (mealPrefs.lunch?.length || 0) > 0 || 
    (mealPrefs.dinner?.length || 0) > 0
  ) ? [
    mealPrefs.breakfast?.length ? `Breakfast: ${mealPrefs.breakfast.join(", ")}` : null,
    mealPrefs.lunch?.length ? `Lunch: ${mealPrefs.lunch.join(", ")}` : null,
    mealPrefs.dinner?.length ? `Dinner: ${mealPrefs.dinner.join(", ")}` : null,
  ].filter(Boolean).join("\n") : "";

  // Diet-specific rules summary
  const constraintSummary = buildConstraintSummary(rules);

  // Language instruction
  const languageInstruction = language === 'nl' 
    ? "CRITICAL LANGUAGE REQUIREMENT: All meal names, descriptions, and any text you generate MUST be in Dutch (Nederlands). Use Dutch names for meals, ingredients, and any descriptive text."
    : "CRITICAL LANGUAGE REQUIREMENT: All meal names, descriptions, and any text you generate MUST be in English. Use English names for meals, ingredients, and any descriptive text.";

  // Minimal-change instructions if existing day provided
  let minimalChangeInstructions = "";
  if (existingDay) {
    const existingIngredientRefs = existingDay.meals.flatMap(
      (meal) => meal.ingredientRefs || []
    );
    const existingNevoCodes = existingIngredientRefs.map((ref) => ref.nevoCode);
    const uniqueNevoCodes = [...new Set(existingNevoCodes)];

    minimalChangeInstructions = `

MINIMAL-CHANGE OBJECTIVE:
You are regenerating meals for ${date}. An existing plan for this day exists with the following ingredients:
${uniqueNevoCodes.map((code) => {
  const ref = existingIngredientRefs.find((r) => r.nevoCode === code);
  return `  - ${ref?.displayName || code} (nevoCode: ${code}, quantityG: ${ref?.quantityG || 0}g)`;
}).join("\n")}

CRITICAL MINIMAL-CHANGE RULES:
1. PRESERVE existing ingredients (nevoCodes) wherever possible
2. Only adjust quantityG values to meet macro/calorie targets if needed
3. Only replace ingredients if:
   - They violate hard constraints (forbidden, allergen, disliked)
   - They are needed to meet required categories
   - Macro targets cannot be met by adjusting quantities alone
4. When replacing, prefer ingredients from the existing list over new ones
5. Maintain similar meal structure (same slots, similar meal types)

The goal is to minimize changes while ensuring all hard constraints are met.`;
  }

  const prompt = `You are a meal planning assistant that generates meals for a single day based on strict dietary requirements.

${languageInstruction}

TASK: Generate meals for ${date} only.

DATE & MEAL SLOTS:
- Date: ${date}
- Meal slots: ${slots}

CALORIE & MACRO TARGETS:
${calorieInfo ? `- ${calorieInfo}` : "- No specific calorie target"}
${prepTimeInfo ? `- ${prepTimeInfo}` : ""}

DIET RULES & CONSTRAINTS:
${constraintSummary}

${additionalExclusions ? `\n${additionalExclusions}` : ""}
${preferredIngredients ? `\n${preferredIngredients}` : ""}
${mealPreferencesInfo ? `\nMEAL PREFERENCES (REQUIRED - HARD CONSTRAINT):\nThe user has REQUIRED preferences for meal types. You MUST generate meals that match these preferences:\n${mealPreferencesInfo}\n\nCRITICAL: For each meal slot, the generated meal MUST match at least one of the specified preferences. The meal name and ingredients MUST clearly reflect the preference.\n` : ""}

${candidates ? `\nAVAILABLE INGREDIENTS (CANDIDATE POOL):\nYou MUST choose ingredients ONLY from this list. Use the exact nevoCode values provided.\n${formatCandidatePool(candidates)}\n` : ""}

${minimalChangeInstructions}

CRITICAL REQUIREMENTS:
1. Output MUST be exactly ONE valid JSON object conforming to the provided schema
2. Do NOT include markdown formatting, code blocks, or explanations
3. Do NOT include any text outside the JSON object
4. All HARD constraints must be followed 100% - violations are not acceptable
5. ${mealPreferencesInfo ? "MEAL PREFERENCES are REQUIRED - each meal MUST match the user's preferences for that meal slot. This is a HARD constraint." : ""}
6. SOFT constraints should be optimized where possible, but never at the expense of hard constraints
6. ${candidates ? "You MUST use ONLY ingredients from the candidate pool above. Each ingredient must have:" : "Each ingredient must have:"}
   - nevoCode: exact NEVO code from candidate pool (as string)
   - quantityG: amount in grams (minimum 1)
   - displayName: optional display name for UI
   - tags: optional tags for categorization
7. Each meal must have:
   - A unique ID (string)
   - A descriptive name
   - The correct meal slot (breakfast/lunch/dinner/snack)
   - The date: "${date}" (exactly this date)
   - ingredientRefs: array of ingredient references (required) with nevoCode and quantityG
   - Optional estimatedMacros (informative only - actual calculation happens server-side)
   - Optional prep time in minutes
   - Optional servings count
${candidates ? "8. DO NOT invent nevoCodes - use ONLY codes from the candidate pool above" : ""}
${candidates ? "9" : "8"}. Ensure the day's meals together meet calorie/macro targets if specified
${candidates ? "10" : "9"}. Ensure all meals respect prep time constraints

Generate the meals for ${date} now. Output ONLY the JSON object, nothing else.`;

  return prompt;
}

/**
 * Build prompt for generating a single meal (slot-only)
 * 
 * Creates a focused prompt for generating one meal for a specific date and slot.
 * Supports minimal-change objective: if existingMeal is provided, instructs
 * the agent to preserve as many ingredients as possible.
 * 
 * @param input - Meal generation request with optional existing meal and constraints
 * @returns Formatted prompt string
 */
export function buildMealPrompt(input: {
  date: string;
  mealSlot: string;
  request: MealPlanRequest;
  rules: DietRuleSet;
  candidates?: CandidatePool;
  existingMeal?: Meal;
  constraints?: {
    maxPrepMinutes?: number;
    targetCalories?: number;
    highProtein?: boolean;
    vegetarian?: boolean;
    avoidIngredients?: string[];
  };
  language?: 'nl' | 'en';
}): string {
  const { date, mealSlot, request, rules, candidates, existingMeal, constraints, language = 'nl' } = input;

  // Calorie target
  let calorieInfo = "";
  if (constraints?.targetCalories) {
    calorieInfo = `Target calories for this meal: ${constraints.targetCalories} kcal`;
  } else if (rules.calorieTarget.target) {
    // Rough estimate: divide day target by number of slots
    const slotsCount = request.slots.length;
    const mealTarget = Math.round(rules.calorieTarget.target / slotsCount);
    calorieInfo = `Estimated target calories for this meal: ~${mealTarget} kcal (based on daily target ${rules.calorieTarget.target} kcal / ${slotsCount} meals)`;
  } else if (rules.calorieTarget.min || rules.calorieTarget.max) {
    const slotsCount = request.slots.length;
    const minMeal = rules.calorieTarget.min ? Math.round(rules.calorieTarget.min / slotsCount) : undefined;
    const maxMeal = rules.calorieTarget.max ? Math.round(rules.calorieTarget.max / slotsCount) : undefined;
    if (minMeal || maxMeal) {
      calorieInfo = `Estimated calorie range for this meal: ${minMeal || "?"}-${maxMeal || "?"} kcal`;
    }
  }

  // Prep time
  const prepTime = constraints?.maxPrepMinutes 
    ?? request.maxPrepTime 
    ?? rules.prepTimeConstraints.perMeal?.[mealSlot as keyof typeof rules.prepTimeConstraints.perMeal]
    ?? rules.prepTimeConstraints.globalMax;
  const prepTimeInfo = prepTime ? `Max prep time: ${prepTime} minutes` : "";

  // Additional exclusions/preferences
  const additionalExclusions = [
    ...(request.excludeIngredients || []),
    ...(constraints?.avoidIngredients || []),
  ];
  const exclusionsInfo = additionalExclusions.length > 0
    ? `Additional exclusions: ${additionalExclusions.join(", ")}`
    : "";

  const preferredIngredients = request.preferIngredients?.length > 0
    ? `Preferred ingredients: ${request.preferIngredients.join(", ")}`
    : "";

  // Meal preferences (for this specific slot, as tags/array) - REQUIRED
  const mealPrefs = request.profile.mealPreferences;
  const mealPreferenceForSlot = mealPrefs?.[mealSlot as keyof typeof mealPrefs];
  const mealPreferenceInfo = mealPreferenceForSlot && mealPreferenceForSlot.length > 0
    ? `REQUIRED MEAL PREFERENCE for ${mealSlot}: ${mealPreferenceForSlot.join(", ")}. The generated meal MUST match this preference. For example, if the preference is "eiwit shake", the meal MUST be an eiwit shake (protein shake) with protein powder ingredients, not eggs, toast, or other items. The meal name and ingredients MUST clearly reflect the preference.`
    : "";

  // Constraint overrides
  const constraintOverrides: string[] = [];
  if (constraints?.highProtein) {
    constraintOverrides.push("High protein preference: prioritize protein-rich ingredients");
  }
  if (constraints?.vegetarian) {
    constraintOverrides.push("Vegetarian: no meat, fish, or animal products");
  }

  // Diet-specific rules summary (meal-scoped)
  const constraintSummary = buildConstraintSummary(rules);

  // Language instruction
  const languageInstruction = language === 'nl' 
    ? "CRITICAL LANGUAGE REQUIREMENT: All meal names, descriptions, and any text you generate MUST be in Dutch (Nederlands). Use Dutch names for meals, ingredients, and any descriptive text."
    : "CRITICAL LANGUAGE REQUIREMENT: All meal names, descriptions, and any text you generate MUST be in English. Use English names for meals, ingredients, and any descriptive text.";

  // Minimal-change instructions if existing meal provided
  let minimalChangeInstructions = "";
  if (existingMeal) {
    const existingIngredientRefs = existingMeal.ingredientRefs || [];
    const existingNevoCodes = existingIngredientRefs.map((ref) => ref.nevoCode);
    const uniqueNevoCodes = [...new Set(existingNevoCodes)];

    minimalChangeInstructions = `

MINIMAL-CHANGE OBJECTIVE:
You are replacing the ${mealSlot} meal for ${date}. An existing meal exists with the following ingredients:
${uniqueNevoCodes.map((code) => {
  const ref = existingIngredientRefs.find((r) => r.nevoCode === code);
  return `  - ${ref?.displayName || code} (nevoCode: ${code}, quantityG: ${ref?.quantityG || 0}g)`;
}).join("\n")}

CRITICAL MINIMAL-CHANGE RULES:
1. PRESERVE existing ingredients (nevoCodes) wherever possible
2. Only adjust quantityG values to meet macro/calorie targets if needed
3. Only replace ingredients if:
   - They violate hard constraints (forbidden, allergen, disliked)
   - They are needed to meet required categories
   - Macro targets cannot be met by adjusting quantities alone
4. When replacing, prefer ingredients from the existing list over new ones
5. Maintain similar meal structure and type

The goal is to minimize changes while ensuring all hard constraints are met.`;
  }

  const prompt = `You are a meal planning assistant that generates a single meal based on strict dietary requirements.

${languageInstruction}

TASK: Generate ONE meal for ${date}, slot: ${mealSlot}.

DATE & MEAL SLOT:
- Date: ${date}
- Meal slot: ${mealSlot}

CALORIE & MACRO TARGETS:
${calorieInfo ? `- ${calorieInfo}` : "- No specific calorie target for this meal"}
${prepTimeInfo ? `- ${prepTimeInfo}` : ""}

DIET RULES & CONSTRAINTS:
${constraintSummary}

${exclusionsInfo ? `\n${exclusionsInfo}` : ""}
${preferredIngredients ? `\n${preferredIngredients}` : ""}
${mealPreferenceInfo ? `\n${mealPreferenceInfo}` : ""}
${constraintOverrides.length > 0 ? `\nCONSTRAINT OVERRIDES:\n${constraintOverrides.map(c => `- ${c}`).join("\n")}` : ""}

${candidates ? `\nAVAILABLE INGREDIENTS (CANDIDATE POOL):\nYou MUST choose ingredients ONLY from this list. Use the exact nevoCode values provided.\n${formatCandidatePool(candidates)}\n` : ""}

${minimalChangeInstructions}

CRITICAL REQUIREMENTS:
1. Output MUST be exactly ONE valid JSON object conforming to the provided schema
2. Do NOT include markdown formatting, code blocks, or explanations
3. Do NOT include any text outside the JSON object
4. All HARD constraints must be followed 100% - violations are not acceptable
5. SOFT constraints should be optimized where possible, but never at the expense of hard constraints
6. ${candidates ? "You MUST use ONLY ingredients from the candidate pool above. Each ingredient must have:" : "Each ingredient must have:"}
   - nevoCode: exact NEVO code from candidate pool (as string)
   - quantityG: amount in grams (minimum 1)
   - displayName: optional display name for UI
   - tags: optional tags for categorization
7. The meal must have:
   - A unique ID (string)
   - A descriptive name
   - The correct meal slot: "${mealSlot}" (exactly this slot)
   - The date: "${date}" (exactly this date)
   - ingredientRefs: array of ingredient references (required) with nevoCode and quantityG
   - Optional estimatedMacros (informative only - actual calculation happens server-side)
   - Optional prep time in minutes
   - Optional servings count
${candidates ? "8. DO NOT invent nevoCodes - use ONLY codes from the candidate pool above" : ""}
${candidates ? "9" : "8"}. Ensure the meal respects prep time constraints
${candidates ? "10" : "9"}. Ensure the meal meets calorie/macro targets if specified

Generate the meal for ${date}, ${mealSlot} now. Output ONLY the JSON object, nothing else.`;

  return prompt;
}
