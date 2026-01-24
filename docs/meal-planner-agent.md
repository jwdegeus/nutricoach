# Meal Planner Agent

Technical documentation for the Meal Planning Agent that generates personalized meal plans using Google Gemini AI with structured output and strict validation.

## Overview

The Meal Planner Agent is a service that:
- Takes user preferences from onboarding (via `DietProfile`)
- Derives strict guard rails (`DietRuleSet`) from the profile
- Generates meal plans using Gemini AI with schema-enforced JSON output
- Validates all inputs and outputs using Zod schemas

## Architecture

### Components

1. **GeminiClient** (`src/lib/ai/gemini/gemini.client.ts`)
   - Server-only wrapper for Google Gemini API
   - Handles API key management and model configuration
   - Provides `generateJson()` method for structured JSON output
   - **Model Selection Policy**: Selects model based on purpose ("plan", "enrich", "repair")
     - `GEMINI_MODEL_PLAN` (default: "gemini-2.0-flash-exp") - For meal plan generation
     - `GEMINI_MODEL_ENRICH` (default: "gemini-2.0-flash-exp") - For enrichment
     - `GEMINI_MODEL_HIGH_ACCURACY` (default: "gemini-1.5-pro-002") - For repair attempts (production-ready, high accuracy)
   - **Cost Controls**: Configurable `maxOutputTokens` (default: 2048, via `GEMINI_MAX_OUTPUT_TOKENS`)

2. **MealPlannerAgentService** (`src/lib/agents/meal-planner/mealPlannerAgent.service.ts`)
   - Main service class for generating meal plans
   - **Always derives guard rails from DietProfile** (never trusts pre-computed rule sets)
   - Orchestrates validation, prompt building, API calls, and response validation
   - Implements **repair loop**: automatically attempts one repair if output is invalid
   - Handles errors gracefully with context (without exposing sensitive data)
   - **Stap 15**: `generateMeal()` method for slot-only meal generation with validation and repair

3. **Hard Constraint Validator** (`src/lib/agents/meal-planner/mealPlannerAgent.validate.ts`)
   - Validates generated meal plans against hard constraints
   - Checks for forbidden ingredients, allergens, disliked ingredients, and missing required categories
   - **Validates NEVO codes** - ensures all ingredient references use valid NEVO codes from database
   - **Validates macro targets** - calculates actual macros from NEVO data and checks against hard calorie/macro constraints
   - Returns structured validation issues with paths and error codes

4. **NEVO Tools** (`src/lib/agents/meal-planner/mealPlannerAgent.tools.ts`)
   - Server-side tools for NEVO ingredient lookup and macro calculation
   - `searchNevoFoodCandidates()` - searches NEVO database for candidate ingredients
   - `calcMealMacros()` - calculates macros for a meal based on NEVO codes and quantities
   - `calcDayMacros()` - calculates total macros for a day
   - `buildCandidatePool()` - builds structured candidate pool by category (proteins, vegetables, fruits, fats, carbs)
   - `verifyNevoCode()` - verifies that a NEVO code exists in the database

5. **Repair Prompt Builder** (`src/lib/agents/meal-planner/mealPlannerAgent.repair.ts`)
   - Builds prompts for repairing malformed or invalid outputs
   - Instructs Gemini to fix JSON parse errors, schema violations, and constraint violations
   - Maintains original request context and hard constraints

6. **Server Action** (`src/app/(app)/menus/actions/generateMealPlan.action.ts`)
   - App-layer wrapper for the meal planner service
   - Provides structured error handling with `VALIDATION_ERROR` and `AGENT_ERROR` codes
   - Returns `{ ok: true, data }` or `{ ok: false, error }` pattern

7. **API Route** (`src/app/api/v1/meal-plans/generate/route.ts`)
   - HTTP endpoint for smoke testing
   - POST-only, returns JSON responses
   - Maps server action results to HTTP status codes

8. **Prompt Builder** (`src/lib/agents/meal-planner/mealPlannerAgent.prompts.ts`)
   - Builds comprehensive prompts that explicitly distinguish hard vs soft constraints
   - Formats diet rules, calorie targets, and preferences for the AI
   - **Includes candidate pool** - provides agent with list of available NEVO ingredients to choose from
   - Ensures the AI understands the strict requirements and can only use ingredients from the candidate pool
   - **Stap 15**: `buildMealPrompt()` for slot-only meal generation with minimal-change support

9. **MealPlannerEnrichmentService** (`src/lib/agents/meal-planner/mealPlannerEnrichment.service.ts`)
   - Enriches meal plans with titles, instructions, and cook plans
   - Ensures no new ingredients are added - only uses ingredients from the plan
   - **Stap 15**: `enrichMeal()` method for meal-scoped enrichment refresh

10. **Plan Chat Service** (`src/lib/agents/meal-planner/planChat.service.ts`)
    - Handles chat/composer interactions
    - Uses Gemini structured output to generate PlanEdit objects
    - **Stap 15**: Loads pantry context and includes it in prompts for more realistic suggestions

## Input/Output Contract

### Input: `MealPlanRequest`

```typescript
{
  dateRange: { start: "2026-01-25", end: "2026-01-31" },
  slots: ["breakfast", "lunch", "dinner"],
  profile: DietProfile, // User's diet profile from onboarding (source of truth)
  excludeIngredients?: string[],
  preferIngredients?: string[],
  maxPrepTime?: number
}
```

**Important**: The `profile` field is the source of truth. Guard rails (`DietRuleSet`) are **always derived** from the profile inside the service using `deriveDietRuleSet()`. This ensures consistency and security - we never trust pre-computed rule sets from input.

Validated via `mealPlanRequestSchema` (Zod).

### Output: `MealPlanResponse`

```typescript
{
  requestId: string,
  days: MealPlanDay[],
  metadata?: {
    generatedAt: string,
    dietKey: DietKey,
    totalDays: number,
    totalMeals: number
  }
}
```

**Meal Structure (New Contract):**
Each meal now includes `ingredientRefs` (required) with NEVO codes:

```typescript
{
  id: string,
  name: string,
  slot: "breakfast" | "lunch" | "dinner" | "snack",
  date: string, // YYYY-MM-DD
  ingredientRefs: [
    {
      nevoCode: string, // NEVO code from candidate pool
      quantityG: number, // Amount in grams (min 1)
      displayName?: string, // Optional display name
      tags?: string[] // Optional categorization tags
    }
  ],
  estimatedMacros?: { // Informative only - actual calculation happens server-side
    calories?: number,
    protein?: number,
    carbs?: number,
    fat?: number,
    saturatedFat?: number
  },
  prepTime?: number,
  servings?: number
}
```

