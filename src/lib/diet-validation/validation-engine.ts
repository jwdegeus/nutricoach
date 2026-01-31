/**
 * Clinical Dietary Logic Engine
 * Validates ingredients and recipes against therapeutic diet protocols with strict guard rails
 */

import type {
  DietRule,
  ExcludeIngredientRule,
  RequireIngredientRule,
  MacroConstraintRule,
  MealStructureRule,
} from '@/src/app/(app)/onboarding/types/diet-rules.types';
import {
  ingredientMatchesCategory,
  ingredientMatchesList,
  categorizeWahlsVegetable,
} from './ingredient-categorizer';

/**
 * Safety status for recipe/meal validation
 */
export type SafetyStatus = 'safe' | 'danger' | 'incomplete';

/**
 * Validation result for a single ingredient
 */
export type IngredientValidationResult = {
  ingredient: string;
  status: SafetyStatus;
  violations: string[];
  warnings: string[];
};

/**
 * Validation result for a recipe/meal
 */
export type RecipeValidationResult = {
  status: SafetyStatus;
  violations: string[]; // Hard violations (DANGER)
  incompletes: string[]; // Missing requirements (INCOMPLETE)
  warnings: string[]; // Soft warnings (still SAFE but noteworthy)
  ingredientResults: IngredientValidationResult[];
  summary: string;
};

/**
 * Ingredient categorization helper
 */
export type IngredientCategory = {
  name: string;
  categories: string[];
  aliases: string[];
};

/**
 * Ingredient input for validation
 */
export type IngredientInput = {
  name: string;
  category?: string;
  amount?: number;
  unit?: string;
  macros?: {
    carbs?: number;
    saturatedFat?: number;
    protein?: number;
  };
  freshness?: 'fresh' | 'frozen' | 'leftover' | 'aged' | 'cured';
  ageHours?: number; // For leftovers
};

/**
 * Recipe input for validation
 */
export type RecipeInput = {
  name?: string;
  ingredients: IngredientInput[];
  totalMacros?: {
    carbs?: number;
    saturatedFat?: number;
    protein?: number;
  };
};

// Ingredient categorization is now handled by ingredient-categorizer.ts

/**
 * Validate ingredient against exclude rules
 */
function validateExcludeRule(
  ingredient: IngredientInput,
  rule: ExcludeIngredientRule,
): string[] {
  const violations: string[] = [];

  // Check excluded categories
  if (rule.excludedCategories) {
    for (const category of rule.excludedCategories) {
      if (
        ingredient.category === category ||
        ingredientMatchesCategory(ingredient.name, category)
      ) {
        violations.push(`Categorie '${category}' is strikt verboden`);
      }
    }
  }

  // Check excluded ingredients
  if (rule.excludedIngredients) {
    if (ingredientMatchesList(ingredient.name, rule.excludedIngredients)) {
      violations.push(`Ingrediënt '${ingredient.name}' is strikt verboden`);
    }
  }

  return violations;
}

/**
 * Validate ingredient against require rules
 */
function validateRequireRule(
  ingredients: IngredientInput[],
  rule: RequireIngredientRule,
): string[] {
  const incompletes: string[] = [];

  if (!rule.requiredIngredients || rule.requiredIngredients.length === 0) {
    return incompletes;
  }

  // Check if required ingredients are present
  const hasRequired = rule.requiredIngredients.some((required) =>
    ingredients.some((ing) => ingredientMatchesList(ing.name, [required])),
  );

  if (!hasRequired) {
    incompletes.push(
      `Vereist ingrediënt ontbreekt: ${rule.requiredIngredients.join(', ')}`,
    );
  }

  return incompletes;
}

/**
 * Validate macro constraints
 */
