/**
 * Diet Types - Foundation for Meal Planning Agent
 *
 * Defines the core types for diet profiles, rule sets, and agent contracts.
 * This is the source of truth for the meal planning agent's guard rails.
 */

/**
 * DietKey - String identifiers for diet types
 * These map to database diet_types.name but provide a stable API key
 */
export type DietKey =
  | 'wahls_paleo_plus' // Wahls Paleo (therapeutic)
  | 'keto' // Ketogenic diet
  | 'mediterranean' // Mediterranean diet
  | 'vegan' // Vegan diet
  | 'balanced'; // Generic balanced diet (fallback)

/**
 * Constraint type - distinguishes hard rules from soft preferences
 */
export type ConstraintType = 'hard' | 'soft';

/**
 * Macro target range (for flexible calorie/macro planning)
 */
export type MacroRange = {
  min?: number;
  max?: number;
  target?: number; // Preferred target within range
};

/**
 * Prep time preference per meal slot
 */
export type PrepTimePreference = {
  breakfast?: number; // minutes
  lunch?: number;
  dinner?: number;
  snack?: number;
};

/**
 * Batch cooking preference
 */
export type BatchCookingPreference = {
  enabled: boolean;
  preferredDays?: string[]; // e.g., ["sunday", "wednesday"]
  maxBatchSize?: number; // number of servings to prep at once
};

/**
 * Budget preference (optional, for future use)
 */
export type BudgetPreference = {
  level: 'low' | 'medium' | 'high' | 'unlimited';
  maxPerMeal?: number; // optional max cost per meal
};

/**
 * Pantry usage preference
 */
export type PantryPreference = {
  prioritizeExisting: boolean; // Use pantry items first
  allowedCategories?: string[]; // Categories to prioritize
};

/**
 * Diet Profile - Input from onboarding
 * This is what the user fills in during onboarding
 */
export type DietProfile = {
  dietKey: DietKey;
  allergies: string[];
  dislikes: string[];
  calorieTarget: {
    min?: number;
    max?: number;
    target?: number;
  };
  macroTargets?: {
    protein?: MacroRange;
    carbs?: MacroRange;
    fat?: MacroRange;
  };
  prepPreferences: {
    maxPrepMinutes?: number; // Global max (fallback)
    perMeal?: PrepTimePreference; // Per-meal preferences
    batchCooking?: BatchCookingPreference;
  };
  budgetPreference?: BudgetPreference;
  pantryUsage?: PantryPreference;
  // Additional preferences that might affect meal planning
  servingsDefault?: number; // Default number of servings per meal
  varietyLevel?: 'low' | 'std' | 'high'; // Affects weekly variety constraints
  strictness?: 'strict' | 'flexible'; // How strictly to enforce rules
  // Meal preferences per slot (as tags for multiple preferences)
  mealPreferences?: {
    breakfast?: string[]; // e.g., ["eiwit shake", "groene smoothie"]
    lunch?: string[]; // e.g., ["groene smoothie", "salade"]
    dinner?: string[]; // e.g., ["kip met groente", "vis"]
  };
};

/**
 * Ingredient constraint (for allowed/forbidden lists)
 */
export type IngredientConstraint = {
  type: 'allowed' | 'forbidden';
  items: string[]; // Ingredient names or tags
  categories?: string[]; // Ingredient categories
  constraintType: ConstraintType; // hard or soft
};

/**
 * Required category constraint (e.g., "veg_groups" for Wahls)
 */
export type RequiredCategoryConstraint = {
  category: string; // e.g., "veg_groups", "protein_sources"
  minPerDay?: number;
  minPerWeek?: number;
  items?: string[]; // Specific items that satisfy this category
  constraintType: ConstraintType;
};

/**
 * Per-meal constraint (e.g., min protein per meal slot)
 */
export type PerMealConstraint = {
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  minProtein?: number; // grams
  minCarbs?: number;
  minFat?: number;
  maxCalories?: number;
  requiredCategories?: string[]; // Categories that must be present
  constraintType: ConstraintType;
};

/**
 * Weekly variety constraint
 */