**Important**: 
- All ingredients must use `nevoCode` values from the candidate pool provided to the agent
- Macros are calculated server-side from NEVO data, not by the LLM
- The `estimatedMacros` field is informative only and may be removed in future versions

Validated via `mealPlanResponseSchema` (Zod).

## Environment Variables

Required in `.env.local`:

```bash
# Google Gemini API Key (required)
GEMINI_API_KEY=your-api-key-here

# Gemini Model (optional, defaults to "gemini-2.0-flash-exp")
GEMINI_MODEL=gemini-2.0-flash-exp
```

### Getting an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Add it to your `.env.local` file

## How to Call

### Option 1: Server Action (Recommended for App Usage)

Use the server action wrapper for app-layer integration:

```typescript
import { generateMealPlanAction } from "@/src/app/(app)/menus/actions/generateMealPlan.action";
import type { DietProfile } from "@/src/lib/diets";

// Get user's diet profile (from onboarding/database)
const profile: DietProfile = {
  dietKey: "wahls_paleo_plus",
  allergies: ["nuts"],
  dislikes: ["mushrooms"],
  calorieTarget: { target: 2000 },
  prepPreferences: { maxPrepMinutes: 30 },
  // ... other fields
};

// Create request
const request = {
  dateRange: { start: "2026-01-25", end: "2026-01-31" },
  slots: ["breakfast", "lunch", "dinner"],
  profile: profile, // Pass profile directly - rules are derived inside
};

// Call server action
const result = await generateMealPlanAction(request);

if (result.ok) {
  console.log("Meal plan:", result.data);
} else {
  console.error("Error:", result.error.message);
  // result.error.code is either "VALIDATION_ERROR" or "AGENT_ERROR"
}
```

### Option 2: Direct Service Call (For Internal Use)

For direct service access (e.g., in other server-side code):

```typescript
import { MealPlannerAgentService } from "@/src/lib/agents/meal-planner";
import type { DietProfile } from "@/src/lib/diets";

const profile: DietProfile = {
  dietKey: "wahls_paleo_plus",
  allergies: ["nuts"],
  dislikes: ["mushrooms"],
  calorieTarget: { target: 2000 },
  prepPreferences: { maxPrepMinutes: 30 },
  // ... other fields
};

const request = {
  dateRange: { start: "2026-01-25", end: "2026-01-31" },
  slots: ["breakfast", "lunch", "dinner"],
  profile: profile,
};

const service = new MealPlannerAgentService();
const response = await service.generateMealPlan(request);
```

### Option 3: API Route (For Smoke Testing)

The API route is intended for **smoke testing** and internal use only. It's not meant for production client-side calls.

```bash
curl -X POST http://localhost:3000/api/v1/meal-plans/generate \
  -H "Content-Type: application/json" \
  -d '{
    "dateRange": {
      "start": "2026-01-25",
      "end": "2026-01-31"
    },
    "slots": ["breakfast", "lunch", "dinner"],
    "profile": {
      "dietKey": "wahls_paleo_plus",
      "allergies": ["nuts"],
      "dislikes": ["mushrooms"],
      "calorieTarget": { "target": 2000 },
      "prepPreferences": { "maxPrepMinutes": 30 }
    }
  }'
```

**Response codes:**
- `200 OK`: Success, returns `{ ok: true, data: MealPlanResponse }`
- `400 Bad Request`: Validation error, returns `{ ok: false, error: { code: "VALIDATION_ERROR", message: "..." } }`
- `500 Internal Server Error`: Agent error, returns `{ ok: false, error: { code: "AGENT_ERROR", message: "..." } }`

**Note**: The API route has no authentication in this implementation. Add authentication if exposing to production.

### Error Handling

