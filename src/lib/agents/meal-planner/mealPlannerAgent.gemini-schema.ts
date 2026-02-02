/**
 * Flattened JSON schema for meal plan response, safe for Gemini API.
 *
 * Gemini enforces a maximum nesting depth on response_json_schema.
 * zodToJsonSchema inlines nested objects, which can exceed that limit.
 * This module provides a schema that uses $ref for nested types so each
 * definition stays shallow (max depth ~2–3).
 */

/** JSON schema for Gemini: root may be inline (type/properties/required) or $ref + definitions */
export type GeminiMealPlanResponseJsonSchema = Record<string, unknown>;

const slotEnum = {
  type: 'string' as const,
  enum: ['breakfast', 'lunch', 'dinner', 'snack'],
};

const dietKeyEnum = {
  type: 'string' as const,
  enum: ['wahls_paleo_plus', 'keto', 'mediterranean', 'vegan', 'balanced'],
};

/** Optional macros/nutrition object (same shape for estimatedMacros, nutrition, etc.) */
const estimatedMacrosDef = {
  type: 'object' as const,
  properties: {
    calories: { type: 'number' as const },
    protein: { type: 'number' as const },
    carbs: { type: 'number' as const },
    fat: { type: 'number' as const },
    saturatedFat: { type: 'number' as const },
  },
  additionalProperties: false,
};

/** Meal ingredient reference (primary contract) */
const ingredientRefDef = {
  type: 'object' as const,
  properties: {
    nevoCode: { type: 'string' as const },
    quantityG: { type: 'number' as const, minimum: 1 },
    displayName: { type: 'string' as const },
    tags: { type: 'array' as const, items: { type: 'string' as const } },
  },
  required: ['nevoCode', 'quantityG'] as const,
  additionalProperties: false,
};

/** Legacy ingredient (optional in meal) */
const ingredientDef = {
  type: 'object' as const,
  properties: {
    name: { type: 'string' as const },
    amount: { type: 'number' as const },
    unit: { type: 'string' as const },
    tags: { type: 'array' as const, items: { type: 'string' as const } },
  },
  required: ['name', 'amount', 'unit'] as const,
  additionalProperties: false,
};

/** Single meal: use $ref for nested types to keep depth low */
const mealDef = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    name: { type: 'string' as const },
    slot: slotEnum,
    date: { type: 'string' as const },
    ingredientRefs: {
      type: 'array' as const,
      items: { $ref: '#/definitions/IngredientRef' as const },
      minItems: 1,
    },
    ingredients: {
      type: 'array' as const,
      items: { $ref: '#/definitions/Ingredient' as const },
    },
    estimatedMacros: { $ref: '#/definitions/EstimatedMacros' as const },
    nutrition: { $ref: '#/definitions/EstimatedMacros' as const },
    prepTime: { type: 'number' as const },
    servings: { type: 'number' as const },
  },
  required: ['id', 'name', 'slot', 'date', 'ingredientRefs'] as const,
  additionalProperties: false,
};

/** Single day: meals array uses $ref Meal */
const dayDef = {
  type: 'object' as const,
  properties: {
    date: { type: 'string' as const },
    meals: {
      type: 'array' as const,
      items: { $ref: '#/definitions/Meal' as const },
    },
    totalNutrition: { $ref: '#/definitions/EstimatedMacros' as const },
    estimatedTotalMacros: { $ref: '#/definitions/EstimatedMacros' as const },
  },
  required: ['date', 'meals'] as const,
  additionalProperties: false,
};

/** Plan metadata (optional) */
const metadataDef = {
  type: 'object' as const,
  properties: {
    generatedAt: { type: 'string' as const },
    dietKey: dietKeyEnum,
    totalDays: { type: 'number' as const, minimum: 1 },
    totalMeals: { type: 'number' as const, minimum: 1 },
  },
  required: ['generatedAt', 'dietKey', 'totalDays', 'totalMeals'] as const,
  additionalProperties: false,
};

/** Root: requestId, days (array of Day), optional metadata */
const mealPlanResponseDef = {
  type: 'object' as const,
  properties: {
    requestId: { type: 'string' as const },
    days: {
      type: 'array' as const,
      items: { $ref: '#/definitions/Day' as const },
    },
    metadata: { $ref: '#/definitions/Metadata' as const },
  },
  required: ['requestId', 'days'] as const,
  additionalProperties: false,
};

/**
 * Returns a JSON schema for MealPlanResponse that stays within Gemini’s
 * maximum nesting depth by using $ref for nested types.
 * Root is the schema object itself (not a $ref) so Gemini does not report
 * "reference to undefined schema at top-level".
 */
export function getMealPlanResponseJsonSchemaForGemini(): GeminiMealPlanResponseJsonSchema {
  return {
    ...mealPlanResponseDef,
    definitions: {
      Day: dayDef,
      Meal: mealDef,
      IngredientRef: ingredientRefDef,
      Ingredient: ingredientDef,
      EstimatedMacros: estimatedMacrosDef,
      Metadata: metadataDef,
    },
  };
}