function validateMacroConstraints(
  recipe: RecipeInput,
  rule: MacroConstraintRule,
): string[] {
  const violations: string[] = [];

  if (!recipe.totalMacros) {
    return violations; // Can't validate without macros
  }

  // Check saturated fat limit (OMS: < 10g)
  if (rule.maxSaturatedFatGrams !== undefined) {
    const saturatedFat = recipe.totalMacros.saturatedFat || 0;
    if (saturatedFat >= rule.maxSaturatedFatGrams) {
      violations.push(
        `Verzadigd vet (${saturatedFat}g) overschrijdt maximum toegestaan (${rule.maxSaturatedFatGrams}g)`,
      );
    }
  }

  // Check carbohydrate type restrictions (SCD: only monosaccharides)
  if (rule.allowedTypes && rule.allowedTypes.length > 0) {
    // This would require more detailed ingredient analysis
    // For now, we'll flag if starches are present
    const hasStarches = recipe.ingredients.some((ing) =>
      ingredientMatchesCategory(ing.name, 'starches'),
    );
    if (hasStarches && !rule.allowedTypes.includes('polysaccharides')) {
      violations.push(
        `Zetmeel gedetecteerd, maar alleen ${rule.allowedTypes.join(', ')} zijn toegestaan`,
      );
    }
  }

  return violations;
}

/**
 * Validate meal structure rules
 */
function validateMealStructure(
  recipe: RecipeInput,
  rule: MealStructureRule,
): { violations: string[]; incompletes: string[] } {
  const violations: string[] = [];
  const incompletes: string[] = [];

  // Validate vegetable cups requirement (Wahls Paleo)
  if (rule.vegetableCupsRequirement) {
    const req = rule.vegetableCupsRequirement;
    let leafyCount = 0;
    let sulfurCount = 0;
    let coloredCount = 0;

    recipe.ingredients.forEach((ing) => {
      const categorized = categorizeWahlsVegetable(ing.name);
      const amount = ing.amount || 1; // Simplified: assume 1 cup per ingredient

      if (categorized.type === 'leafy') {
        leafyCount += amount;
      } else if (categorized.type === 'sulfur') {
        sulfurCount += amount;
      } else if (categorized.type === 'colored') {
        coloredCount += amount;
      }
    });

    const total = leafyCount + sulfurCount + coloredCount;
    if (total < req.totalCups) {
      incompletes.push(
        `ONVOLLEDIG: Alleen ${total} kopjes groenten (${req.totalCups} totaal nodig: ${req.leafyCups} bladgroenten, ${req.sulfurCups} zwavelgroenten, ${req.coloredCups} gekleurde groenten)`,
      );
    } else {
      if (leafyCount < req.leafyCups) {
        incompletes.push(
          `ONVOLLEDIG: Alleen ${leafyCount} kopjes bladgroenten (${req.leafyCups} nodig)`,
        );
      }
      if (sulfurCount < req.sulfurCups) {
        incompletes.push(
          `ONVOLLEDIG: Alleen ${sulfurCount} kopjes zwavelgroenten (${req.sulfurCups} nodig)`,
        );
      }
      if (coloredCount < req.coloredCups) {
        incompletes.push(
          `ONVOLLEDIG: Alleen ${coloredCount} kopjes gekleurde groenten (${req.coloredCups} nodig)`,
        );
      }
    }
  }

  // Validate freshness requirement (Low Histamine)
  if (rule.freshnessRequirement) {
    const req = rule.freshnessRequirement;

    recipe.ingredients.forEach((ing) => {
      // Check leftover age
      if (
        ing.freshness === 'leftover' &&
        ing.ageHours &&
        ing.ageHours > req.maxLeftoverHours
      ) {
        violations.push(
          `OVERTREDING: Ingrediënt '${ing.name}' is restje > ${req.maxLeftoverHours}u (verboden)`,
        );
      }

      // Check meat freshness
      if (
        ingredientMatchesCategory(ing.name, 'meat') ||
        ingredientMatchesCategory(ing.name, 'poultry')
      ) {
        if (req.meatRequirement === 'fresh_or_flash_frozen') {
          if (ing.freshness !== 'fresh' && ing.freshness !== 'frozen') {
            violations.push(
              `OVERTREDING: Vlees '${ing.name}' moet vers of diepvries zijn (huidig: ${ing.freshness})`,
            );
          }
        }
      }

      // Check forbidden states
      if (req.forbiddenStates?.includes(ing.freshness || '')) {
        violations.push(
          `OVERTREDING: Ingrediënt '${ing.name}' heeft verboden status: ${ing.freshness}`,
        );
      }
    });
  }

  return { violations, incompletes };
}

/**
 * Main validation engine
 * Validates a recipe against diet rules with strict guard rails
 */