The service throws descriptive errors for:
- Invalid input (Zod validation fails)
- API errors (Gemini API fails)
- Malformed JSON (parsing fails after repair attempt)
- Schema violations (output doesn't match expected schema after repair attempt)
- Hard constraint violations (diet rules violated after repair attempt)

All errors exclude sensitive data (API keys, full prompts).

### Repair Loop

The service implements a **single repair attempt** for robustness:

1. **Initial Generation**: Generate meal plan with temperature 0.4
2. **Validation**: Parse JSON, validate schema, check hard constraints
3. **If Valid**: Return immediately
4. **If Invalid**: Attempt one repair:
   - Build repair prompt with original prompt, bad output, and issues
   - Call Gemini API with lower temperature (0.2) for more deterministic output
   - Re-validate: parse JSON, validate schema, check hard constraints
   - If valid: return repaired meal plan
   - If still invalid: throw error with all issues

**Repair triggers on:**
- JSON parse failures
- Schema validation failures (Zod)
- Hard constraint violations (forbidden ingredients, allergens, missing required categories)

**Repair does NOT trigger on:**
- Soft constraint violations (these are preferences, not requirements)
- API errors (network issues, rate limits, etc.)

### Partial Regenerate (Day-Only)

**Single-Day Generation:**
- `MealPlannerAgentService.generateMealPlanDay()` generates meals for one specific date only
- Uses focused prompt (`buildMealPlanDayPrompt`) that instructs LLM to generate only the requested day
- **Minimal-change objective**: If `existingDay` is provided, the prompt instructs the LLM to:
  - Preserve existing ingredients (nevoCodes) wherever possible
  - Only adjust `quantityG` values to meet macro/calorie targets if needed
  - Only replace ingredients if they violate hard constraints or are needed for required categories
  - Prefer ingredients from the existing list over new ones

**Benefits:**
- **Cost reduction**: Only generates one day instead of full week (1 LLM call vs 1 full plan call)
- **Stability**: Minimizes changes to existing plan, preserving user's shopping list
- **Speed**: Faster generation for single-day updates

**Usage in MealPlansService:**
- When `regeneratePlanForUser()` is called with `onlyDate`:
  - Loads existing plan and finds the day to regenerate
  - Calls `generateMealPlanDay()` with existing day for minimal-change
  - Replaces only that day in the plan snapshot
  - No full plan regeneration needed

**Tradeoffs:**
- May produce suboptimal recipes compared to full plan generation (but more stable)
- Less variety across the week (but preserves user's existing choices)
- Still respects all hard constraints and macro targets

### Deterministic Macro Adjustment

**Quantity Scaling:**
- Before repair attempts, if only macro issues exist (no ingredient/constraint violations), the system attempts deterministic quantity adjustment
- `adjustDayQuantitiesToTargets()` scales all ingredient quantities proportionally to meet calorie/macro targets
- **No LLM call required** - pure mathematical scaling

**Implementation:**
- Calculates current macros via `calcDayMacros()` (uses NEVO data)
- Determines scale factor based on calorie target: `scaleFactor = targetMid / currentCalories`
- Clamps scale factor to bounds (default: 0.7 to 1.3 = ±30% max change)
- Applies scaling to all `quantityG` values proportionally
- Rounds to nearest 5g for practical quantities (minimum 1g)
- Re-validates adjusted day to ensure all constraints still met

**Scale Bounds:**
- **Default maxScale**: 1.3 (30% increase max)
- **Default minScale**: 0.7 (30% decrease max)
- **Rounding**: Nearest 5g (e.g., 127g → 125g, 128g → 130g)
- **Minimum**: 1g per ingredient (never scales to zero)

**Why These Bounds:**
- 30% change is significant but not drastic (preserves recipe character)
- 5g rounding is practical for cooking (most recipes don't need gram-level precision)
- Prevents extreme scaling that would make recipes unrecognizable

**Flow:**
1. Generate day (LLM call)
2. Validate constraints
3. If only macro issues: attempt deterministic adjustment
4. If adjustment fixes all issues: return (no repair call needed)
5. If adjustment helps but issues remain: continue with repair attempt
6. If non-macro issues exist: skip adjustment, go directly to repair

**Benefits:**
- Reduces LLM calls for simple macro adjustments (common case)
- Faster response time (no repair call needed for macro-only issues)
- More stable output (deterministic scaling vs LLM variability)

### Hard Constraint Validation

After generation, the meal plan is validated against hard constraints:

**Validated Constraints:**
1. **Allergens**: Ingredients matching user allergies (case-insensitive substring match on displayName)
2. **Dislikes**: Ingredients matching user dislikes (case-insensitive substring match on displayName)
3. **Forbidden Ingredients**: Ingredients forbidden by diet rules (from `ingredientConstraints` with `constraintType: "hard"`)
4. **Required Categories**: Required categories from diet rules (e.g., organ meats for Wahls) must be present
5. **NEVO Code Validation**: All `nevoCode` values must exist in the NEVO database (verified via `verifyNevoCode()`)
6. **Macro Target Validation**: If hard calorie/macro constraints are specified, actual macros are calculated from NEVO data and validated:
   - Daily calorie targets (min/max)
   - Daily macro targets (min protein, min fat, max carbs) for hard constraints only

**Validation Method:**
- **NEVO Code Validation**: Direct database lookup to verify codes exist
- **Macro Calculation**: Uses `calcDayMacros()` to calculate actual macros from NEVO data
- Case-insensitive substring matching on ingredient displayNames (if provided)
- Tag-based matching (if ingredients have `tags` array)
- Per-day validation for required categories and macro targets

**Validation Issues:**
Each issue includes:
- `path`: JSON path to the problematic ingredient/meal/day (e.g., `"days[0].meals[0].ingredientRefs[2]"` or `"days[0]"`)
- `code`: Error code:
  - `FORBIDDEN_INGREDIENT` - Ingredient forbidden by diet rules
  - `ALLERGEN_PRESENT` - Ingredient matches user allergy
  - `DISLIKED_INGREDIENT` - Ingredient in user's dislikes list
  - `MISSING_REQUIRED_CATEGORY` - Required category not found in day
  - `INVALID_NEVO_CODE` - NEVO code not found in database
  - `CALORIE_TARGET_MISS` - Day calories outside hard target range
  - `MACRO_TARGET_MISS` - Day macros outside hard target range
- `message`: Human-readable error message

## NEVO Integration

### Candidate Pool

Before generating a meal plan, the service builds a **candidate pool** of available ingredients from the NEVO database:

1. **Category-based Search**: Searches NEVO database for candidate foods in different categories:
   - Proteins (diet-aware: vegan uses plant proteins, others use animal + plant)
   - Vegetables
   - Fruits
   - Fats (olive oil, avocado, nuts, etc.)
   - Carbs (excluded for keto/Wahls, included for other diets)

2. **Diet-aware Filtering**: Candidate pool is filtered based on:
   - Diet type (keto excludes carbs, vegan excludes animal products, etc.)
   - User allergies (excluded from pool)
   - User dislikes (excluded from pool)
   - Additional exclusions from request

3. **Caching**: Candidate pools are cached in-memory for 10 minutes to reduce database queries for repeated requests with same diet/exclusions.

4. **Prompt Integration**: The candidate pool is included in the prompt, instructing the agent to:
   - Use ONLY ingredients from the candidate pool
   - Use exact `nevoCode` values provided
   - Not invent or guess NEVO codes

### Macro Calculation

Macros are calculated server-side using NEVO data:

1. **Per-Ingredient**: Each ingredient's macros are calculated from NEVO data based on `nevoCode` and `quantityG`
2. **Per-Meal**: Meal macros are aggregated from all ingredient macros
3. **Per-Day**: Day macros are aggregated from all meal macros
4. **Validation**: Hard macro/calorie constraints are validated against calculated values (not LLM estimates)

**Important**: The LLM may provide `estimatedMacros` in the output, but these are informative only. Actual validation uses server-side calculations from NEVO data.

## Shopping List & Pantry Coverage

### Overview

After generating a meal plan, you can calculate pantry coverage and generate shopping lists based on the `ingredientRefs` in the plan.

### Components

1. **MealPlannerShoppingService** (`src/lib/agents/meal-planner/mealPlannerShopping.service.ts`)
   - Calculates pantry coverage per meal and per day
   - Generates aggregated shopping lists grouped by category
   - Enriches ingredients with NEVO data (name, category, tags)
   - Read-only service (no database writes)

### Input/Output Contracts

#### Input

```typescript
{
  plan: MealPlanResponse, // Generated meal plan with ingredientRefs
  pantry?: PantryAvailability[] // Optional pantry data (if not provided, all items marked as missing)
}
```

#### Output: `MealPlanCoverage`

```typescript
{
  days: [
    {
      date: "2026-01-25",
      mealSlot: "breakfast",
      mealTitle?: "Omelet met groente",
      ingredients: [
        {
          nevoCode: "123",
          name: "Kipfilet",
          requiredG: 150,
          availableG: 0,
          missingG: 150,
          inPantry: false,
          tags?: ["protein"]
        }
      ]
    }
  ],
  totals: {
    requiredG: 2500,
    missingG: 1800,
    coveragePct: 28.0
  }
}
```

#### Output: `ShoppingListResponse`

```typescript
{
  groups: [
    {
      category: "Eiwit",
      items: [
        {
          nevoCode: "123",
          name: "Kipfilet",
          requiredG: 500,
          availableG: 200,
          missingG: 300,
          category: "Eiwit",
          tags?: ["protein"]
        }
      ]
    },
    {
      category: "Groente",
      items: [...]
    }
  ],
  totals: {
    items: 15,
    requiredG: 2500,
    missingG: 1800
  }
}
```

### Pantry Availability

The service supports two pantry models:

1. **Quantity-based**: `{ nevoCode: "123", availableG: 200 }`
   - Uses exact quantity in grams
   - `missingG = max(requiredG - availableG, 0)`

2. **Binary**: `{ nevoCode: "123", isAvailable: true }`
   - If `isAvailable === true`: treated as "sufficient" (missingG = 0)
   - If `isAvailable === false` or undefined: not available (availableG = 0)

**Current Implementation**: 
- Placeholder adapter returns empty array (no items in pantry)
- Service works correctly with empty pantry (all items marked as missing)
- TODO: Replace `loadPantryAvailabilityByNevoCodes()` with actual pantry lookup when pantry/inventory system is implemented

### Coverage Calculation

1. **Per-Ingredient**: For each `ingredientRef` in each meal:
   - `requiredG` = `quantityG` from ingredientRef
   - `availableG` = from pantry (or 0 if not in pantry)
   - `missingG` = `max(requiredG - availableG, 0)`
   - `inPantry` = `availableG > 0`

2. **Per-Meal**: Aggregates all ingredients in a meal

3. **Per-Day**: Aggregates all meals in a day

4. **Totals**: Aggregates across entire plan
   - `coveragePct` = `round((requiredG - missingG) / requiredG * 100, 1)`

### Shopping List Generation

1. **Aggregation**: Collects all `ingredientRefs` across all meals/days and sums `quantityG` per `nevoCode`

2. **Enrichment**: For each unique `nevoCode`:
   - Fetches NEVO food data (with caching)
   - Derives `name` from `name_nl` or `name_en`
   - Derives `category` from `food_group_nl` (mapped to: Eiwit, Groente, Fruit, Vetten, Koolhydraten, or original group name)
   - Uses `tags` from ingredientRef if available

3. **Grouping**: Groups items by `category` (defaults to "Overig" if no category)

4. **Sorting**: 
   - Groups sorted alphabetically by category
   - Items within groups sorted alphabetically by name

### Usage Example

```typescript
import { MealPlannerShoppingService } from "@/src/lib/agents/meal-planner";
import type { MealPlanResponse } from "@/src/lib/diets";

const service = new MealPlannerShoppingService();

// Build coverage
const coverage = await service.buildCoverage({
  plan: mealPlanResponse,
  // pantry: [...] // Optional - if not provided, all items marked as missing
});

// Build shopping list
const shoppingList = await service.buildShoppingList({
  plan: mealPlanResponse,
  // pantry: [...] // Optional
});
```

### Pantry Persistence

The shopping service now integrates with a real pantry/inventory system stored in the database.

#### Database Schema

**Table: `pantry_items`**
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to `auth.users.id`)
- `nevo_code` (TEXT, NEVO code)
- `available_g` (NUMERIC, nullable) - Quantity in grams (NULL means "binary available")
- `is_available` (BOOLEAN) - Binary availability flag
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Constraints:**
- Unique constraint on `(user_id, nevo_code)` - one pantry item per user per NEVO code
- Indexes on `user_id` and `nevo_code` for fast lookups

**RLS Policies:**
- Users can only view/insert/update/delete their own pantry items
- All policies use `auth.uid() = user_id` check

#### Pantry Models

The system supports both pantry models:

1. **Quantity-based**: `available_g` contains exact quantity in grams
2. **Binary**: `available_g` is NULL and `is_available` is true/false

#### Usage

**With Pantry (Recommended):**
```typescript
import { MealPlannerShoppingService } from "@/src/lib/agents/meal-planner";

const service = new MealPlannerShoppingService();

// Automatically loads pantry for user
const coverage = await service.buildCoverageWithPantry(mealPlan, userId);
const shoppingList = await service.buildShoppingListWithPantry(mealPlan, userId);
```

**Without Pantry (Backward Compatible):**
```typescript
// Still works - all items marked as missing
const coverage = await service.buildCoverage({ plan: mealPlan });
const shoppingList = await service.buildShoppingList({ plan: mealPlan });
```

#### Server Actions

Pantry items can be managed via server actions:

```typescript
import {
  loadPantryAvailabilityAction,
  upsertPantryItemAction,
  bulkUpsertPantryItemsAction,
} from "@/src/app/(app)/pantry/actions/pantry.actions";

// Load pantry availability
const result = await loadPantryAvailabilityAction(["123", "456"]);

// Upsert single item
await upsertPantryItemAction({
  nevoCode: "123",
  availableG: 500,
  isAvailable: true,
});

// Bulk upsert
await bulkUpsertPantryItemsAction({
  items: [
    { nevoCode: "123", availableG: 500 },
    { nevoCode: "456", isAvailable: true },
  ],
});
```

### Known Limitations

1. **Category Mapping**: Simple keyword-based mapping from `food_group_nl` to categories. May not cover all food groups perfectly.

2. **Binary vs Quantity Pantry**: Service handles both models, but actual pantry system may only support one model.

3. **Caching**: NEVO food lookups are cached in-memory (10 min TTL) but not persisted across server restarts.

4. **No Pantry Sync Flows**: No automatic sync with shopping lists or meal plan updates yet.

## Meal Plan Persistence

Meal plans are now persisted in the database with full snapshots of request, rules, and generated plan data. This enables history, regeneration, and shopping list views for persisted plans.

### Database Schema

**Table: `meal_plans`**
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to `auth.users.id`)
- `diet_key` (TEXT) - Diet type identifier
- `date_from` (DATE) - Start date of meal plan
- `days` (INTEGER) - Number of days in plan
- `request_snapshot` (JSONB) - Full MealPlanRequest snapshot (includes profile)
- `rules_snapshot` (JSONB) - DietRuleSet snapshot
- `plan_snapshot` (JSONB) - MealPlanResponse (generated plan)
- `enrichment_snapshot` (JSONB, nullable) - MealPlanEnrichmentResponse (optional, for future use)
- `created_at`, `updated_at` (TIMESTAMPTZ)

**Indexes:**
- `user_id` - Fast user lookups
- `(user_id, date_from)` - Fast date range queries
- `created_at DESC` - Fast history listing

**RLS Policies:**
- Users can only view/insert/update/delete their own meal plans
- All policies use `auth.uid() = user_id` check

**Table: `meal_plan_runs` (Observability)**
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key to `auth.users.id`)
- `meal_plan_id` (UUID, nullable, foreign key to `meal_plans.id`)
- `run_type` (TEXT) - "generate" | "regenerate" | "enrich"
- `model` (TEXT) - Model name (e.g., "gemini-2.0-flash-exp")
- `status` (TEXT) - "running" | "success" | "error"
- `duration_ms` (INTEGER) - Generation duration in milliseconds
- `error_code` (TEXT, nullable) - Error code if failed (e.g., "VALIDATION_ERROR", "AGENT_ERROR", "RATE_LIMIT", "CONFLICT")
- `error_message` (TEXT, nullable) - Short error message (no prompts or sensitive data)
- `created_at` (TIMESTAMPTZ)