export type WeeklyVarietyConstraint = {
  maxRepeats?: number; // Max times same meal can appear in a week
  minUniqueMeals?: number; // Min unique meals per week
  excludeSimilar?: boolean; // Exclude similar meals (same base ingredients)
  constraintType: ConstraintType;
};

/**
 * Macro constraint (daily or per-meal)
 */
export type MacroConstraint = {
  scope: 'daily' | 'per_meal';
  maxCarbs?: number;
  maxSaturatedFat?: number;
  maxFat?: number;
  minProtein?: number;
  minFat?: number;
  allowedTypes?: string[]; // e.g., ["monosaccharides"] for SCD
  forbiddenTypes?: string[]; // e.g., ["polysaccharides"]
  constraintType: ConstraintType;
};

/**
 * Meal structure constraint (e.g., Wahls vegetable cups)
 */
export type MealStructureConstraint = {
  type: 'vegetable_cups' | 'meal_timing' | 'meal_count';
  // For vegetable_cups (Wahls)
  vegetableCupsRequirement?: {
    totalCups: number;
    leafyCups: number;
    sulfurCups: number;
    coloredCups: number;
    leafyVegetables?: string[];
    sulfurVegetables?: string[];
    coloredVegetables?: string[];
  };
  // For meal_timing
  mealTiming?: {
    breakfast?: { min?: string; max?: string }; // HH:MM
    lunch?: { min?: string; max?: string };
    dinner?: { min?: string; max?: string };
  };
  // For meal_count
  mealCount?: {
    minPerDay?: number;
    maxPerDay?: number;
    requiredSlots?: string[];
  };
  constraintType: ConstraintType;
};

/**
 * Diet Rule Set - Guard rails for the agent
 * This is derived from DietProfile and contains all constraints
 * the agent must enforce when generating meal plans
 */
export type DietRuleSet = {
  dietKey: DietKey;

  // Ingredient constraints
  ingredientConstraints: IngredientConstraint[];

  // Category requirements
  requiredCategories: RequiredCategoryConstraint[];

  // Per-meal constraints
  perMealConstraints: PerMealConstraint[];

  // Weekly variety constraints
  weeklyVariety: WeeklyVarietyConstraint;

  // Macro constraints
  macroConstraints: MacroConstraint[];

  // Meal structure constraints
  mealStructure: MealStructureConstraint[];

  // Calorie target (from profile)
  calorieTarget: {
    min?: number;
    max?: number;
    target?: number;
  };

  // Prep time constraints
  prepTimeConstraints: {
    globalMax?: number;
    perMeal?: PrepTimePreference;
    batchCooking?: BatchCookingPreference;
  };

  // Budget constraints (optional)
  budgetConstraints?: BudgetPreference;

  // Pantry usage (optional)
  pantryUsage?: PantryPreference;
};

/**
 * Meal slot type
 */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/**
 * Meal ingredient reference with NEVO code
 * This is the primary contract for ingredient selection - ingredients must come from NEVO database
 */
export type MealIngredientRef = {
  nevoCode: string; // NEVO code as string (for JSON schema compatibility)
  quantityG: number; // Amount in grams (min 1)
  displayName?: string; // Optional display name for UI
  tags?: string[]; // Optional tags for ingredient categorization (e.g., ["grains", "dairy"])
};

/**
 * Meal plan request - Input to the agent
 */
export type MealPlanRequest = {
  dateRange: {
    start: string; // ISO date string
    end: string; // ISO date string
  };
  slots: MealSlot[]; // Which meal slots to plan (e.g., ["breakfast", "lunch", "dinner"])
  profile: DietProfile; // User's diet profile from onboarding (source of truth)
  // Optional overrides
  excludeIngredients?: string[]; // Additional exclusions for this request
  preferIngredients?: string[]; // Preferred ingredients for this request
  maxPrepTime?: number; // Override global prep time
  /** Therapeutic targets snapshot (optional; for calculator/planner). */
  therapeuticTargets?: TherapeuticTargetsSnapshot;
};

/**
 * Meal in a meal plan
 */