export function validateRecipeAgainstDiet(
  recipe: RecipeInput,
  dietRules: DietRule[],
): RecipeValidationResult {
  const violations: string[] = [];
  const incompletes: string[] = [];
  const warnings: string[] = [];
  const ingredientResults: IngredientValidationResult[] = [];

  // Sort rules by priority (higher priority = stricter guard rails)
  const sortedRules = [...dietRules].sort((a, b) => b.priority - a.priority);

  // Validate each ingredient against exclude rules
  recipe.ingredients.forEach((ingredient) => {
    const ingredientViolations: string[] = [];
    const ingredientWarnings: string[] = [];

    sortedRules.forEach((rule) => {
      if (rule.ruleType === 'exclude_ingredient') {
        const ruleValue = rule.ruleValue as ExcludeIngredientRule;
        const ruleViolations = validateExcludeRule(ingredient, ruleValue);

        ruleViolations.forEach((violation) => {
          const violationMessage = `OVERTREDING: ${ingredient.name} - ${violation} (${rule.description || rule.ruleKey})`;
          ingredientViolations.push(violationMessage);
          violations.push(violationMessage);
        });
      }
    });

    ingredientResults.push({
      ingredient: ingredient.name,
      status: ingredientViolations.length > 0 ? 'danger' : 'safe',
      violations: ingredientViolations,
      warnings: ingredientWarnings,
    });
  });

  // Validate required ingredients
  sortedRules.forEach((rule) => {
    if (rule.ruleType === 'require_ingredient') {
      const ruleValue = rule.ruleValue as RequireIngredientRule;
      const ruleIncompletes = validateRequireRule(
        recipe.ingredients,
        ruleValue,
      );

      ruleIncompletes.forEach((incomplete) => {
        const incompleteMessage = `ONVOLLEDIG: ${incomplete} (${rule.description || rule.ruleKey})`;
        incompletes.push(incompleteMessage);
      });
    }
  });

  // Validate macro constraints
  sortedRules.forEach((rule) => {
    if (rule.ruleType === 'macro_constraint') {
      const ruleValue = rule.ruleValue as MacroConstraintRule;
      const ruleViolations = validateMacroConstraints(recipe, ruleValue);

      ruleViolations.forEach((violation) => {
        const violationMessage = `OVERTREDING: ${violation} (${rule.description || rule.ruleKey})`;
        violations.push(violationMessage);
      });
    }
  });

  // Validate meal structure
  sortedRules.forEach((rule) => {
    if (rule.ruleType === 'meal_structure') {
      const ruleValue = rule.ruleValue as MealStructureRule;
      const structureResult = validateMealStructure(recipe, ruleValue);

      structureResult.violations.forEach((violation) => {
        violations.push(violation);
      });

      structureResult.incompletes.forEach((incomplete) => {
        incompletes.push(incomplete);
      });
    }
  });

  // Determine overall status
  let status: SafetyStatus = 'safe';
  if (violations.length > 0) {
    status = 'danger';
  } else if (incompletes.length > 0) {
    status = 'incomplete';
  }

  // Generate summary
  let summary = '';
  if (status === 'safe') {
    summary = '✓ Recept is VEILIG en voldoet aan alle guard rails';
  } else if (status === 'danger') {
    summary = `⚠ GEVAAR: ${violations.length} overtreding(en) gedetecteerd - Recept bevat strikt verboden ingrediënten`;
  } else {
    summary = `⚠ ONVOLLEDIG: ${incompletes.length} vereiste(n) ontbreken - Recept mist vereiste therapeutische componenten`;
  }

  return {
    status,
    violations,
    incompletes,
    warnings,
    ingredientResults,
    summary,
  };
}

/**
 * Validate a single ingredient against diet rules
 */
export function validateIngredientAgainstDiet(
  ingredient: IngredientInput,
  dietRules: DietRule[],
): IngredientValidationResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  const sortedRules = [...dietRules].sort((a, b) => b.priority - a.priority);

  sortedRules.forEach((rule) => {
    if (rule.ruleType === 'exclude_ingredient') {
      const ruleValue = rule.ruleValue as ExcludeIngredientRule;
      const ruleViolations = validateExcludeRule(ingredient, ruleValue);

      ruleViolations.forEach((violation) => {
        violations.push(`${violation} (${rule.description || rule.ruleKey})`);
      });
    }
  });

  return {
    ingredient: ingredient.name,
    status: violations.length > 0 ? 'danger' : 'safe',
    violations,
    warnings,
  };
}