**Indexes:**
- `user_id` - Fast user lookups
- `meal_plan_id` - Fast plan lookups
- `created_at DESC` - Fast history queries
- `status` - Error analysis

**RLS Policies:**
- Users can only view/insert their own run logs
- Users can update their own run logs (for status updates from "running" to "success"/"error")
- No DELETE policy (runs are immutable for audit trail)

### Profile Loading

The system loads real user profiles from the database instead of using demo profiles:

**ProfileService** (`src/lib/profile/profile.service.ts`):
- Loads `user_preferences` and `user_diet_profiles` tables
- Maps database schema to `DietProfile` type:
  - `diet_type_id` → `dietKey` (via `diet_types.name` mapping)
  - `strictness` (1-10) → `"strict" | "flexible"`
  - `variety_window_days` → `varietyLevel` ("low" | "std" | "high")
  - `kcal_target` → `calorieTarget`
- Validates with `dietProfileSchema` before returning
- Throws error if onboarding not completed

### Meal Plans Service

**MealPlansService** (`src/lib/meal-plans/mealPlans.service.ts`):

**Methods:**
- `createPlanForUser(userId, input)` - Creates new meal plan:
  1. Loads DietProfile via ProfileService
  2. Builds MealPlanRequest
  3. Calls MealPlannerAgentService.generateMealPlan()
  4. Persists snapshots to database
  5. Logs run in meal_plan_runs
  6. Returns planId

