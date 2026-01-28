# Clinical Dietary Logic Engine

A strict validation system for therapeutic diets with hard guard rails for chronic disease management.

## Overview

This system validates ingredients and recipes against specific therapeutic diet protocols:

- **Wahls Paleo** - For MS and autoimmune conditions
- **Overcoming MS (OMS)** - Plant-based protocol for MS
- **Autoimmune Protocol (AIP)** - Elimination diet for autoimmune conditions
- **Specific Carbohydrate Diet (SCD)** - Monosaccharide-only protocol for IBD
- **Low Histamine** - Histamine-restricted protocol

## Key Features

### Strict Guard Rails

- **Forbidden Lists**: Hard prohibitions that trigger "VIOLATION" alerts
- **Required Lists**: Mandatory inclusions that trigger "INCOMPLETE" alerts
- **No Gray Areas**: Strict binary validation - either compliant or not

### Safety Status

- **SAFE**: Recipe is fully compliant with all guard rails
- **DANGER**: Recipe contains strictly forbidden items
- **INCOMPLETE**: Recipe lacks required therapeutic components

## Usage

### Validate a Recipe

```typescript
import { validateRecipeAction } from '@/src/app/(app)/diet-validation/actions/validation.actions';
import type { RecipeInput } from '@/src/lib/diet-validation/validation-engine';

const recipe: RecipeInput = {
  name: 'Breakfast Bowl',
  ingredients: [
    { name: 'spinach', amount: 2, unit: 'cups' },
    { name: 'broccoli', amount: 1, unit: 'cup' },
    { name: 'carrot', amount: 1, unit: 'cup' },
    { name: 'chicken', amount: 150, unit: 'g' },
  ],
  totalMacros: {
    saturatedFat: 5,
  },
};

const result = await validateRecipeAction(recipe);
// Returns: { data: RecipeValidationResult } or { error: string }
```

### Validate a Single Ingredient

```typescript
import { validateIngredientAction } from '@/src/app/(app)/diet-validation/actions/validation.actions';

const ingredient = {
  name: 'tomato',
  category: 'nightshades',
};

const result = await validateIngredientAction(ingredient);
// Returns: { data: IngredientValidationResult } or { error: string }
```

### Example: Wahls Paleo Validation

```typescript
const wahlsRecipe: RecipeInput = {
  ingredients: [
    { name: 'spinach', amount: 3, unit: 'cups' }, // Leafy
    { name: 'broccoli', amount: 3, unit: 'cups' }, // Sulfur
    { name: 'carrot', amount: 3, unit: 'cups' }, // Colored
    { name: 'liver', amount: 100, unit: 'g' }, // Required organ meat
    { name: 'kelp', amount: 10, unit: 'g' }, // Required seaweed
  ],
};

const result = await validateRecipeAction(wahlsRecipe, wahlsPaleoDietId);

if (result.data) {
  console.log(result.data.status); // "safe" | "danger" | "incomplete"
  console.log(result.data.violations); // Array of violation messages
  console.log(result.data.incompletes); // Array of incomplete messages
  console.log(result.data.summary); // Human-readable summary
}
```

### Example: OMS Validation

```typescript
const omsRecipe: RecipeInput = {
  ingredients: [
    { name: 'flaxseed_oil', amount: 30, unit: 'ml' }, // Required
    { name: 'quinoa', amount: 100, unit: 'g' },
    { name: 'vegetables', amount: 200, unit: 'g' },
  ],
  totalMacros: {
    saturatedFat: 8, // Must be < 10g
  },
};

const result = await validateRecipeAction(omsRecipe, omsDietId);
```

### Example: AIP Validation

```typescript
const aipRecipe: RecipeInput = {
  ingredients: [
    { name: 'bone_broth', amount: 250, unit: 'ml' },
    { name: 'wild_salmon', amount: 150, unit: 'g' },
    { name: 'sweet_potato', amount: 200, unit: 'g' },
    // ❌ Would fail: { name: "tomato" } - nightshade
    // ❌ Would fail: { name: "almond" } - nuts
    // ❌ Would fail: { name: "egg" } - eggs
  ],
};

const result = await validateRecipeAction(aipRecipe, aipDietId);
```

### Example: Low Histamine Validation

