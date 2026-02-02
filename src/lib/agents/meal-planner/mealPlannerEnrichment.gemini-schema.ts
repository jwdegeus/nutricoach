/**
 * Flattened JSON schemas for meal plan enrichment, safe for Gemini API.
 *
 * Gemini enforces a maximum nesting depth on response_json_schema.
 * zodToJsonSchema inlines nested objects and can exceed that limit.
 * This module provides shallow schemas using $ref for nested types.
 */

export type GeminiEnrichmentJsonSchema = Record<string, unknown>;

/** Enriched meal: title, instructions, times, etc. */
const enrichedMealDef = {
  type: 'object' as const,
  properties: {
    date: { type: 'string' as const },
    mealSlot: { type: 'string' as const },
    title: { type: 'string' as const },
    instructions: {
      type: 'array' as const,
      items: { type: 'string' as const },
      minItems: 2,
      maxItems: 12,
    },
    prepTimeMin: { type: 'number' as const, minimum: 0, maximum: 240 },
    cookTimeMin: { type: 'number' as const, minimum: 0, maximum: 240 },
    servings: { type: 'number' as const, minimum: 1 },
    kitchenNotes: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
    ingredientNevoCodesUsed: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
  },
  required: [
    'date',
    'mealSlot',
    'title',
    'instructions',
    'prepTimeMin',
    'cookTimeMin',
    'ingredientNevoCodesUsed',
  ] as const,
  additionalProperties: false,
};

/** Cook plan day: date, steps, estimatedTotalTimeMin */
const cookPlanDayDef = {
  type: 'object' as const,
  properties: {
    date: { type: 'string' as const },
    steps: {
      type: 'array' as const,
      items: { type: 'string' as const },
      minItems: 1,
    },
    estimatedTotalTimeMin: {
      type: 'number' as const,
      minimum: 0,
      maximum: 480,
    },
  },
  required: ['date', 'steps', 'estimatedTotalTimeMin'] as const,
  additionalProperties: false,
};

/** Root: meals[], cookPlanDays[] (inline at top-level for Gemini) */
const enrichmentResponseRoot = {
  type: 'object' as const,
  properties: {
    meals: {
      type: 'array' as const,
      items: { $ref: '#/definitions/EnrichedMeal' as const },
    },
    cookPlanDays: {
      type: 'array' as const,
      items: { $ref: '#/definitions/CookPlanDay' as const },
    },
  },
  required: ['meals', 'cookPlanDays'] as const,
  additionalProperties: false,
};

/**
 * Returns a JSON schema for MealPlanEnrichmentResponse that stays within
 * Gemini's maximum nesting depth. Root is inline (not a $ref).
 */
export function getMealPlanEnrichmentResponseJsonSchemaForGemini(): GeminiEnrichmentJsonSchema {
  return {
    ...enrichmentResponseRoot,
    definitions: {
      EnrichedMeal: enrichedMealDef,
      CookPlanDay: cookPlanDayDef,
    },
  };
}

/**
 * Returns a JSON schema for a single EnrichedMeal (used in enrichMeal).
 * Root is inline to avoid top-level $ref.
 */
export function getEnrichedMealJsonSchemaForGemini(): GeminiEnrichmentJsonSchema {
  return {
    ...enrichedMealDef,
    definitions: {},
  };
}