- `loadPlanForUser(userId, planId)` - Loads persisted meal plan

- `listPlansForUser(userId, limit)` - Lists user's meal plans (newest first)

- `regeneratePlanForUser(userId, input)` - Regenerates plan:
  - **Full regenerate**: Generates new plan for same date range, replaces entire plan_snapshot
  - **Single day regenerate**: Uses `generateMealPlanDay()` to generate only the specified day (not full plan), replaces only that day in plan_snapshot
    - Supports minimal-change objective (preserves existing ingredients where possible)
    - Uses deterministic macro adjustment before repair attempts
  - Reuses `request_snapshot` for consistency (profile from original generation)
  - Validates updated plan with Zod schema
  - Logs run in meal_plan_runs

### Observability

**What we log:**
- Duration (milliseconds)
- Model name (from `GEMINI_MODEL` env var or default)
- Status (success/error)
- Error code and short message (no prompts, no API keys)

**What we don't log:**
- Prompts sent to Gemini API
- API keys or tokens
- Full error stack traces
- User profile details

**Usage:**
```typescript
import { MealPlansService } from "@/src/lib/meal-plans/mealPlans.service";

const service = new MealPlansService();

// Create plan
const { planId } = await service.createPlanForUser(userId, {
  dateFrom: "2026-01-25",
  days: 7,
});

// Load plan
const plan = await service.loadPlanForUser(userId, planId);

// Regenerate full plan
await service.regeneratePlanForUser(userId, { planId });

// Regenerate single day
await service.regeneratePlanForUser(userId, {
  planId,
  onlyDate: "2026-01-27",
});
```

### Server Actions

**Meal Plans Actions** (`src/app/(app)/meal-plans/actions/mealPlans.actions.ts`):

- `createMealPlanAction(input)` - Creates new meal plan
- `regenerateMealPlanAction(input)` - Regenerates plan
- `listMealPlansAction(limit?)` - Lists user's plans
- `loadMealPlanAction(planId)` - Loads specific plan

All actions include authentication checks and structured error handling.

### Shopping View Routes

**Persist-First Approach:**
- `/meal-plans/shopping?fromDate=YYYY-MM-DD&days=N` - Creates new plan and redirects to persisted plan
- `/meal-plans/[planId]/shopping` - Shows shopping list for persisted plan

The shopping view now uses persisted plans instead of generating on-the-fly, enabling:
- History tracking
- Regeneration without losing plan context
- Consistent shopping lists across sessions

### History UI & Regenerate

**Routes:**
- `/meal-plans` - List all meal plans (history view)
- `/meal-plans/[planId]` - Detail page with regenerate actions
- `/meal-plans/[planId]/shopping` - Shopping list for specific plan

**Regenerate Options:**
- **Full regenerate**: Regenerates entire plan with same settings, updates plan in-place
- **Single day regenerate**: Generates only the specified day (not full plan), replaces only that day in plan_snapshot
  - Uses minimal-change objective to preserve existing ingredients
  - Uses deterministic macro adjustment to reduce LLM calls
  - Faster and cheaper than full regenerate

**UI Components:**
- `MealPlansTable` - Lists all plans with links to detail and shopping
- `MealPlanSummary` - Shows plan overview, macros, enrichment status
- `MealPlanActions` - Buttons for full/day regenerate with date selector

### Enrichment Snapshot Lifecycle

**Enrichment is automatically included in create/regenerate flows:**

1. **Create Plan Flow:**
   - Generate meal plan via `MealPlannerAgentService`
   - Attempt enrichment via `MealPlannerEnrichmentService`
   - If enrichment succeeds: store in `enrichment_snapshot`
   - If enrichment fails: store plan without enrichment, log separate "enrich" run with error
   - Plan creation always succeeds even if enrichment fails (pragmatic approach)