export type Meal = {
  id: string; // Unique identifier for this meal
  name: string; // Meal name
  slot: MealSlot;
  date: string; // ISO date string
  // Primary ingredient references (required) - must use NEVO codes from candidate pool
  ingredientRefs: MealIngredientRef[];
  // Legacy ingredients field (optional, for backward compatibility during migration)
  ingredients?: {
    name: string;
    amount: number;
    unit: string;
    tags?: string[]; // Optional tags for ingredient categorization (e.g., ["grains", "dairy"])
  }[];
  // Estimated nutrition (informative only - actual calculation happens server-side via NEVO)
  estimatedMacros?: {
    calories?: number;
    protein?: number; // grams
    carbs?: number; // grams
    fat?: number; // grams
    saturatedFat?: number; // grams
  };
  // Legacy nutrition field (optional, for backward compatibility)
  nutrition?: {
    calories?: number;
    protein?: number; // grams
    carbs?: number; // grams
    fat?: number; // grams
    saturatedFat?: number; // grams
  };
  prepTime?: number; // minutes
  servings?: number;
};

/**
 * Day in a meal plan
 */
export type MealPlanDay = {
  date: string; // ISO date string
  meals: Meal[];
  totalNutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    saturatedFat?: number;
  };
};

// ---------------------------------------------------------------------------
// Therapeutic Targets & Coverage (snapshot contract – types only)
// ---------------------------------------------------------------------------

/** User physiology snapshot for target calculation (JSON-safe). */
export type UserPhysiologySnapshot = {
  birthDate?: string; // ISO date
  ageYears?: number;
  sex?: 'female' | 'male' | 'other' | 'unknown';
  heightCm?: number;
  weightKg?: number;
};

/** Admin-defined therapeutic protocol reference. */
export type TherapeuticProtocolRef = {
  protocolKey: string; // stable key, e.g. 'ms_v1'
  version?: string;
  labelNl?: string;
  sourceRefs?: Array<{ title: string; url?: string }>;
};

/** Gram/mass units for targets and coverage. */
export type GramUnit = 'g' | 'mg' | 'µg';

/** Energy unit. */
export type EnergyUnit = 'kcal';

/** Percent of adequate intake (ADH). */
export type PercentUnit = '%_adh';

/** Macro nutrient keys. */
export type MacroKey = 'protein' | 'carbs' | 'fat' | 'fiber' | 'energy';

/** Micro nutrient keys (extensible; start set for UI/calculator). */
export type MicroKey =
  | 'vitamin_d'
  | 'vitamin_b12'
  | 'magnesium'
  | 'zinc'
  | 'selenium'
  | 'iodine'
  | 'iron'
  | 'folate'
  | 'calcium'
  | 'vitamin_a'
  | 'vitamin_c'
  | 'vitamin_e'
  | 'omega_3'
  | (string & {}); // extensible

/** Single therapeutic target: absolute value or % ADH. */
export type TherapeuticTargetValue =
  | { kind: 'absolute'; value: number; unit: GramUnit | EnergyUnit }
  | { kind: 'adh_percent'; value: number; unit: PercentUnit };

/** Daily therapeutic targets (macros, micros, food groups). */
export type TherapeuticTargetsDaily = {
  macros?: Partial<Record<MacroKey, TherapeuticTargetValue>>;
  micros?: Partial<Record<MicroKey, TherapeuticTargetValue>>;
  foodGroups?: { vegetablesG?: number; fruitG?: number };
};

/** Weekly therapeutic targets (variety, frequency). */
export type TherapeuticTargetsWeekly = {
  variety?: { uniqueVegetablesMin?: number; uniqueProteinsMin?: number };
  frequency?: { fishMinPerWeek?: number; legumesMinPerWeek?: number };
};

/** Full therapeutic targets snapshot (protocol + physiology + daily/weekly + supplements). */
export type TherapeuticTargetsSnapshot = {
  protocol?: TherapeuticProtocolRef;
  physiology?: UserPhysiologySnapshot;
  daily?: TherapeuticTargetsDaily;
  weekly?: TherapeuticTargetsWeekly;
  supplements?: Array<{
    key: string;
    labelNl: string;
    dosageText?: string;
    notesNl?: string;
  }>;
  computedAt?: string; // ISO datetime
};