```typescript
const lowHistamineRecipe: RecipeInput = {
  ingredients: [
    { name: 'fresh_chicken', freshness: 'fresh', amount: 150, unit: 'g' },
    { name: 'fresh_vegetables', freshness: 'fresh', amount: 200, unit: 'g' },
    // ❌ Would fail: { name: "leftover_chicken", freshness: "leftover", ageHours: 30 }
    // ❌ Would fail: { name: "tomato" } - high histamine
    // ❌ Would fail: { name: "aged_cheese" } - high histamine
  ],
};

const result = await validateRecipeAction(
  lowHistamineRecipe,
  lowHistamineDietId,
);
```

## Validation Rules by Diet

### Wahls Paleo

- **Forbidden**: All grains, all dairy, all legumes, processed sugar
- **Required**: Organ meats (liver/heart) 2x weekly, Seaweed/kelp daily
- **Algorithm**: 9 cups vegetables (3 leafy, 3 sulfur, 3 colored)

### Overcoming MS (OMS)

- **Forbidden**: Meat (red/white), Dairy, Egg yolks
- **Required**: 20-40ml Flaxseed oil daily
- **Limit**: Saturated fat < 10g per day

### Autoimmune Protocol (AIP)

- **Forbidden**: Grains, Dairy, Legumes, Nightshades, Nuts, Seeds, Eggs, Alcohol
- **Focus**: High nutrient density (bone broth, wild fish)

### Specific Carbohydrate Diet (SCD)

- **Forbidden**: All starches, all grains, potatoes, corn, soy, commercial yogurt
- **Allowed**: Only monosaccharides, Honey (only sweetener)
- **Permitted**: Most fruits/veggies (non-starchy)

### Low Histamine

- **Forbidden**: Fermented foods, Aged cheese, Canned fish, Spinach, Tomatoes, Shellfish
- **Freshness**: Leftovers > 24h forbidden, Meat must be fresh or flash-frozen

## API Reference

### `validateRecipeAction(recipe, dietTypeId?)`

Validates a complete recipe against the user's diet (or specified diet).

**Parameters:**

- `recipe: RecipeInput` - Recipe to validate
- `dietTypeId?: string` - Optional diet type ID (uses user's active diet if not provided)

**Returns:** `ActionResult<RecipeValidationResult>`

### `validateIngredientAction(ingredient, dietTypeId?)`

Validates a single ingredient against the user's diet.

**Parameters:**

- `ingredient: IngredientInput` - Ingredient to validate
- `dietTypeId?: string` - Optional diet type ID

**Returns:** `ActionResult<IngredientValidationResult>`

### `validateIngredientsAction(ingredients, dietTypeId?)`

Validates multiple ingredients at once.

**Parameters:**

- `ingredients: IngredientInput[]` - Array of ingredients
- `dietTypeId?: string` - Optional diet type ID

**Returns:** `ActionResult<IngredientValidationResult[]>`

## Types

### `RecipeInput`

```typescript
{
  name?: string;
  ingredients: IngredientInput[];
  totalMacros?: {
    carbs?: number;
    saturatedFat?: number;
    protein?: number;
  };
}
```

### `IngredientInput`

```typescript
{
  name: string;
  category?: string;
  amount?: number;
  unit?: string;
  macros?: {
    carbs?: number;
    saturatedFat?: number;
    protein?: number;
  };
  freshness?: "fresh" | "frozen" | "leftover" | "aged" | "cured";
  ageHours?: number; // For leftovers
}
```

### `RecipeValidationResult`

```typescript
{
  status: "safe" | "danger" | "incomplete";
  violations: string[];      // Hard violations (DANGER)
  incompletes: string[];     // Missing requirements (INCOMPLETE)
  warnings: string[];         // Soft warnings
  ingredientResults: IngredientValidationResult[];
  summary: string;            // Human-readable summary
}
```

## Database Schema

Therapeutic diets are stored in the `diet_types` table with associated rules in `diet_rules`. Rules have:

- `rule_type`: Type of rule (exclude_ingredient, require_ingredient, macro_constraint, meal_structure)
- `rule_key`: Specific rule identifier
- `rule_value`: JSONB containing rule parameters
- `priority`: Rule priority (higher = stricter guard rail)

Run the migration to add therapeutic diets:

```bash
supabase migration up
```