2. **Regenerate Flow:**
   - **Full regenerate**: Regenerate entire plan, re-run enrichment
   - **Single day regenerate**: Generate only specified day using `generateMealPlanDay()`, re-run enrichment for updated plan
   - Update `enrichment_snapshot` (or keep existing if enrichment fails)
   - Log enrichment run separately from regenerate run

**Enrichment Failure Handling:**
- Plan operation (create/regenerate) always succeeds
- Enrichment is optional - plan is usable without enrichment
- Separate "enrich" run is logged with error status if enrichment fails
- User can see enrichment status in UI (checkmark if available)

### Error Handling

**Error Codes:**
- `AUTH_ERROR` - Authentication required
- `VALIDATION_ERROR` - Input validation failed
- `DB_ERROR` - Database operation failed
- `AGENT_ERROR` - AI/agent operation failed
- `RATE_LIMIT` - Quota exceeded (end-to-end error code)
- `CONFLICT` - Concurrent operation in progress

**AppError Class:**
- Centralized error handling in `src/lib/errors/app-error.ts`
- Provides typed error codes and safe user-facing messages
- Server actions map AppError to ActionResult error codes
- Safe messages do not expose sensitive data (API keys, prompts, etc.)

### Rate Limiting / Quota

**Quota System:**
- **Limit**: 10 runs per user per hour
- **Applies to**: `generate` and `regenerate` run types (completed runs only)
- **Enforcement**: Server-side check in `MealPlansService.assertWithinQuota()`
- **Error**: Throws `AppError` with `RATE_LIMIT` code (end-to-end, not mapped to `AGENT_ERROR`)

**Implementation:**
- Queries `meal_plan_runs` for runs in last hour
- Counts runs with `run_type IN ('generate', 'regenerate')` and `status IN ('success', 'error')`
- Excludes "running" status to avoid counting incomplete runs
- Throws `AppError("RATE_LIMIT", "Too many requests...")` if count >= 10

**Quota Check Timing:**
- Checked before Gemini API calls (not after)
- Prevents unnecessary API usage when quota exceeded
- Fail-fast approach for better UX

### Concurrency Control

**Concurrency Lock:**
- Prevents multiple simultaneous generate/regenerate operations per user
- Implementation: `MealPlansService.assertNoActiveRun(userId, mealPlanId?)`
- Checks for runs with `status = "running"` in last 10 minutes
- Throws `AppError("CONFLICT", "A generation is already in progress...")` if active run exists

**Running Status:**
- Runs start with `status = "running"` when operation begins
- Updated to `status = "success"` or `status = "error"` when operation completes
- Allows tracking of in-progress operations for concurrency control

### Idempotency

**Idempotent Create:**
- `createPlanForUser()` checks for existing plan with same parameters:
  - `user_id`, `date_from`, `days`, `diet_key`
- If existing plan found, returns existing `planId` without Gemini API call
- Logs a "generate" run with `status = "success"` and `duration_ms = 0` to indicate reuse
- Prevents duplicate plan generation for same user/date range/diet

## UI

### Pantry Management

The pantry UI allows users to manage their ingredient inventory:

**Pantry Page** (`/pantry`):
- Search and add ingredients from NEVO database
- View and edit existing pantry items
- Toggle availability (binary)
- Set quantities in grams (optional)
- Real-time search with debouncing (300ms)

**Components**:
- `PantrySearchAdd` - Search NEVO foods and add to pantry
- `PantryList` - Display all pantry items
- `PantryItemRow` - Edit individual pantry items (availability, quantity)

### Runs Dashboard

**Runs Page** (`/runs`):
- Displays last 50 meal plan runs for current user
- Shows run metadata: date, type, status, model, duration, error code
- Status badges: success (green), running (yellow), error (red)
- Error codes displayed for failed runs
- Useful for diagnostics and debugging (no sensitive data exposed)

**Components**:
- `RunsTable` - Table component displaying run records
- `listRunsAction` - Server action to fetch runs

**Data Shown**:
- `created_at` - When run was created
- `run_type` - "generate" | "regenerate" | "enrich"
- `status` - "running" | "success" | "error"
- `model` - Gemini model used (e.g., "gemini-2.0-flash-exp")
- `duration_ms` - Duration in milliseconds (formatted as "Xs" or "Xm Ys")
- `error_code` - Error code if failed (e.g., "RATE_LIMIT", "CONFLICT", "AGENT_ERROR")

### Shopping List View

**Shopping Page** (`/meal-plans/shopping`):
- Generates meal plan for specified date range (query params: `fromDate`, `days`)
- Calculates shopping list and coverage with real pantry data
- Shows missing ingredients panel with bulk add options
- Displays shopping list grouped by category

**Components**:
- `MissingIngredientsPanel` - Lists missing items with bulk add buttons:
  - "Markeer alles als aanwezig" (binary available)
  - "Zet hoeveelheid op ontbrekend" (quantity-based)
- `ShoppingListView` - Shows shopping list grouped by category with totals

**Route**: `/meal-plans/shopping?fromDate=2026-01-25&days=7`

**Note**: Currently generates a demo meal plan. In production, this should load from persisted menu/plan storage (Stap 10).

### Bulk Add Flow

1. User generates meal plan
2. Shopping list shows missing ingredients
3. User clicks "Markeer alles als aanwezig" or "Zet hoeveelheid op ontbrekend"
4. System bulk upserts pantry items
5. Page refreshes to show updated coverage

## Meal Enrichment

### Overview

After generating a meal plan, you can enrich it with cooking instructions, titles, and cook plans. This is a presentation layer that adds user-friendly cooking guidance without adding new ingredients.

### Components

1. **MealPlannerEnrichmentService** (`src/lib/agents/meal-planner/mealPlannerEnrichment.service.ts`)
   - Enriches meal plans with titles, instructions, and cook plans
   - Uses Gemini AI with structured JSON output
   - Implements repair loop (max 1 attempt)
   - Validates that no new ingredients are added

2. **Enrichment Validator** (`src/lib/agents/meal-planner/mealPlannerEnrichment.validate.ts`)
   - Validates that all enriched meals correspond to plan meals
   - Ensures `ingredientNevoCodesUsed` only contains codes from meal's ingredientRefs
   - Checks time estimates are reasonable
   - Returns structured validation issues

### Input/Output Contracts

#### Input

```typescript
{
  plan: MealPlanResponse, // Generated meal plan with ingredientRefs
  options?: {
    allowPantryStaples?: boolean, // Allow generic pantry items (water, salt, pepper) - default false
    maxInstructionSteps?: number // Max instruction steps - default 8
  }
}
```