/** Daily coverage (what plan/intake delivers). */
export type TherapeuticCoverageDaily = {
  macros?: Partial<
    Record<MacroKey, { value: number; unit: GramUnit | EnergyUnit }>
  >;
  micros?: Partial<Record<MicroKey, { value: number; unit: GramUnit }>>;
  foodGroups?: { vegetablesG?: number; fruitG?: number };
};

/** Weekly coverage (rollup: sum/avg over plan days + variety/frequency). */
export type TherapeuticCoverageWeekly = {
  /** Week total (sum of days); unit always 'g' for v1. */
  foodGroups?: {
    vegetablesG?: { value: number; unit: 'g' };
    fruitG?: { value: number; unit: 'g' };
  };
  /** Week total per macro key (sum of daily actuals); key-driven. */
  macros?: Record<string, { value: number; unit: string }>;
  variety?: { uniqueVegetables?: number; uniqueProteins?: number };
  frequency?: { fishCount?: number; legumesCount?: number };
};

/** Severity for therapeutic action suggestions (no error in suggestions). */
export type TherapeuticActionSeverity = 'info' | 'warn';

/** Kind of concrete action suggested to address a deficit. */
export type TherapeuticActionKind =
  | 'add_side'
  | 'add_snack'
  | 'increase_portion'
  | 'swap_meal';

/** Worst-day context for a deficit (JSON-safe). */
export type TherapeuticWorstContext = {
  date?: string;
  actual?: number;
  target?: number;
  unit?: string;
  ratio?: number;
};

/** One concrete action suggestion (key-driven, JSON-safe payload). */
export type TherapeuticActionSuggestion = {
  kind: TherapeuticActionKind;
  severity: TherapeuticActionSeverity;
  titleNl: string;
  whyNl?: string;
  appliesTo?: {
    date?: string;
    slot?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  };
  /** Worst-day metrics when suggestion is tied to a deficit (optional). */
  metrics?: {
    actual?: number;
    target?: number;
    unit?: string;
    ratio?: number;
  };
  payload?: Record<string, unknown>;
};

/** Compact deficit summary for UI (alerts + optional action suggestions). */
export type TherapeuticDeficitSummary = {
  alerts?: Array<{
    code: string;
    severity: 'info' | 'warn' | 'error';
    messageNl: string;
  }>;
  suggestions?: TherapeuticActionSuggestion[];
};

/** Full therapeutic coverage snapshot (daily by date, weekly, deficits). */
export type TherapeuticCoverageSnapshot = {
  dailyByDate?: Record<string, TherapeuticCoverageDaily>; // key = ISO date
  weekly?: TherapeuticCoverageWeekly;
  deficits?: TherapeuticDeficitSummary;
  computedAt?: string; // ISO datetime
};

// ---------------------------------------------------------------------------

/**
 * Guard Rails vNext diagnostics (shadow mode)
 * Re-exported from recipe-ai.types for consistency
 */
export type GuardrailsVNextDiagnostics = {
  rulesetVersion: number;
  contentHash: string;
  outcome: 'allowed' | 'blocked' | 'warned';
  ok: boolean;
  reasonCodes: string[];
  counts: {
    matches: number;
    applied: number;
  };
};

/** Generator observability: which path was used and retry/failure reasons */
export type GeneratorRetryReason =
  | 'GUARDRAILS_VIOLATION'
  | 'AI_PARSE'
  | 'POOL_EMPTY'
  | 'UNKNOWN';

/** Optional pool category counts for observability (before/after sanitization). */
export type GeneratorPoolMetrics = {
  before: {
    proteins: number;
    vegetables: number;
    fruits: number;
    fats: number;
  };
  after: { proteins: number; vegetables: number; fruits: number; fats: number };
  removedDuplicates: number;
  removedByExcludeTerms: number;
  /** When guardrails block terms were applied: count removed by those terms only. */
  removedByGuardrailsTerms?: number;
};

/** Sanity check result for metadata.generator.sanity (optional). */
export type GeneratorSanityMeta = {
  ok: boolean;
  issues?: Array<{
    code: string;
    message: string;
    mealId?: string;
    date?: string;
  }>;
};