#### Output: `MealPlanEnrichmentResponse`

```typescript
{
  meals: [
    {
      date: "2026-01-25",
      mealSlot: "breakfast",
      title: "Omelet met groente",
      instructions: [
        "Snijd de groente in kleine stukjes",
        "Klop de eieren los in een kom",
        "Verhit olie in een pan",
        "Bak de groente 2 minuten",
        "Voeg eieren toe en bak tot gaar"
      ],
      prepTimeMin: 10,
      cookTimeMin: 5,
      servings: 2,
      kitchenNotes: ["Serveer direct warm"],
      ingredientNevoCodesUsed: ["123", "456"] // NEVO codes used in instructions
    }
  ],
  cookPlanDays: [
    {
      date: "2026-01-25",
      steps: [
        "Snijd alle groenten voor lunch en dinner tegelijk (tijdwinst: 15 min)",
        "Bereid lunch eerst (kan koud gegeten worden)",
        "Dinner kan voorbereid worden terwijl lunch staat te marineren"
      ],
      estimatedTotalTimeMin: 60
    }
  ]
}
```

### "No New Ingredients" Constraint

**Critical**: The enrichment service enforces that no new ingredients are added:

1. **Prompt Constraint**: The prompt explicitly instructs Gemini to use ONLY ingredients from the meal's ingredient list
2. **Validation**: The validator checks that `ingredientNevoCodesUsed` only contains codes from the meal's `ingredientRefs`
3. **Pantry Staples**: If `allowPantryStaples === false`, the prompt explicitly forbids mentioning pantry staples (water, salt, pepper, oil) unless they're in the ingredient list

**Validation Checks**:
- `NEW_INGREDIENT`: A NEVO code in `ingredientNevoCodesUsed` is not in the meal's ingredient list
- `UNKNOWN_NEVO_CODE`: A NEVO code doesn't match any ingredient in the plan
- `MISSING_MEAL`: A meal in the plan doesn't have a corresponding enriched meal
- `BAD_TIME_ESTIMATE`: Total time (prep + cook) exceeds 240 minutes

### Usage Example

```typescript
import { MealPlannerEnrichmentService } from "@/src/lib/agents/meal-planner";
import type { MealPlanResponse } from "@/src/lib/diets";

const service = new MealPlannerEnrichmentService();

// Enrich meal plan
const enrichment = await service.enrichPlan(mealPlanResponse, {
  allowPantryStaples: false, // Don't allow generic pantry items
  maxInstructionSteps: 8
});
```

### Known Limitations

1. **Generic Instructions**: Instructions are generic and don't reference specific recipes from a database
2. **No Recipe DB Mapping**: Enrichment doesn't connect to a recipe database - instructions are generated based on ingredients only
3. **Single Repair Attempt**: Only one repair attempt is made - if it fails, the request fails
4. **Text-based Validation**: Validation is based on NEVO codes only, not free text parsing (avoids complexity)

## Known Limitations

### Current Limitations

1. **No Recipe DB Mapping**: Generated meals are "conceptual" - ingredients are not yet mapped to actual recipes
2. **Single Repair Attempt**: Only one repair attempt is made - if it fails, the request fails
3. **Candidate Pool Quality**: Candidate pool search uses simple term matching - may miss relevant ingredients or include irrelevant ones
4. **No Fuzzy Matching**: Ingredient name matching for allergens/dislikes uses basic substring matching
5. **Limited Caching**: Candidate pool caching is in-memory only (not persisted across server restarts)

### Planned Improvements (Next Steps)

1. **Recipe Mapping**: Connect generated meals to actual recipes from the database
2. **Enhanced Candidate Pool**: Improve search quality with better term matching, taxonomy-based categorization
3. **Persistent Caching**: Cache candidate pools in database or Redis for better performance
4. **Tool Calling**: Enable the agent to search recipes, check nutrition data dynamically
5. **Streaming**: Support streaming responses for better UX
6. **Multiple Repair Attempts**: Allow configurable number of repair attempts
7. **Fuzzy Matching**: Better handling of ingredient name variations for allergen/dislike detection

## Composer/Chat Interface

The Composer UI allows users to interactively edit meal plans via a chat interface. Instead of using function calling (which can be unreliable), the system uses structured output: Gemini returns a `PlanEdit` JSON object that conforms to a strict Zod schema, which is then applied using existing services.

### Architecture

**Flow:**
1. User sends chat message → `PlanChatService.handleChat()`
2. Service loads plan and builds context (available dates, meal slots, guardrails)
3. Prompt is built with conversation history and context
4. Gemini generates structured `PlanEdit` JSON (schema-enforced)
5. `PlanEdit` is validated with Zod
6. `applyPlanEdit()` applies the edit using existing services:
   - `MealPlannerAgentService.generateMealPlanDay()` for day regeneration
   - `PantryService.bulkUpsert()` for pantry updates
   - Direct plan_snapshot updates for meal removal
7. Updated plan is persisted to database
8. Assistant reply is generated from edit summary

### PlanEdit Contract

The `PlanEdit` type defines a minimal but useful set of actions:

- **REPLACE_MEAL**: Replace one meal in a plan (requires `date`, `mealSlot`)
- **REGENERATE_DAY**: Regenerate one day (requires `date`)
- **ADD_SNACK**: Add snack/smoothie to a day (requires `date`, `mealSlot`)
- **REMOVE_MEAL**: Remove a meal slot/snack (requires `date`, `mealSlot`)
- **UPDATE_PANTRY**: Mark items as available / set availableG (requires `pantryUpdates`)

Each edit includes:
- `action`: One of the enum values
- `planId`: Plan to edit
- `date`/`mealSlot`: Required for meal/day actions
- `userIntentSummary`: One sentence summary for UI
- `constraints`: Optional overrides (maxPrepMinutes, targetCalories, etc.)
- `pantryUpdates`: For UPDATE_PANTRY action
- `notes`: Optional rationale bullets

### Apply Engine

The `applyPlanEdit()` function safely applies edits:

1. **Loads plan** via `MealPlansService.loadPlanForUser()`
2. **Applies edit per action**:
   - `REGENERATE_DAY`: Uses `generateMealPlanDay()` with existing day for minimal-change
   - `REPLACE_MEAL`: Slot-only generation (Stap 15) - replaces only the specified meal, not the entire day
   - `ADD_SNACK`: Slot-only generation (Stap 15) - adds only the specified snack/meal, not regenerating the day
   - `REMOVE_MEAL`: Removes meal from day, validates plan schema
   - `UPDATE_PANTRY`: Uses `PantryService.bulkUpsert()`