/** Per-meal quality (score + reasons) from template generator. */
export type MealQualityEntry = {
  date: string;
  slot: string;
  score: number;
  reasons: string[];
};

export type GeneratorMeta = {
  mode: 'template' | 'gemini';
  attempts: number;
  retryReason?: GeneratorRetryReason;
  templateInfo?: {
    rotation: string[];
    usedTemplateIds: string[];
    quality?: {
      repeatsAvoided: number;
      repeatsForced: number;
      proteinRepeatsForced?: number;
      templateRepeatsForced?: number;
      proteinCountsTop?: Array<{ nevoCode: string; count: number }>;
      templateCounts?: Array<{ id: string; count: number }>;
    };
    /** Per-meal quality score + reasons (template generator only). */
    mealQualities?: MealQualityEntry[];
  };
  /** Optional pool sanitization metrics (backwards compatible). */
  poolMetrics?: GeneratorPoolMetrics;
  /** When guardrails block terms were applied in template path: number of terms used. */
  guardrailsExcludeTermsCount?: number;
  /** Optional culinary sanity check result (backwards compatible). */
  sanity?: GeneratorSanityMeta;
};

/**
 * Meal plan response - Output from the agent
 */
export type MealPlanResponse = {
  requestId: string; // Reference to the request
  days: MealPlanDay[];
  metadata?: {
    generatedAt: string; // ISO timestamp
    dietKey: DietKey;
    totalDays: number;
    totalMeals: number;
    /** Guard Rails vNext diagnostics (shadow mode, optional) */
    guardrailsVnext?: GuardrailsVNextDiagnostics;
    /** Generator path + retries (observability; backwards-compatible) */
    generator?: GeneratorMeta;
    /** Therapeutic targets snapshot (optional; stored with plan for UI). */
    therapeuticTargets?: TherapeuticTargetsSnapshot;
    /** Therapeutic coverage snapshot (optional; what plan delivers vs targets). */
    therapeuticCoverage?: TherapeuticCoverageSnapshot;
    /** Supplement-advies samenvatting (optioneel; alleen agent-pad, geen when_json). */
    therapeuticSupplementsSummary?: TherapeuticSupplementsSummary;
    /** Variety scorecard (counts + targets); set before persist for UI/debug. */
    varietyScorecard?: MealPlanVarietyScorecard;
    /** True when plan was accepted despite DB recipe ratio below target (AI filled more slots). */
    dbCoverageBelowTarget?: boolean;
    /** DB-first KPI: slots filled from DB vs total (only when MEAL_PLANNER_DB_FIRST=true). */
    dbCoverage?: { dbSlots: number; totalSlots: number; percent: number };
    /** Top AI fallback reasons (source=ai with reason), sorted by count desc, max 3. */
    fallbackReasons?: { reason: string; count: number }[];
  };
};

/** Variety scorecard: metrics + DB targets echo + meets flags (no PII). */
export type MealPlanVarietyScorecard = {
  status: 'ok' | 'unavailable';
  uniqueVegCount: number;
  uniqueFruitCount: number;
  proteinUniqueCount: number;
  maxRepeatWithinDays: number;
  /** Sliding-window size used for repeat metric (from DB target). */
  repeatWindowDays: number;
  targets: {
    unique_veg_min: number;
    unique_fruit_min: number;
    protein_rotation_min_categories: number;
    max_repeat_same_recipe_within_days: number;
  };
  meetsTargets: {
    meetsUniqueVegMin: boolean;
    meetsUniqueFruitMin: boolean;
    meetsProteinRotation: boolean;
    /** True if no repeat within window; false if repeat found; unknown if not computable. */
    meetsRepeatWindow: boolean | 'unknown';
  };
  /** Top repeated meal names (max 10) for debug. */
  topRepeats?: { name: string; count: number }[];
};

/** Supplement-advies samenvatting in plan metadata (counts + max 3 NL zinnen, geen JSON). */
export type TherapeuticSupplementsSummary = {
  totalSupplements: number;
  totalApplicableRules: number;
  warnCount: number;
  errorCount: number;
  /** Max 3 plain strings (message_nl), voorkeur error > warn > info. */
  topMessagesNl: string[];
};