3. **Validates** updated plan with `MealPlanResponseSchema`
4. **Persists** via Supabase (direct update to `plan_snapshot`)
5. **Logs run** in `meal_plan_runs` (run_type: "regenerate")

**Error Handling:**
- Uses `AppError` with appropriate codes (AUTH_ERROR, VALIDATION_ERROR, DB_ERROR, AGENT_ERROR)
- No prompt or API key exposure in errors
- Validates all mutations before persisting

### Chat Prompt

The `buildPlanChatPrompt()` function builds prompts that:

- Include conversation history
- List available dates and meal slots from the plan
- Summarize guardrails (allergies, dislikes, prep limits)
- Instruct Gemini to output exactly one `PlanEdit` JSON object
- Provide action selection rules (e.g., vague requests → REGENERATE_DAY)

### Step 15: Slot-only Generation + Targeted Enrichment + Pantry Context

**Implemented in Stap 15:**

1. **Slot-only generation**: `REPLACE_MEAL` and `ADD_SNACK` now use `generateMeal()` to change only the specified meal slot, not the entire day. This provides precise, targeted changes that feel more like ChatGPT.

2. **Targeted enrichment refresh**: After slot-only changes, only the modified meal(s) are re-enriched using `enrichMeal()`. The enrichment snapshot is updated in-place for the changed meal(s).

3. **Pantry context in chat prompts**: The chat interface now includes pantry context (top 30 items from the current plan) in the prompt, allowing Gemini to make more realistic suggestions that align with what the user has available.

**Key improvements:**
- `MealResponseSchema`: New schema for single meal generation
- `buildMealPrompt()`: Prompt builder for slot-only meal generation
- `generateMeal()`: Service method for generating a single meal with validation and repair
- `enrichMeal()`: Service method for enriching a single meal
- Precision rules in chat: "vervang lunch" → `REPLACE_MEAL`, "voeg snack toe" → `ADD_SNACK`, only "maak hele dag anders" → `REGENERATE_DAY`
- Enrichment snapshot updates: In-place updates for changed meals, removal for deleted meals

**Enrichment snapshot handling:**
- If `enrichmentSnapshot` exists, it's updated in-place for the changed meal(s)
- If `enrichmentSnapshot` is null, enrichment is skipped (pragmatic approach)
- REMOVE_MEAL removes the meal from enrichment snapshot if present

### Step 16: Plan Detail Composer UI

**Embedded Chat:**
- Chat is now embedded directly in the plan detail page (`/meal-plans/[planId]`)
- Primary experience: users can edit plans without navigating to a separate chat page
- Chat appears below the plan cards for easy access

**Plan Cards UI:**
- Plan is displayed as cards per day with meal slots
- Each meal card shows:
  - Enrichment data (title, prep/cook time, first 2 instructions) if available
  - Fallback to ingredient names if enrichment not available
  - Quick action buttons: "Swap" and "Remove"

**Quick Actions:**
- **Swap button** on meal cards: Injects prompt "Vervang [slot] op [date] door iets simpels"
- **Add snack/smoothie** buttons in QuickEditBar: Injects prompts for adding snacks
- **Regenerate day** button: Injects prompt "Maak hele dag [date] anders, maar houd het simpel"
- All quick actions use the chat composer as single interface (no separate UI flows)

**Injected Prompts:**
- `PlanChatClient` supports `initialDraft` prop for pre-filling the textarea
- Quick actions set the draft, user can immediately press Enter to submit
- This creates a "composer-first" UX where chat is the primary editing interface

**Summary/Actions Updates:**
- `MealPlanSummary` shows enrichment status and "Chat enabled" badge with hint
- `MealPlanActions` includes "Open Shopping" link
- Both components guide users to use the embedded chat for edits

### Limitations

1. **Limited message history**: Only the last 12 messages are sent to Gemini to keep context manageable.

### UI Components

- **`/meal-plans/[planId]/chat`**: Server page that loads plan and renders `PlanChatClient`
- **`PlanChatClient`**: Client component with:
  - Message list (user/assistant)
  - Textarea composer
  - Submit button
  - Applied status indicator with link to shopping list
  - Error display

Uses existing UI components:
- `Textarea` from `@/components/catalyst/textarea`
- `Button` from `@/components/catalyst/button`
- Catalyst components for all UI needs

## Security & Consistency

### Guard Rails Derivation

**Critical**: Guard rails (`DietRuleSet`) are **always derived** from `DietProfile` inside the service, never accepted as input. This ensures:

1. **Consistency**: Rules are always computed the same way, regardless of how the request is made
2. **Security**: Clients cannot inject malicious or incorrect rule sets
3. **Single Source of Truth**: Onboarding data (`DietProfile`) is the only source of truth for diet rules

The service flow:
1. Validates `MealPlanRequest` (which contains `profile: DietProfile`)
2. Derives `DietRuleSet` from `profile` using `deriveDietRuleSet()`
3. Uses the derived rules for prompt building and validation

## Debugging

### Using the API Smoke Test Endpoint

For debugging meal plan generation issues, use the API endpoint:

```bash
curl -X POST http://localhost:3000/api/v1/meal-plans/generate \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

**Error Codes:**
- `VALIDATION_ERROR` (400): Input validation failed - check your request structure
- `AGENT_ERROR` (500): Generation failed after repair attempt - check:
  - API key is valid
  - Model is available
  - Request doesn't violate constraints
  - Error message for specific issues

**Common Issues:**
- **JSON parse errors**: Usually means Gemini returned non-JSON output (rare with structured output)
- **Schema violations**: Output structure doesn't match expected schema
- **Hard constraint violations**: Generated meals contain forbidden ingredients or missing required categories

### Next Steps

1. **Enhanced Ingredient Matching**: Integrate NEVO codes for accurate ingredient validation
2. **Recipe Mapping**: Connect generated meals to actual recipes from the database
3. **Multiple Repair Attempts**: Allow configurable number of repair attempts
4. **Better Error Messages**: Include more context in error messages for debugging

## Related Documentation

- [Diet Types & Rules](./diet-types.md) - Foundation types and schemas
- [Onboarding Flow](./onboarding-flow.md) - How user preferences are collected
- [Diet Validation](../src/lib/diet-validation/README.md) - Post-generation validation
