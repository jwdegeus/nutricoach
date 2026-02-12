/**
 * Recipe Adaptation Service
 *
 * Server-side service for generating and validating recipe adaptations.
 * Orchestrates rewrite engine and diet validation with retry logic.
 */

import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import { CustomMealsService } from '@/src/lib/custom-meals/customMeals.service';
import { ProfileService } from '@/src/lib/profile/profile.service';
import { deriveDietRuleSet } from '@/src/lib/diets/diet-rules';
import { INGREDIENT_CATEGORY_MAP } from '@/src/lib/diet-validation/ingredient-categorizer';
import type {
  RequestRecipeAdaptationInput,
  RequestRecipeAdaptationResult,
  RecipeAdaptationDraft,
  ViolationDetail,
  ViolationChoice,
  IngredientLine,
  StepLine,
} from '../recipe-ai.types';
import type { DietRuleset, ValidationReport } from './diet-validator';
import { validateDraft, findForbiddenMatches } from './diet-validator';
import type { DietRuleSet } from '@/src/lib/diets';
// vNext guard rails (shadow mode)
import {
  loadGuardrailsRuleset,
  evaluateGuardrails,
} from '@/src/lib/guardrails-vnext';
import { mapRecipeDraftToGuardrailsTargets } from '@/src/lib/guardrails-vnext/adapters/recipe-adaptation';
import type { GuardrailsVNextDiagnostics } from '../recipe-ai.types';
import type {
  EvaluationContext,
  Locale,
} from '@/src/lib/guardrails-vnext/types';
import { suggestConcreteSubstitutes } from './gemini-recipe-adaptation.service';

/** Haal eerste voorgestelde alternatief uit suggestion-tekst (bijv. "Vervang door X of Y" → "X"). */
function firstSuggestedAlternativeFromSuggestion(
  suggestion: string,
): string | null {
  const m = (suggestion || '').match(/vervang\s+door\s+(.+)/i);
  const rest = (m ? m[1] : suggestion).trim();
  const first = rest
    .split(/\s+of\s+|\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return first || null;
}

/** Of de suggestie een generieke placeholder is (geen concreet ingrediënt om te gebruiken). */
function isGenericSuggestion(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim().toLowerCase();
  return (
    t.includes('dieet-compatibele variant') ||
    t.includes('vervang dit ingrediënt voor een') ||
    t.includes('vervang voor een dieet-compatibele')
  );
}

/**
 * Recipe Adaptation Service
 */
export class RecipeAdaptationService {
  /**
   * Request recipe adaptation
   *
   * Normalizes input, generates draft via engine, validates against diet rules,
   * and retries if validation fails (max 1 retry).
   *
   * @param input - Adaptation request input
   * @returns Discriminated union result
   */
  async requestAdaptation(
    input: RequestRecipeAdaptationInput,
  ): Promise<RequestRecipeAdaptationResult> {
    console.log(
      '[RecipeAdaptationService] ========================================',
    );
    console.log('[RecipeAdaptationService] requestAdaptation called');
    console.log(
      '[RecipeAdaptationService] Input:',
      JSON.stringify(input, null, 2),
    );

    try {
      // Normalize input
      const recipeId = input.recipeId.trim();
      const dietId = input.dietId?.trim();

      console.log('[RecipeAdaptationService] Normalized recipeId:', recipeId);
      console.log('[RecipeAdaptationService] Normalized dietId:', dietId);

      // Validate recipeId
      if (!recipeId || recipeId === 'undefined') {
        console.error('[RecipeAdaptationService] Invalid recipeId');
        return {
          outcome: 'error',
          message: 'Recept ID is vereist',
          code: 'INVALID_INPUT',
        };
      }

      // Check if dietId is provided
      if (!dietId || dietId === '') {
        console.warn('[RecipeAdaptationService] No dietId provided');
        return {
          outcome: 'empty',
          reason: 'NO_DIET_SELECTED',
        };
      }

      // Load diet ruleset
      console.log(
        '[RecipeAdaptationService] Loading diet ruleset for dietId:',
        dietId,
      );
      const ruleset = await this.loadDietRuleset(dietId);
      if (!ruleset) {
        console.error(
          '[RecipeAdaptationService] Ruleset not found for dietId:',
          dietId,
        );
        return {
          outcome: 'error',
          message: `Dieet met ID "${dietId}" niet gevonden`,
          code: 'INVALID_INPUT',
        };
      }

      console.log(
        '[RecipeAdaptationService] Ruleset loaded successfully, forbidden count:',
        ruleset.forbidden.length,
      );

      // Generate draft with engine (first attempt)
      // Bij twee-fase flow: bestaande violations + keuzes (Kies X / Vervang / Schrappen) meegiven
      const existingViolations = input.existingAnalysis?.violations;
      const violationChoices = input.existingAnalysis?.violationChoices;
      let draft: RecipeAdaptationDraft;
      let validation: ValidationReport;
      let needsRetry = false;

      try {
        draft = await this.generateDraftWithEngine(
          recipeId,
          dietId,
          false,
          existingViolations,
          violationChoices,
        );
        validation = validateDraft(draft, ruleset);

        if (!validation.ok) {
          needsRetry = true;
        }
      } catch (error) {
        console.error('Error generating draft:', error);
        return {
          outcome: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Fout bij genereren aangepast recept',
          code: 'INTERNAL_ERROR',
        };
      }

      // Retry with strict mode if validation failed
      if (needsRetry) {
        try {
          draft = await this.generateDraftWithEngine(
            recipeId,
            dietId,
            true,
            existingViolations,
            violationChoices,
          );
          validation = validateDraft(draft, ruleset);

          if (!validation.ok) {
            // In strict mode, if there are still violations, it's likely because:
            // 1. The validator found violations in the rewrite that weren't in the original
            // 2. The substitution didn't work perfectly
            // For now, we'll still return the draft but log a warning
            // The user will see the violations in the UI
            console.warn(
              'Strict mode rewrite still has violations:',
              validation.matches,
            );

            // TODO [GUARD-RAILS-vNext]: RISK #2 - Fail-Open Behavior
            // Current behavior: Draft is returned even with violations (fail-open).
            // Risk: Users can receive recipes that violate guard rails.
            // vNext solution: Implement fail-closed for hard constraints via src/lib/guardrails-vnext/validator.ts
            // - Hard constraint violations → block draft, return error
            // - Soft constraint violations → show warning, require explicit user consent
            // - Decision trace will be generated for audit trail
            // See: docs/guard-rails-rebuild-plan.md section 6.1
            // Return the draft anyway - it's better than nothing
            // The violations will be shown to the user
            // In a future version, we could implement iterative replacement
          }
        } catch (error) {
          console.error('Error in retry draft generation:', error);
          return {
            outcome: 'error',
            message: 'Unable to produce diet-compliant rewrite',
            code: 'INTERNAL_ERROR',
          };
        }
      }

      // Validate draft structure
      if (!draft.rewrite || !draft.analysis) {
        console.error('[RecipeAdaptationService] Invalid draft structure');
        return {
          outcome: 'error',
          message: 'Ongeldige draft structuur',
          code: 'INTERNAL_ERROR',
        };
      }

      console.log('[RecipeAdaptationService] Draft validation passed');
      console.log(
        '[RecipeAdaptationService] Violations in draft:',
        draft.analysis.violations.length,
      );

      // Shadow mode: vNext guard rails evaluation (feature flag)
      const useVNextGuardrails = process.env.USE_VNEXT_GUARDRAILS === 'true';
      if (useVNextGuardrails) {
        try {
          await this.evaluateVNextGuardrails(
            draft,
            dietId,
            input.locale,
            recipeId,
            validation,
          );
        } catch (error) {
          // Don't fail the request if vNext evaluation fails
          console.error(
            '[RecipeAdaptationService] vNext guard rails evaluation failed:',
            error,
          );
        }
      }

      console.log('[RecipeAdaptationService] Returning success result');
      console.log(
        '[RecipeAdaptationService] ========================================',
      );

      // Return success
      return {
        outcome: 'success',
        adaptation: draft,
        meta: {
          timestamp: new Date().toISOString(),
          recipeId,
          dietId,
          locale: input.locale,
        },
      };
    } catch (error) {
      console.error(
        'Error in RecipeAdaptationService.requestAdaptation:',
        error,
      );
      return {
        outcome: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Er is een onverwachte fout opgetreden',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Alleen analyse: violations uit dieetregels, geen AI-rewrite.
   * Gebruikt in twee-fase flow (eerst "Analyseer recept", daarna "Genereer aangepaste versie").
   * Geeft ook eerder gekozen substituties terug voor snellere suggesties.
   */
  async getAnalysisOnly(
    recipeId: string,
    dietId: string,
  ): Promise<{
    violations: ViolationDetail[];
    summary: string;
    recipeName: string;
    noRulesConfigured?: boolean;
    learnedSubstitutions?: Record<string, string>;
  }> {
    const recipe = await this.loadRecipeForAnalysis(recipeId);
    if (!recipe) {
      throw new Error('Recipe not found');
    }
    const ruleset = await this.loadDietRuleset(dietId);
    if (!ruleset) {
      throw new Error('Diet ruleset not found');
    }
    // Geen echte dieetregels: geen fallback gebruiken, geen nep-afwijkingen tonen
    if (ruleset.forbidden.length === 0) {
      return {
        violations: [],
        summary: 'Geen dieetregels geconfigureerd voor dit dieet.',
        recipeName: recipe.mealName,
        noRulesConfigured: true,
      };
    }
    const violations = this.analyzeRecipeForViolations(recipe, ruleset);

    const summary =
      violations.length === 0
        ? 'Geen afwijkingen gevonden! Dit recept past perfect bij jouw dieet.'
        : `${violations.length} ingrediënt${violations.length !== 1 ? 'en' : ''} wijk${violations.length !== 1 ? 'en' : 't'} af van je dieetvoorkeuren.`;

    let learnedSubstitutions: Record<string, string> | undefined;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: rows } = await supabase
          .from('diet_ingredient_substitutions')
          .select('original_normalized, substitute_display_name')
          .eq('user_id', user.id)
          .eq('diet_id', dietId);
        if (rows?.length) {
          learnedSubstitutions = {};
          for (const r of rows) {
            if (r.original_normalized && r.substitute_display_name) {
              learnedSubstitutions[r.original_normalized] =
                r.substitute_display_name;
            }
          }
        }
      }
    } catch {
      // Optioneel: negeer als tabel nog niet bestaat of RLS faalt
    }

    return {
      violations,
      summary,
      recipeName: recipe.mealName,
      learnedSubstitutions,
    };
  }

  /**
   * Load recipe for analysis-only (geen user-id in pad; gebruikt huidige user uit auth).
   */
  private async loadRecipeForAnalysis(recipeId: string): Promise<{
    mealData: Record<string, unknown>;
    mealName: string;
    steps: string[];
  } | null> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return this.loadRecipe(recipeId, user.id);
  }

  /**
   * Load diet ruleset from database
   *
   * First tries to load recipe adaptation rules from database.
   * Falls back to deriving from user's diet profile if no rules found.
   *
   * @param dietId - Diet type ID (UUID from diet_types table)
   * @returns Diet ruleset or null if not found
   */
  private async loadDietRuleset(dietId: string): Promise<DietRuleset | null> {
    try {
      const supabase = await createClient();

      console.log(`[RecipeAdaptation] Loading ruleset for dietId: ${dietId}`);

      // PRIORITY 1: Load guard rails (diet_category_constraints + ingredient_category_items)
      // Firewall evaluatie: sorteer op rule_priority (hoog naar laag) - eerste match wint
      const { data: constraints, error: constraintsError } = await supabase
        .from('diet_category_constraints')
        .select(
          `
          *,
          category:ingredient_categories(
            id,
            code,
            name_nl,
            category_type,
            items:ingredient_category_items(term, term_nl, synonyms, is_active)
          )
        `,
        )
        .eq('diet_type_id', dietId)
        .eq('is_active', true)
        .order('rule_priority', { ascending: false })
        .order('priority', { ascending: false }); // Fallback voor backward compatibility

      if (constraintsError) {
        console.error(
          `[RecipeAdaptation] Error loading guard rails:`,
          constraintsError,
        );
      } else {
        console.log(
          `[RecipeAdaptation] Found ${constraints?.length || 0} guard rail constraints for diet ${dietId}`,
        );
      }

      // If we have guard rails, use them as primary source
      // Firewall evaluatie: regels zijn al gesorteerd op rule_priority (hoog naar laag)
      // Eerste match wint - block regels hebben voorrang over allow regels op dezelfde prioriteit
      if (!constraintsError && constraints && constraints.length > 0) {
        // Load recipe_adaptation_rules early so we can use substitution_suggestions for guard-rail terms
        const { data: rules, error: rulesError } = await supabase
          .from('recipe_adaptation_rules')
          .select('*')
          .eq('diet_type_id', dietId)
          .eq('is_active', true)
          .order('priority', { ascending: false });

        const adaptationRules = !rulesError && rules ? rules : [];
        const forbidden: DietRuleset['forbidden'] = [];
        // TODO [GUARD-RAILS-vNext]: RISK #6 - Allow Rules Not Used
        // Current behavior: allowedTerms Set is populated but never used for evaluation.
        // Only block rules are added to forbidden[] array, so allow rules have no effect.
        // Risk: Allow rules are collected but ignored, breaking firewall logic.
        // vNext solution: Implement full firewall evaluation in src/lib/guardrails-vnext/ruleset-loader.ts
        // - Evaluate allow rules first (tracking)
        // - Evaluate block rules second (block overrides allow on same priority)
        // - Return unified GuardRailsRuleset with both allowed[] and blocked[] arrays
        // - Validator will use both arrays for deterministic evaluation
        // See: docs/guard-rails-rebuild-plan.md section 6.3
        const allowedTerms = new Set<string>(); // Track allowed terms (voor firewall logica)

        // Eerst: verzamel alle allow regels (voor firewall evaluatie)
        for (const constraint of constraints) {
          const ruleAction =
            constraint.rule_action ||
            (constraint.constraint_type === 'forbidden' ? 'block' : 'allow');

          if (ruleAction === 'allow' && constraint.category) {
            const category = constraint.category as Record<string, unknown>;
            const items = Array.isArray(category.items) ? category.items : [];

            for (const item of items) {
              if (item.is_active === false) continue;
              const term = item.term?.toLowerCase() || '';
              if (term) {
                allowedTerms.add(term);
                // Voeg ook synoniemen toe aan allowed set
                const synonyms = Array.isArray(item.synonyms)
                  ? item.synonyms
                  : [];
                synonyms.forEach((s: string) => {
                  if (s) allowedTerms.add(s.toLowerCase());
                });
              }
            }
          }
        }

        // Dan: verzamel block regels (firewall: block heeft voorrang)
        for (const constraint of constraints) {
          const ruleAction =
            constraint.rule_action ||
            (constraint.constraint_type === 'forbidden' ? 'block' : 'allow');

          if (ruleAction === 'block' && constraint.category) {
            const category = constraint.category as Record<string, unknown>;
            const items = Array.isArray(category.items) ? category.items : [];

            // Add each item from the category with its synonyms
            for (const item of items) {
              const it = item as Record<string, unknown>;
              if (it.is_active === false) continue;

              const synonyms = Array.isArray(it.synonyms) ? it.synonyms : [];
              const term = (it.term as string | undefined)?.toLowerCase() || '';
              const categoryCode = (category as { code?: string }).code ?? '';

              // SubstitutionSuggestions: uit recipe_adaptation_rules (zelfde term/synonym) of fallback per categorie
              const adaptationRule = adaptationRules.find(
                (r: { term?: string; synonyms?: string[] }) => {
                  const rTerm = (r.term ?? '').toLowerCase();
                  const rSynonyms = (
                    Array.isArray(r.synonyms) ? r.synonyms : []
                  ).map((s: string) => s.toLowerCase());
                  return (
                    rTerm === term ||
                    rSynonyms.includes(term) ||
                    synonyms.some(
                      (s: string) =>
                        rTerm === s.toLowerCase() ||
                        rSynonyms.includes(s.toLowerCase()),
                    )
                  );
                },
              );
              const substitutionSuggestions: string[] =
                adaptationRule?.substitution_suggestions
                  ? Array.isArray(adaptationRule.substitution_suggestions)
                    ? adaptationRule.substitution_suggestions
                    : []
                  : this.getSubstitutionSuggestionsByCategoryCode(categoryCode);

              // Firewall logica: als term al in allowed set staat, skip (allow heeft al voorrang gehad)
              // Maar block regels met hogere prioriteit kunnen allow overrulen
              // Omdat we al gesorteerd zijn op rule_priority, kunnen we gewoon toevoegen
              // De validator zal later de eerste match gebruiken

              // Check if we already have this term
              const existing = forbidden.find((f) => f.term === term);
              if (!existing && term) {
                // strictness: hard = blokkeren/vervangen, soft = beperkt/waarschuwing (limit)
                const hard = constraint.strictness === 'hard';
                forbidden.push({
                  term,
                  synonyms: synonyms.map((s: string) => s.toLowerCase()),
                  ruleCode: hard ? 'GUARD_RAIL_HARD' : 'GUARD_RAIL_SOFT',
                  ruleLabel: `${category.name_nl} (${hard ? 'Strikt verboden' : 'Niet gewenst'})`,
                  substitutionSuggestions,
                });
              }
            }
          }
        }

        console.log(
          `[RecipeAdaptation] Guard rails loaded: ${forbidden.length} forbidden terms from ${constraints.length} constraints`,
        );

        // PRIORITY 2: Merge recipe adaptation rules (avoid duplicates; we already loaded them as adaptationRules)
        if (adaptationRules.length > 0) {
          for (const rule of adaptationRules) {
            const term = (rule as { term?: string }).term?.toLowerCase() || '';
            const existing = forbidden.find((f) => f.term === term);
            if (!existing && term) {
              forbidden.push({
                term,
                synonyms: (rule.synonyms as string[]) || [],
                ruleCode:
                  (rule as { rule_code?: string }).rule_code ??
                  'RECIPE_ADAPTATION',
                ruleLabel:
                  (rule as { rule_label?: string }).rule_label ?? 'Aanpassing',
                substitutionSuggestions:
                  (rule.substitution_suggestions as string[]) || [],
              });
            }
          }
          console.log(
            `[RecipeAdaptation] Added ${adaptationRules.length} recipe adaptation rules`,
          );
        }

        // Get added sugar terms from heuristics
        const { data: heuristics } = await supabase
          .from('recipe_adaptation_heuristics')
          .select('*')
          .eq('diet_type_id', dietId)
          .eq('is_active', true);

        const addedSugarHeuristic = heuristics?.find(
          (h) => h.heuristic_type === 'added_sugar',
        );
        const addedSugarTerms = (addedSugarHeuristic?.terms as string[]) || [];

        this.filterSubstitutionSuggestionsAgainstForbidden(forbidden);

        console.log(
          `[RecipeAdaptation] ✓ Loaded ${forbidden.length} total rules (from guard rails + recipe adaptation) for diet ${dietId}`,
        );

        const ruleset: DietRuleset = {
          dietId,
          version: 1,
          forbidden,
          heuristics:
            addedSugarTerms.length > 0 ? { addedSugarTerms } : undefined,
        };

        return ruleset;
      }

      // FALLBACK: Try to load recipe adaptation rules from database (old method)
      const { data: rules, error: rulesError } = await supabase
        .from('recipe_adaptation_rules')
        .select('*')
        .eq('diet_type_id', dietId)
        .eq('is_active', true)
        .order('priority', { ascending: false });

      if (rulesError) {
        console.error(
          `[RecipeAdaptation] Error loading rules from database:`,
          rulesError,
        );
      } else {
        console.log(
          `[RecipeAdaptation] Found ${rules?.length || 0} rules in database for diet ${dietId}`,
        );
      }

      const { data: heuristics, error: heuristicsError } = await supabase
        .from('recipe_adaptation_heuristics')
        .select('*')
        .eq('diet_type_id', dietId)
        .eq('is_active', true);

      if (heuristicsError) {
        console.error(
          `[RecipeAdaptation] Error loading heuristics from database:`,
          heuristicsError,
        );
      }

      // If we have rules in database, use them
      if (!rulesError && rules && rules.length > 0) {
        const forbidden = rules.map((rule) => ({
          term: rule.term,
          synonyms: (rule.synonyms as string[]) || [],
          ruleCode: rule.rule_code,
          ruleLabel: rule.rule_label,
          substitutionSuggestions:
            (rule.substitution_suggestions as string[]) || [],
        }));

        this.filterSubstitutionSuggestionsAgainstForbidden(forbidden);

        console.log(
          `[RecipeAdaptation] Rules loaded:`,
          forbidden.map((r) => `${r.term} (${r.synonyms.length} synonyms)`),
        );

        // Get added sugar terms from heuristics
        const addedSugarHeuristic = heuristics?.find(
          (h) => h.heuristic_type === 'added_sugar',
        );
        const addedSugarTerms = (addedSugarHeuristic?.terms as string[]) || [];

        const ruleset: DietRuleset = {
          dietId,
          version: 1,
          forbidden,
          heuristics:
            addedSugarTerms.length > 0 ? { addedSugarTerms } : undefined,
        };

        console.log(
          `[RecipeAdaptation] ✓ Loaded ${forbidden.length} rules from database for diet ${dietId}`,
        );

        return ruleset;
      }

      console.log(
        `[RecipeAdaptation] No rules found in database, falling back to profile derivation`,
      );

      // Fallback: derive from user's diet profile
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error('[RecipeAdaptation] User not authenticated');
        return this.getFallbackRuleset(dietId);
      }

      // Load user's diet profile
      const profileService = new ProfileService();
      const dietProfile = await profileService.loadDietProfileForUser(user.id);

      // Derive DietRuleSet from profile
      const dietRuleSet = deriveDietRuleSet(dietProfile);

      // Convert DietRuleSet to DietRuleset (validator format)
      const ruleset = this.convertDietRuleSetToValidatorFormat(
        dietRuleSet,
        dietId,
      );

      this.filterSubstitutionSuggestionsAgainstForbidden(ruleset.forbidden);

      console.log(
        `[RecipeAdaptation] ✓ Loaded diet ruleset for ${dietProfile.dietKey} with ${ruleset.forbidden.length} forbidden rules (derived from profile)`,
      );
      console.log(
        `[RecipeAdaptation] Profile allergies:`,
        dietProfile.allergies,
      );
      console.log(`[RecipeAdaptation] Profile dislikes:`, dietProfile.dislikes);
      console.log(
        `[RecipeAdaptation] Ruleset forbidden terms:`,
        ruleset.forbidden.map((r) => r.term),
      );

      return ruleset;
    } catch (error) {
      console.error('[RecipeAdaptation] Error loading diet ruleset:', error);
      // Fallback to basic ruleset if everything fails
      return this.getFallbackRuleset(dietId);
    }
  }

  /**
   * Filter substitution suggestions so we never suggest an ingredient that is
   * itself forbidden (e.g. gerookte paprikapoeder for chilipoeder when paprika
   * is also a nightshade). Excludes exact matches and suggestions that contain
   * any forbidden term (e.g. "gerookte paprikapoeder" contains "paprikapoeder").
   */
  private filterSubstitutionSuggestionsAgainstForbidden(
    forbidden: DietRuleset['forbidden'],
  ): void {
    const forbiddenSet = new Set<string>();
    for (const r of forbidden) {
      const t = r.term?.toLowerCase().trim();
      if (t) forbiddenSet.add(t);
      for (const s of r.synonyms || []) {
        const v = s?.toLowerCase().trim();
        if (v) forbiddenSet.add(v);
      }
    }
    const forbiddenList = Array.from(forbiddenSet);
    for (const r of forbidden) {
      if (!r.substitutionSuggestions?.length) continue;
      r.substitutionSuggestions = r.substitutionSuggestions.filter((s) => {
        if (!s?.trim()) return false;
        const low = s.toLowerCase().trim();
        if (forbiddenSet.has(low)) return false;
        if (forbiddenList.some((f) => low.includes(f))) return false;
        return true;
      });
    }
  }

  /**
   * Convert DietRuleSet to DietRuleset (validator format)
   *
   * Expands ingredient categories to specific terms and includes
   * allergies and dislikes from the profile.
   */
  private convertDietRuleSetToValidatorFormat(
    dietRuleSet: DietRuleSet,
    dietId: string,
  ): DietRuleset {
    const forbidden: DietRuleset['forbidden'] = [];
    const INGREDIENT_CATEGORY_MAP = this.getIngredientCategoryMap();

    console.log(
      `[RecipeAdaptation] Converting DietRuleSet to DietRuleset format`,
    );
    console.log(
      `[RecipeAdaptation] DietRuleSet ingredientConstraints count:`,
      dietRuleSet.ingredientConstraints.length,
    );

    // Process ingredient constraints
    for (const constraint of dietRuleSet.ingredientConstraints) {
      if (constraint.type === 'forbidden') {
        console.log(`[RecipeAdaptation] Processing forbidden constraint:`, {
          items: constraint.items,
          categories: constraint.categories,
          constraintType: constraint.constraintType,
        });

        // Add specific items
        for (const item of constraint.items) {
          // Check if we already have this item
          const existing = forbidden.find(
            (f) => f.term.toLowerCase() === item.toLowerCase(),
          );
          if (!existing) {
            forbidden.push({
              term: item.toLowerCase(),
              synonyms: [],
              ruleCode:
                constraint.constraintType === 'hard'
                  ? 'FORBIDDEN_HARD'
                  : 'FORBIDDEN_SOFT',
              ruleLabel:
                constraint.constraintType === 'hard'
                  ? 'Strikt verboden'
                  : 'Niet gewenst',
              substitutionSuggestions: this.getSubstitutionSuggestions(item),
            });
            console.log(`[RecipeAdaptation] Added forbidden item: ${item}`);
          }
        }

        // Expand categories to specific ingredients
        if (constraint.categories) {
          for (const category of constraint.categories) {
            const categoryItems = INGREDIENT_CATEGORY_MAP[category] || [];
            console.log(
              `[RecipeAdaptation] Expanding category "${category}" with ${categoryItems.length} items`,
            );

            if (categoryItems.length === 0) {
              console.warn(
                `[RecipeAdaptation] ⚠ Category "${category}" has no items in INGREDIENT_CATEGORY_MAP!`,
              );
            }

            for (const item of categoryItems) {
              const existing = forbidden.find(
                (f) => f.term.toLowerCase() === item.toLowerCase(),
              );
              if (!existing) {
                const synonyms = this.getSynonymsForTerm(item);
                const substitutionSuggestions = this.getSubstitutionSuggestions(
                  item,
                  category,
                );
                forbidden.push({
                  term: item.toLowerCase(),
                  synonyms,
                  ruleCode:
                    constraint.constraintType === 'hard'
                      ? 'FORBIDDEN_HARD'
                      : 'FORBIDDEN_SOFT',
                  ruleLabel: this.getCategoryLabel(
                    category,
                    constraint.constraintType,
                  ),
                  substitutionSuggestions,
                });
                console.log(
                  `[RecipeAdaptation]   Added: ${item.toLowerCase()} (${synonyms.length} synonyms, ${substitutionSuggestions.length} substitutions)`,
                );
              } else {
                console.log(
                  `[RecipeAdaptation]   Skipped duplicate: ${item.toLowerCase()}`,
                );
              }
            }
          }
        } else {
          console.log(
            `[RecipeAdaptation]   No categories to expand for this constraint`,
          );
        }
      }
    }

    console.log(
      `[RecipeAdaptation] Converted to ${forbidden.length} forbidden rules`,
    );

    if (forbidden.length === 0) {
      console.error(
        `[RecipeAdaptation] ⚠ ERROR: Conversion resulted in 0 forbidden rules!`,
      );
      console.error(
        `[RecipeAdaptation]   DietRuleSet ingredientConstraints:`,
        dietRuleSet.ingredientConstraints,
      );
      console.error(
        `[RecipeAdaptation]   This means no violations will be detected!`,
      );
    }

    // Add heuristics for added sugar detection
    const heuristics = {
      addedSugarTerms: [
        'suiker',
        'siroop',
        'stroop',
        'honing',
        'glucose',
        'fructose',
        'sucrose',
        'rietsuiker',
        'witte suiker',
        'kristalsuiker',
      ],
    };

    return {
      dietId,
      version: 1,
      forbidden,
      heuristics,
    };
  }

  /**
   * Get ingredient category mapping
   * Maps category names to specific ingredient terms
   */
  private getIngredientCategoryMap(): Record<string, string[]> {
    // Use the shared category map and extend with Dutch translations
    const baseMap: Record<string, string[]> = {
      ...INGREDIENT_CATEGORY_MAP,
    };

    // Add Dutch translations
    return {
      grains: [
        ...(baseMap.grains || []),
        'tarwe',
        'rijst',
        'haver',
        'gerst',
        'rogge',
        'mais',
        'boekweit',
        'gierst',
        'amarant',
        'pasta',
        'spaghetti',
        'penne',
        'fusilli',
        'macaroni',
        'orzo',
        'risoni',
        'noedels',
        'tagliatelle',
        'fettuccine',
        'linguine',
        'ravioli',
        'lasagne',
        'gnocchi',
        'brood',
        'meel',
        'bloem',
        'tarwebloem',
        'tarwemeel',
      ],
      dairy: [
        ...(baseMap.dairy || []),
        'melk',
        'koemelk',
        'kaas',
        'yoghurt',
        'boter',
        'room',
        'zure room',
        'karnemelk',
        'roomkaas',
        'volle melk',
        'halfvolle melk',
        'magere melk',
      ],
      legumes: [
        ...(baseMap.legumes || []),
        'bonen',
        'linzen',
        'kikkererwten',
        'erwten',
        'soja',
        "pinda's",
        'zwarte bonen',
        'nierbonen',
        'mungbonen',
      ],
      processed_sugar: [
        ...(baseMap.processed_sugar || []),
        'suiker',
        'rietsuiker',
        'bruine suiker',
        'poedersuiker',
        'ahornsiroop',
        'agavesiroop',
        'maissiroop',
        'witte suiker',
        'kristalsuiker',
        'basterdsuiker',
      ],
      gluten_containing_grains: [
        'wheat',
        'tarwe',
        'barley',
        'gerst',
        'rye',
        'rogge',
        'spelt',
        'kamut',
        'triticale',
        'pasta',
        'spaghetti',
        'penne',
        'fusilli',
        'macaroni',
        'orzo',
        'risoni',
        'couscous',
        'noedels',
        'tagliatelle',
        'fettuccine',
        'linguine',
        'ravioli',
        'lasagne',
        'gnocchi',
        'brood',
        'bread',
        'meel',
        'bloem',
        'tarwebloem',
        'tarwemeel',
      ],
    };
  }

  /**
   * Get synonyms for a term
   */
  private getSynonymsForTerm(term: string): string[] {
    const synonymMap: Record<string, string[]> = {
      pasta: [
        'spaghetti',
        'penne',
        'fusilli',
        'macaroni',
        'orzo',
        'risoni',
        'couscous',
        'noedels',
      ],
      melk: ['koemelk', 'volle melk', 'halfvolle melk', 'magere melk'],
      tarwebloem: ['tarwe', 'wheat', 'bloem', 'meel', 'tarwemeel'],
      suiker: ['rietsuiker', 'witte suiker', 'kristalsuiker', 'basterdsuiker'],
    };

    return synonymMap[term.toLowerCase()] || [];
  }

  /**
   * Get substitution suggestions by ingredient_category.code (fallback voor guard-rail termen).
   * Gebruikt wanneer recipe_adaptation_rules geen match heeft voor de term.
   */
  private getSubstitutionSuggestionsByCategoryCode(
    categoryCode: string,
  ): string[] {
    const code = categoryCode.toLowerCase();
    const byCode: Record<string, string[]> = {
      // Gluten / granen
      wahls_forbidden_gluten: [
        'rijstnoedels',
        'zucchininoedels',
        'glutenvrije pasta',
        'quinoa',
        'rijst',
      ],
      gluten_containing_grains: [
        'rijstnoedels',
        'zucchininoedels',
        'quinoa',
        'amandelmeel',
        'rijstmeel',
      ],
      grains: ['rijst', 'quinoa', 'amandelmeel', 'rijstmeel'],
      // Zuivel
      wahls_forbidden_dairy: [
        'amandelmelk',
        'havermelk',
        'kokosmelk',
        'rijstmelk',
      ],
      dairy: ['amandelmelk', 'havermelk', 'kokosmelk', 'rijstmelk'],
      // Suiker
      wahls_forbidden_added_sugar: [
        'stevia',
        'monniksfruit',
        'erythritol',
        'verminder of weglaten',
      ],
      processed_sugar: ['stevia', 'honing', 'agavesiroop', 'erythritol'],
      // Overig Wahls/Paleo
      wahls_forbidden_soy: ['tempeh (niet soja)', 'linzen', 'kikkererwten'],
      wahls_forbidden_ultra_processed: ['verse variant', 'zonder toevoegingen'],
      wahls_limited_legumes: ['meer groente', 'extra eiwit (ei, vis)'],
      wahls_limited_non_gluten_grains: [
        'groente',
        'zoete aardappel',
        'pompoen',
      ],
    };
    return byCode[code] ?? [];
  }

  /**
   * Get substitution suggestions for an ingredient
   */
  private getSubstitutionSuggestions(
    ingredient: string,
    category?: string,
  ): string[] {
    const lowerIngredient = ingredient.toLowerCase();
    const suggestions: Record<string, string[]> = {
      // Gluten/grains
      pasta: [
        'rijstnoedels',
        'zucchininoedels',
        'glutenvrije pasta',
        'quinoa pasta',
        'rijst',
      ],
      tarwebloem: ['amandelmeel', 'rijstmeel', 'kokosmeel', 'tapiocameel'],
      wheat: ['amandelmeel', 'rijstmeel', 'kokosmeel', 'tapiocameel'],
      // Dairy
      melk: ['amandelmelk', 'havermelk', 'kokosmelk', 'rijstmelk'],
      milk: ['amandelmelk', 'havermelk', 'kokosmelk', 'rijstmelk'],
      kaas: ['plantaardige kaas', 'nutritional yeast', 'cashew kaas'],
      cheese: ['plantaardige kaas', 'nutritional yeast', 'cashew kaas'],
      // Sugar
      suiker: ['stevia', 'honing', 'agavesiroop', 'erythritol'],
      sugar: ['stevia', 'honing', 'agavesiroop', 'erythritol'],
    };

    // Check specific ingredient first
    if (suggestions[lowerIngredient]) {
      return suggestions[lowerIngredient];
    }

    // Check category-based suggestions
    if (category === 'grains' || category === 'gluten_containing_grains') {
      return ['rijst', 'quinoa', 'amandelmeel', 'rijstmeel'];
    }
    if (category === 'dairy') {
      return ['amandelmelk', 'havermelk', 'kokosmelk'];
    }
    if (category === 'processed_sugar') {
      return ['stevia', 'honing', 'agavesiroop'];
    }

    return [];
  }

  /**
   * Get category label
   */
  private getCategoryLabel(
    category: string,
    constraintType: 'hard' | 'soft',
  ): string {
    const labels: Record<string, string> = {
      grains: 'Glutenvrij dieet',
      gluten_containing_grains: 'Glutenvrij dieet',
      dairy: 'Lactose-intolerantie / Vegan',
      legumes: 'Paleo dieet',
      processed_sugar: 'Verminderde suikerinname',
    };

    return (
      labels[category] ||
      (constraintType === 'hard' ? 'Strikt verboden' : 'Niet gewenst')
    );
  }

  /**
   * Get diet name for display in prompts
   */
  private async getDietName(dietId: string): Promise<string> {
    try {
      const supabase = await createClient();
      const { data: dietType } = await supabase
        .from('diet_types')
        .select('name')
        .eq('id', dietId)
        .maybeSingle();

      return dietType?.name || 'het geselecteerde dieet';
    } catch (error) {
      console.error('[RecipeAdaptation] Error fetching diet name:', error);
      return 'het geselecteerde dieet';
    }
  }

  /**
   * Fallback ruleset if profile loading fails
   * Returns a basic ruleset with common forbidden ingredients
   */
  private getFallbackRuleset(dietId: string): DietRuleset {
    return {
      dietId,
      version: 1,
      forbidden: [
        {
          term: 'pasta',
          synonyms: [
            'spaghetti',
            'penne',
            'fusilli',
            'macaroni',
            'orzo',
            'risoni',
            'couscous',
            'noedels',
            'tagliatelle',
            'fettuccine',
            'linguine',
            'ravioli',
            'lasagne',
            'gnocchi',
          ],
          ruleCode: 'GLUTEN_FREE',
          ruleLabel: 'Glutenvrij dieet',
          substitutionSuggestions: [
            'rijstnoedels',
            'zucchininoedels',
            'glutenvrije pasta',
            'quinoa pasta',
            'rijst',
          ],
        },
        {
          term: 'tarwebloem',
          synonyms: ['tarwe', 'wheat', 'bloem', 'meel', 'tarwemeel'],
          ruleCode: 'GLUTEN_FREE',
          ruleLabel: 'Glutenvrij dieet',
          substitutionSuggestions: [
            'amandelmeel',
            'rijstmeel',
            'kokosmeel',
            'tapiocameel',
          ],
        },
        {
          term: 'melk',
          synonyms: ['koemelk', 'volle melk', 'halfvolle melk', 'magere melk'],
          ruleCode: 'LACTOSE_FREE',
          ruleLabel: 'Lactose-intolerantie',
          substitutionSuggestions: [
            'amandelmelk',
            'havermelk',
            'kokosmelk',
            'rijstmelk',
          ],
        },
        {
          term: 'suiker',
          synonyms: [
            'rietsuiker',
            'witte suiker',
            'kristalsuiker',
            'basterdsuiker',
          ],
          ruleCode: 'LOW_SUGAR',
          ruleLabel: 'Verminderde suikerinname',
          substitutionSuggestions: [
            'stevia',
            'honing',
            'agavesiroop',
            'erythritol',
          ],
        },
      ],
      heuristics: {
        addedSugarTerms: [
          'suiker',
          'siroop',
          'stroop',
          'honing',
          'glucose',
          'fructose',
          'sucrose',
        ],
      },
    };
  }

  /**
   * Load recipe from database
   *
   * Tries custom_meals first, then meal_history
   *
   * @param recipeId - Recipe ID
   * @param userId - User ID
   * @returns Recipe data or null if not found
   */
  private async loadRecipe(
    recipeId: string,
    userId: string,
  ): Promise<{
    mealData: Record<string, unknown>;
    mealName: string;
    steps: string[];
  } | null> {
    const supabase = await createClient();

    // Try custom_meals first
    const customMealsService = new CustomMealsService();
    const customMeal = await customMealsService.getMealById(recipeId, userId);

    if (customMeal) {
      let mealData = { ...(customMeal.mealData || {}) };
      // Instructions are stored in aiAnalysis, not in mealData (Meal type doesn't have instructions)
      const steps = customMeal.aiAnalysis?.instructions || [];

      // Fallback: als meal_data geen ingredienten heeft, probeer ai_analysis.ingredients (sommige imports)
      const hasRefs =
        Array.isArray(mealData.ingredientRefs) &&
        mealData.ingredientRefs.length > 0;
      const hasLegacy =
        Array.isArray(mealData.ingredients) && mealData.ingredients.length > 0;
      if (!hasRefs && !hasLegacy) {
        const aiIng = customMeal.aiAnalysis?.ingredients;
        if (Array.isArray(aiIng) && aiIng.length > 0) {
          mealData = {
            ...mealData,
            ingredients: aiIng.map((item: Record<string, unknown>) => {
              const qty = item.quantity ?? item.quantityG ?? item.amount ?? '';
              const amountNum = parseFloat(String(qty));
              return {
                name: String(
                  item.name ??
                    item.original_line ??
                    (typeof item === 'string' ? item : ''),
                ),
                quantity: String(qty),
                amount: Number.isNaN(amountNum) ? 0 : amountNum,
                unit: String(item.unit ?? ''),
                note: item.note ?? item.notes ?? null,
                original_line: String(
                  item.original_line ??
                    item.name ??
                    (typeof item === 'string' ? item : ''),
                ),
              };
            }),
          };
          console.log(
            `[RecipeAdaptation] Used ai_analysis.ingredients fallback (${aiIng.length} items)`,
          );
        }
      }

      const mealDataForLog = mealData as {
        ingredientRefs?: unknown[];
        ingredients?: unknown[];
      };
      console.log(`[RecipeAdaptation] Loaded custom meal:`, {
        name: customMeal.name,
        hasIngredientRefs: !!mealDataForLog.ingredientRefs?.length,
        ingredientRefsCount: mealDataForLog.ingredientRefs?.length || 0,
        hasIngredients: !!mealDataForLog.ingredients?.length,
        ingredientsCount: mealDataForLog.ingredients?.length || 0,
        hasAiAnalysis: !!customMeal.aiAnalysis,
        aiAnalysisInstructions:
          (Array.isArray(customMeal.aiAnalysis?.instructions)
            ? customMeal.aiAnalysis!.instructions!.length
            : 0) || 0,
      });

      return {
        mealData,
        mealName: customMeal.name,
        steps: Array.isArray(steps)
          ? (steps as unknown[]).map((s: unknown) =>
              typeof s === 'string'
                ? s
                : String(
                    (s as Record<string, unknown>).text ??
                      (s as Record<string, unknown>).step ??
                      s,
                  ),
            )
          : [],
      };
    }

    // Try meal_history
    const { data: mealHistory } = await supabase
      .from('meal_history')
      .select('*')
      .eq('id', recipeId)
      .eq('user_id', userId)
      .maybeSingle();

    if (mealHistory) {
      const rawMealData =
        (mealHistory.meal_data as Record<string, unknown>) || {};
      let mealData = {
        ...rawMealData,
      } as Record<string, unknown> & {
        ingredientRefs?: unknown[];
        ingredients?: unknown[];
      };
      const aiAnalysis = (mealHistory as Record<string, unknown>)
        .ai_analysis as
        | { instructions?: unknown[]; ingredients?: unknown[] }
        | undefined;
      const steps = aiAnalysis?.instructions ?? [];

      const hasRefs =
        Array.isArray(mealData.ingredientRefs) &&
        mealData.ingredientRefs.length > 0;
      const hasLegacy =
        Array.isArray(mealData.ingredients) && mealData.ingredients.length > 0;
      if (
        !hasRefs &&
        !hasLegacy &&
        Array.isArray(aiAnalysis?.ingredients) &&
        aiAnalysis.ingredients.length > 0
      ) {
        const aiIng = aiAnalysis.ingredients;
        mealData = {
          ...mealData,
          ingredients: (aiIng as unknown[]).map((item: unknown) => {
            const it = item as Record<string, unknown>;
            const qty = it.quantity ?? it.quantityG ?? it.amount ?? '';
            const amountNum = parseFloat(String(qty));
            return {
              name: String(
                it.name ??
                  it.original_line ??
                  (typeof item === 'string' ? item : ''),
              ),
              quantity: String(qty),
              amount: Number.isNaN(amountNum) ? 0 : amountNum,
              unit: String(it.unit ?? ''),
              note: it.note ?? it.notes ?? null,
              original_line: String(
                it.original_line ??
                  it.name ??
                  (typeof item === 'string' ? item : ''),
              ),
            };
          }),
        };
        console.log(
          `[RecipeAdaptation] Used meal_history ai_analysis.ingredients fallback (${aiIng.length} items)`,
        );
      }

      const mealDataTyped = mealData as {
        ingredientRefs?: unknown[];
        ingredients?: unknown[];
      };
      console.log(`[RecipeAdaptation] Loaded meal_history:`, {
        mealName: mealHistory.meal_name,
        hasIngredientRefs: !!mealDataTyped.ingredientRefs?.length,
        ingredientRefsCount: mealDataTyped.ingredientRefs?.length || 0,
        hasIngredients: !!mealDataTyped.ingredients?.length,
        ingredientsCount: mealDataTyped.ingredients?.length || 0,
        hasAiAnalysis: !!aiAnalysis,
        aiAnalysisInstructions: aiAnalysis?.instructions?.length || 0,
      });

      return {
        mealData,
        mealName: mealHistory.meal_name,
        steps: Array.isArray(steps)
          ? (steps as unknown[]).map((s: unknown) =>
              typeof s === 'string'
                ? s
                : String(
                    (s as Record<string, unknown>).text ??
                      (s as Record<string, unknown>).step ??
                      s,
                  ),
            )
          : [],
      };
    }

    return null;
  }

  /**
   * Analyze original recipe and find violations
   *
   * @param recipe - Recipe data
   * @param ruleset - Diet ruleset
   * @returns Array of violations found
   */
  private analyzeRecipeForViolations(
    recipe: {
      mealData: Record<string, unknown>;
      mealName: string;
      steps: string[];
    },
    ruleset: DietRuleset,
  ): ViolationDetail[] {
    const violations: ViolationDetail[] = [];
    const foundIngredients = new Set<string>(); // Track to avoid duplicates

    // Analyze ingredients: gebruik ingredientRefs als die items heeft, anders legacy ingredients
    const refsArr = Array.isArray(recipe.mealData?.ingredientRefs)
      ? recipe.mealData.ingredientRefs
      : [];
    const legacyArr = Array.isArray(recipe.mealData?.ingredients)
      ? recipe.mealData.ingredients
      : [];
    const refs = refsArr.filter(
      (r: unknown): r is NonNullable<typeof r> => r != null,
    );
    const legacy = legacyArr.filter(
      (r: unknown): r is NonNullable<typeof r> => r != null,
    );
    const ingredients = refs.length > 0 ? refs : legacy;

    console.log(`[RecipeAdaptation] ========================================`);
    console.log(`[RecipeAdaptation] Analyzing recipe: ${recipe.mealName}`);
    console.log(
      `[RecipeAdaptation] Ruleset has ${ruleset.forbidden.length} forbidden rules`,
    );
    console.log(
      `[RecipeAdaptation] Found ${ingredients.length} ingredients to analyze`,
    );

    // Log full ruleset for debugging
    console.log(
      `[RecipeAdaptation] FULL RULESET:`,
      JSON.stringify(ruleset.forbidden, null, 2),
    );

    // Log all ingredient names for debugging
    console.log(
      `[RecipeAdaptation] ALL INGREDIENTS:`,
      ingredients.map((ing: Record<string, unknown>) => ({
        displayName: ing?.displayName,
        name: ing?.name,
        original_line: ing?.original_line,
        note: ing?.note,
        full: ing,
      })),
    );

    console.log(`[RecipeAdaptation] ========================================`);

    for (const ing of ingredients) {
      const ingR = ing as Record<string, unknown>;
      // Displaynaam voor in de UI (eerste niet-lege veld)
      const ingredientName = String(
        ingR?.displayName ||
          ingR?.name ||
          ingR?.original_line ||
          (ingR?.nevoCode != null ? `NEVO ${ingR.nevoCode}` : null) ||
          (ing ?? ''),
      );

      if (!ingredientName || ingredientName.trim() === '') {
        console.log(`[RecipeAdaptation] Skipping empty ingredient:`, ing);
        continue;
      }

      const lowerName = String(ingredientName).toLowerCase().trim();
      if (foundIngredients.has(lowerName)) continue;

      // Gecombineerde zoektekst: alle relevante velden in één string zodat
      // "verse mozzarella (in blokjes, of geitenkaas)" en "honing" in note ook matchen
      const searchParts = [
        ingR?.displayName,
        ingR?.name,
        ingR?.original_line,
        ingR?.note,
      ].filter((v) => v != null && String(v).trim() !== '');
      const searchText = searchParts.join(' ');

      console.log(
        `[RecipeAdaptation] Checking ingredient: searchText="${searchText.substring(0, 80)}..."`,
      );

      const matches = findForbiddenMatches(searchText, ruleset, 'ingredients');

      if (matches.length > 0) {
        const match = matches[0];
        const isLegumesRule = (code: string, label: string) =>
          /legumes?|peulvruchten/i.test(code) ||
          /peulvruchten|legumes?/i.test(label);
        const defaultLegumeAlternatives = [
          'meer groente (bijv. sperziebonen, courgette)',
          'extra eiwit (ei, vis)',
          'paprika of broccoli',
        ];
        const substitutionSuggestions = match.substitutionSuggestions?.length
          ? match.substitutionSuggestions
          : isLegumesRule(match.ruleCode, match.ruleLabel)
            ? defaultLegumeAlternatives
            : undefined;
        const substitution = substitutionSuggestions?.length
          ? substitutionSuggestions[0] +
            (substitutionSuggestions.length > 1
              ? ` of ${substitutionSuggestions.slice(1, 3).join(', ')}`
              : '')
          : null;
        const suggestion =
          match.allowedAlternativeInText && substitution
            ? `Kies ${match.allowedAlternativeInText}, of vervang ${match.matched} door ${substitution}`
            : match.allowedAlternativeInText
              ? `Kies ${match.allowedAlternativeInText} (toegestaan)`
              : substitution
                ? `Vervang door ${substitution}`
                : `Vervang dit ingrediënt voor een dieet-compatibele variant`;
        violations.push({
          ingredientName,
          ruleCode: match.ruleCode,
          ruleLabel: match.ruleLabel,
          suggestion,
          allowedAlternativeInText: match.allowedAlternativeInText ?? undefined,
          matchedForbiddenTerm: match.matched,
          substitutionSuggestions,
        });
        foundIngredients.add(lowerName);

        // Log for debugging
        console.log(
          `[RecipeAdaptation] ✓ Found violation: ${ingredientName} -> ${match.ruleCode} (matched: ${match.matched})`,
        );
      } else {
        // Log all forbidden terms to help debug why no match
        const allForbiddenTerms = ruleset.forbidden.flatMap((f) => [
          f.term,
          ...(f.synonyms || []),
        ]);
        const hasPotentialMatch = allForbiddenTerms.some(
          (term) =>
            lowerName.includes(term.toLowerCase()) ||
            term.toLowerCase().includes(lowerName),
        );

        if (hasPotentialMatch) {
          console.warn(
            `[RecipeAdaptation] ⚠ Potential match found but not detected: "${ingredientName}" (lower: "${lowerName}")`,
          );
          console.warn(
            `[RecipeAdaptation]   All forbidden terms:`,
            allForbiddenTerms,
          );
          console.warn(`[RecipeAdaptation]   Testing manual match...`);

          // Manual test of each forbidden term
          for (const forbidden of ruleset.forbidden) {
            const lowerTerm = forbidden.term.toLowerCase();
            if (
              lowerName.includes(lowerTerm) ||
              lowerTerm.includes(lowerName)
            ) {
              console.warn(
                `[RecipeAdaptation]   → Should match "${forbidden.term}" but didn't!`,
              );
            }
            if (forbidden.synonyms) {
              for (const synonym of forbidden.synonyms) {
                const lowerSyn = synonym.toLowerCase();
                if (
                  lowerName.includes(lowerSyn) ||
                  lowerSyn.includes(lowerName)
                ) {
                  console.warn(
                    `[RecipeAdaptation]   → Should match synonym "${synonym}" of "${forbidden.term}" but didn't!`,
                  );
                }
              }
            }
          }
        } else {
          console.log(
            `[RecipeAdaptation]   No match for "${ingredientName}" (checked against ${allForbiddenTerms.length} terms)`,
          );
        }
      }
    }

    // Analyze steps for forbidden ingredients and added sugar heuristics
    // Steps might contain ingredient names that weren't in the ingredients list
    console.log(
      `[RecipeAdaptation] Analyzing ${recipe.steps.length} steps for violations`,
    );

    for (const step of recipe.steps) {
      const stepText = typeof step === 'string' ? step : String(step);

      if (!stepText || stepText.trim() === '') {
        continue;
      }

      console.log(
        `[RecipeAdaptation] Checking step: "${stepText.substring(0, 50)}..."`,
      );

      const matches = findForbiddenMatches(stepText, ruleset, 'steps');

      for (const match of matches) {
        // Check if this violation was already found in ingredients
        const alreadyFound = violations.some(
          (v) =>
            v.ingredientName
              .toLowerCase()
              .includes(match.matched.toLowerCase()) ||
            match.matched
              .toLowerCase()
              .includes(v.ingredientName.toLowerCase()) ||
            v.ruleCode === match.ruleCode,
        );
        // Als het ingrediënt handmatig al vervangen is door een voorgesteld alternatief,
        // toon geen step-violation: gebruiker heeft het probleem in de ingrediëntenlijst opgelost
        const substitutes = [
          ...(match.substitutionSuggestions ?? []),
          ...(match.allowedAlternativeInText
            ? match.allowedAlternativeInText
                .split(/\s+of\s+|\s*,\s*/)
                .map((s) => s.trim())
                .filter(Boolean)
            : []),
        ];
        const substituteVariants = new Set<string>();
        for (const s of substitutes) {
          const t = s.toLowerCase().trim();
          if (t) substituteVariants.add(t);
          if (t.includes('coconut aminos'))
            substituteVariants.add('kokos aminos');
          if (t.includes('kokos aminos'))
            substituteVariants.add('coconut aminos');
          if (t.includes('sea salt')) substituteVariants.add('zeezout');
          if (t.includes('zeezout')) substituteVariants.add('sea salt');
        }
        const ingredientNamesForSubstituteCheck = [
          ...ingredients.map((ing: Record<string, unknown>) =>
            String(
              ing?.displayName ?? ing?.name ?? ing?.original_line ?? '',
            ).toLowerCase(),
          ),
        ];
        const substituteAlreadyInRecipe = [...substituteVariants].some(
          (sub) => {
            return ingredientNamesForSubstituteCheck.some(
              (n) => n.includes(sub) || sub.includes(n),
            );
          },
        );

        if (!alreadyFound && !substituteAlreadyInRecipe) {
          // For sugar heuristics, add as violation
          if (match.ruleCode === 'LOW_SUGAR') {
            violations.push({
              ingredientName: match.matched,
              ruleCode: match.ruleCode,
              ruleLabel: match.ruleLabel,
              suggestion:
                match.substitutionSuggestions &&
                match.substitutionSuggestions.length > 0
                  ? `Vervang door ${match.substitutionSuggestions[0]} of verminder de hoeveelheid`
                  : `Verminder of vervang dit ingrediënt`,
              substitutionSuggestions: match.substitutionSuggestions,
            });
            console.log(
              `[RecipeAdaptation] ✓ Found sugar violation in step: ${match.matched}`,
            );
          } else {
            // For other forbidden ingredients found in steps (e.g., "voeg pasta toe")
            violations.push({
              ingredientName: match.matched,
              ruleCode: match.ruleCode,
              ruleLabel: match.ruleLabel,
              suggestion:
                match.substitutionSuggestions &&
                match.substitutionSuggestions.length > 0
                  ? `Vervang door ${match.substitutionSuggestions[0]}${match.substitutionSuggestions.length > 1 ? ` of ${match.substitutionSuggestions.slice(1, 3).join(', ')}` : ''}`
                  : `Vervang dit ingrediënt voor een dieet-compatibele variant`,
              substitutionSuggestions: match.substitutionSuggestions,
            });
            console.log(
              `[RecipeAdaptation] ✓ Found ingredient violation in step: ${match.matched} (${match.ruleCode})`,
            );
          }
        }
      }
    }

    console.log(
      `[RecipeAdaptation] Analysis complete: found ${violations.length} violation(s)`,
    );
    return violations;
  }

  /**
   * Normaliseer voor vergelijking: deel vóór eerste ":", lowercase, trim.
   */
  private static normalizedIngredientKey(s: string): string {
    const part = s.split(':')[0];
    return (part ?? s).toLowerCase().trim();
  }

  /**
   * Vind violation-index voor een ingredientregel.
   * Match: exact → genormaliseerd (deel vóór :) → bevat matchedForbiddenTerm (langste eerst).
   */
  private getViolationIndexForIngredient(
    ingredientName: string,
    violations: ViolationDetail[],
  ): number {
    const lower = ingredientName.toLowerCase().trim();
    const keyNorm =
      RecipeAdaptationService.normalizedIngredientKey(ingredientName);

    const exact = violations.findIndex(
      (v) => v.ingredientName.toLowerCase().trim() === lower,
    );
    if (exact >= 0) return exact;

    const byNorm = violations.findIndex(
      (v) =>
        RecipeAdaptationService.normalizedIngredientKey(v.ingredientName) ===
        keyNorm,
    );
    if (byNorm >= 0) return byNorm;

    const withTerm = violations
      .map((v, i) => ({
        i,
        term: v.matchedForbiddenTerm?.toLowerCase().trim(),
        len: (v.matchedForbiddenTerm ?? '').length,
      }))
      .filter((x) => x.term && lower.includes(x.term))
      .sort((a, b) => b.len - a.len);
    return withTerm[0]?.i ?? -1;
  }

  /**
   * Generate rewrite with substitutions
   *
   * @param recipe - Original recipe
   * @param violations - Found violations
   * @param ruleset - Diet ruleset
   * @param strict - Whether to use strict mode (no forbidden ingredients)
   * @param violationChoices - Per violation: use_allowed | substitute | remove
   * @returns Rewritten recipe
   */
  private generateRewrite(
    recipe: {
      mealData: Record<string, unknown>;
      mealName: string;
      steps: string[];
    },
    violations: ViolationDetail[],
    ruleset: DietRuleset,
    strict: boolean,
    violationChoices?: Array<{ choice: ViolationChoice; substitute?: string }>,
  ): {
    ingredients: IngredientLine[];
    steps: StepLine[];
    substitutions: Array<{ originalName: string; substituteName: string }>;
  } {
    const ingredients: IngredientLine[] = [];
    const steps: StepLine[] = [];
    const substitutions: Array<{
      originalName: string;
      substituteName: string;
    }> = [];

    if (violationChoices?.length !== undefined) {
      console.log(
        `[RecipeAdaptation] generateRewrite: violationChoices length=${violationChoices.length}, violations length=${violations.length}`,
      );
      violationChoices.slice(0, 5).forEach((c, i) => {
        console.log(`[RecipeAdaptation]   choice[${i}]=${c?.choice}`);
      });
    }

    // Termen die we in stappen als "(weglaten)" tonen (keuze "Schrappen")
    const removeTerms = new Set<string>();

    // Build substitution map
    // In strict mode, use ALL forbidden terms from ruleset, not just found violations
    const substitutionMap = new Map<string, string>();

    if (strict) {
      // In strict mode, build map from all forbidden rules
      for (const rule of ruleset.forbidden) {
        if (
          rule.substitutionSuggestions &&
          rule.substitutionSuggestions.length > 0
        ) {
          // Add main term
          substitutionMap.set(
            rule.term.toLowerCase(),
            rule.substitutionSuggestions[0],
          );
          // Add all synonyms
          if (rule.synonyms) {
            for (const synonym of rule.synonyms) {
              substitutionMap.set(
                synonym.toLowerCase(),
                rule.substitutionSuggestions[0],
              );
            }
          }
        } else {
          // Geen substitutie → voeg toe aan removeTerms zodat verboden termen
          // uit stappen worden gehaald (bijv. paprika zonder vervanging)
          removeTerms.add(rule.term.toLowerCase());
          for (const syn of rule.synonyms || []) {
            removeTerms.add(syn.toLowerCase());
          }
        }
      }
    } else {
      // In non-strict: violations + keuzes (use_allowed / substitute / remove)
      for (let j = 0; j < violations.length; j++) {
        const violation = violations[j];
        const choice = violationChoices?.[j]?.choice ?? 'substitute';
        const rule = ruleset.forbidden.find(
          (r) => r.ruleCode === violation.ruleCode,
        );
        const defaultSubstitute =
          rule?.substitutionSuggestions?.[0] ??
          firstSuggestedAlternativeFromSuggestion(violation.suggestion);

        if (choice === 'remove') {
          removeTerms.add(violation.ingredientName.toLowerCase().trim());
          if (violation.matchedForbiddenTerm) {
            removeTerms.add(violation.matchedForbiddenTerm.toLowerCase());
          }
          if (rule) {
            removeTerms.add(rule.term.toLowerCase());
            for (const syn of rule.synonyms || []) {
              removeTerms.add(syn.toLowerCase());
            }
          }
          continue;
        }

        if (choice === 'keep') {
          continue;
        }

        let substitute: string | undefined =
          choice === 'use_allowed' && violation.allowedAlternativeInText
            ? violation.allowedAlternativeInText.trim()
            : (violationChoices?.[j]?.substitute ??
              defaultSubstitute ??
              undefined);
        if (substitute && isGenericSuggestion(substitute)) {
          substitute = undefined;
        }

        if (substitute) {
          const key = violation.ingredientName.toLowerCase().trim();
          substitutionMap.set(key, substitute);
          const beforeColon = key.split(':')[0].trim();
          if (beforeColon && beforeColon !== key) {
            substitutionMap.set(beforeColon, substitute);
          }
          if (choice === 'use_allowed') {
            if (violation.matchedForbiddenTerm) {
              substitutionMap.set(
                violation.matchedForbiddenTerm.toLowerCase().trim(),
                substitute,
              );
            }
            if (rule) {
              substitutionMap.set(rule.term.toLowerCase(), substitute);
              for (const syn of rule.synonyms || []) {
                substitutionMap.set(syn.toLowerCase(), substitute);
              }
            }
          }
          if (choice !== 'use_allowed' && rule) {
            substitutionMap.set(rule.term.toLowerCase(), substitute);
            for (const syn of rule.synonyms || []) {
              substitutionMap.set(syn.toLowerCase(), substitute);
            }
          }
        }
      }
    }

    // Lookup substitute: exact → hoofdingrediënt (deel vóór :) → langste key in hoofdingrediënt → anders ergens in regel
    const substitutionEntries = [...substitutionMap.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    );
    const getSubstitution = (lowerName: string): string | undefined => {
      const exact = substitutionMap.get(lowerName);
      if (exact) return exact;
      const nameBeforeColon = lowerName.split(':')[0].trim();
      if (nameBeforeColon && substitutionMap.get(nameBeforeColon))
        return substitutionMap.get(nameBeforeColon);
      // Eerst: key die in het hoofdingrediënt (vóór :) past, langste eerst – zo wint "melk" boven "room" in "melk: 160 ml(of halfvolle room)"
      for (const [key, sub] of substitutionEntries) {
        if (
          nameBeforeColon &&
          (nameBeforeColon.includes(key) || key.includes(nameBeforeColon))
        )
          return sub;
      }
      // Daarna: key ergens in de hele regel (voor stappen of lange ingredientregels)
      for (const [key, sub] of substitutionEntries) {
        if (lowerName.includes(key) || key.includes(lowerName)) return sub;
      }
      return undefined;
    };

    // Rewrite ingredients: gebruik ingredientRefs als die items heeft, anders legacy ingredients
    const origRefsArr = Array.isArray(recipe.mealData?.ingredientRefs)
      ? recipe.mealData.ingredientRefs
      : [];
    const origLegacyArr = Array.isArray(recipe.mealData?.ingredients)
      ? recipe.mealData.ingredients
      : [];
    const origRefs = origRefsArr.filter(
      (r: unknown): r is NonNullable<typeof r> => r != null,
    );
    const origLegacy = origLegacyArr.filter(
      (r: unknown): r is NonNullable<typeof r> => r != null,
    );
    const originalIngredients = origRefs.length > 0 ? origRefs : origLegacy;

    // Alleen focussen op foute ingredienten: als we geen bronlijst hebben maar wel violations,
    // bouw een minimale lijst uit alleen de voorgestelde vervangingen (origineel → alternatief).
    if (originalIngredients.length === 0 && violations.length > 0) {
      for (const v of violations) {
        const substitute =
          firstSuggestedAlternativeFromSuggestion(v.suggestion) ??
          ruleset.forbidden.find((r) => r.ruleCode === v.ruleCode)
            ?.substitutionSuggestions?.[0];
        const name = substitute
          ? substitute.charAt(0).toUpperCase() + substitute.slice(1)
          : v.ingredientName;
        ingredients.push({
          name,
          quantity: '',
          unit: '',
          note: substitute
            ? `vervanging voor ${v.ingredientName}`
            : (v.ruleLabel ?? ''),
        });
      }
      // Stappen ongewijzigd doorgeven (geen substituties in tekst als we geen bron-ingredienten hadden)
      recipe.steps.forEach((step, index) => {
        const stepText = typeof step === 'string' ? step : String(step);
        steps.push({ step: index + 1, text: stepText });
      });
      return { ingredients, steps, substitutions: [] };
    }

    for (const ing of originalIngredients) {
      const ingR = ing as Record<string, unknown>;
      const ingredientName = String(
        ingR?.displayName || ingR?.name || ingR?.original_line || (ing ?? ''),
      );
      const quantity = ingR?.quantityG ?? ingR?.quantity ?? ingR?.amount ?? '';
      const unit = String(ingR?.unit ?? 'g');
      const noteRaw = ingR?.note ?? ingR?.notes;
      const note =
        noteRaw != null && noteRaw !== '' ? String(noteRaw) : undefined;
      const sectionRaw = (ingR as { section?: string | null } | null)?.section;
      const section =
        sectionRaw != null && sectionRaw !== ''
          ? String(sectionRaw)
          : undefined;

      const lowerName = ingredientName.toLowerCase();
      const violationIdx = this.getViolationIndexForIngredient(
        ingredientName,
        violations,
      );
      const choice = violationChoices?.[violationIdx]?.choice;

      if (choice === 'remove') {
        continue;
      }

      let substitution: string | undefined;

      if (strict) {
        const matches = findForbiddenMatches(
          ingredientName,
          ruleset,
          'ingredients',
        );
        if (matches.length > 0) {
          const match = matches[0];
          const rule = ruleset.forbidden.find(
            (r) => r.ruleCode === match.ruleCode,
          );
          if (
            rule?.substitutionSuggestions &&
            rule.substitutionSuggestions.length > 0
          ) {
            substitution = rule.substitutionSuggestions[0];
          }
        }
      } else {
        if (
          choice === 'use_allowed' &&
          violations[violationIdx]?.allowedAlternativeInText
        ) {
          substitution =
            violations[violationIdx].allowedAlternativeInText!.trim();
        } else {
          substitution = getSubstitution(lowerName);
        }
      }

      if (substitution) {
        const subStr = String(substitution);
        const substituteName = subStr.charAt(0).toUpperCase() + subStr.slice(1);
        ingredients.push({
          name: substituteName,
          quantity: String(quantity),
          unit,
          note: note ?? `vervanging voor ${ingredientName}`,
          ...(section != null && section !== '' ? { section } : {}),
        });
        substitutions.push({
          originalName: ingredientName,
          substituteName,
        });
      } else {
        ingredients.push({
          name: ingredientName,
          quantity: String(quantity),
          unit,
          note: note ?? undefined,
          ...(section != null && section !== '' ? { section } : {}),
        });
      }
    }

    // Rewrite steps: substituties toepassen; daarna "weglaten" voor keuze Schrappen
    const stepReplacements = [...substitutionMap.entries()].sort(
      (a, b) => b[0].length - a[0].length,
    );
    const removeTermsSorted = [...removeTerms].sort(
      (a, b) => b.length - a.length,
    );

    recipe.steps.forEach((step, index) => {
      const stepText = typeof step === 'string' ? step : String(step);
      let rewrittenText = stepText;

      for (const [original, substitution] of stepReplacements) {
        const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const subDisplay =
          substitution.charAt(0).toUpperCase() + substitution.slice(1);
        const useWordBoundary = original.length <= 6;
        const regex = useWordBoundary
          ? new RegExp(`\\b${escaped}\\b`, 'gi')
          : new RegExp(escaped, 'gi');
        rewrittenText = rewrittenText.replace(regex, subDisplay);
      }

      for (const term of removeTermsSorted) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Voor korte termen: word boundary + optionele possessief/meervoud ('s of s)
        // zodat "paprika's" en "groene paprika's" volledig worden vervangen
        const basePattern =
          term.length <= 8 ? `\\b${escaped}('s|s)?\\b` : `\\b${escaped}\\b`;
        const regex = new RegExp(basePattern, 'gi');
        rewrittenText = rewrittenText.replace(regex, '(weglaten)');
      }

      steps.push({
        step: index + 1,
        text: rewrittenText,
      });
    });

    return { ingredients, steps, substitutions };
  }

  /**
   * Generate draft with rewrite engine
   *
   * Analyzes the actual recipe and generates a draft based on real violations.
   * Bij twee-fase flow kan existingViolations worden meegegeven (dan wordt analyse overgeslagen).
   *
   * @param recipeId - Recipe ID
   * @param dietId - Diet ID
   * @param strict - Whether to use strict mode (for retry)
   * @param existingViolations - Optional; bij twee-fase flow uit eerdere getAnalysisOnly
   * @param violationChoices - Optional; per violation: use_allowed | substitute | remove
   * @returns Recipe adaptation draft
   */
  private async generateDraftWithEngine(
    recipeId: string,
    dietId: string,
    strict: boolean,
    existingViolations?: ViolationDetail[],
    violationChoices?: Array<{ choice: ViolationChoice; substitute?: string }>,
  ): Promise<RecipeAdaptationDraft> {
    // Load recipe, ruleset and diet name in parallel where possible
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const [recipe, ruleset, dietName] = await Promise.all([
      this.loadRecipe(recipeId, user.id),
      this.loadDietRuleset(dietId),
      this.getDietName(dietId),
    ]);

    if (!recipe) {
      throw new Error('Recipe not found');
    }
    if (!ruleset) {
      throw new Error('Ruleset not found');
    }

    const refsCount = Array.isArray(recipe.mealData?.ingredientRefs)
      ? recipe.mealData.ingredientRefs.length
      : 0;
    const ingsCount = Array.isArray(recipe.mealData?.ingredients)
      ? recipe.mealData.ingredients.length
      : 0;
    console.log(`[RecipeAdaptation] Loaded recipe:`, {
      mealName: recipe.mealName,
      hasMealData: !!recipe.mealData,
      ingredientRefsCount: refsCount,
      ingredientsCount: ingsCount,
      stepsCount: recipe.steps.length,
    });

    // Log ingredient structure for debugging
    const refsForLog = Array.isArray(recipe.mealData?.ingredientRefs)
      ? recipe.mealData.ingredientRefs
      : [];
    if (refsForLog.length > 0) {
      console.log(
        `[RecipeAdaptation] IngredientRefs sample:`,
        refsForLog
          .filter((ing: unknown): ing is NonNullable<typeof ing> => ing != null)
          .slice(0, 3)
          .map((ing: Record<string, unknown>) => ({
            displayName: ing?.displayName,
            nevoCode: ing?.nevoCode,
            quantityG: ing?.quantityG,
          })),
      );
    }
    const ingsForLog = Array.isArray(recipe.mealData?.ingredients)
      ? recipe.mealData.ingredients
      : [];
    if (ingsForLog.length > 0) {
      console.log(
        `[RecipeAdaptation] Ingredients sample:`,
        ingsForLog
          .filter((ing: unknown): ing is NonNullable<typeof ing> => ing != null)
          .slice(0, 3)
          .map((ing: Record<string, unknown>) => ({
            name: ing?.name,
            original_line: ing?.original_line,
            quantity: ing?.quantity,
            unit: ing?.unit,
          })),
      );
    }

    if (ruleset.forbidden.length === 0) {
      console.error(
        `[RecipeAdaptation] ⚠ ERROR: Ruleset has no forbidden rules! This will result in no violations being found.`,
      );
      console.error(`[RecipeAdaptation]   dietId: ${dietId}`);
      console.error(`[RecipeAdaptation]   Falling back to default ruleset...`);
      const fallbackRuleset = this.getFallbackRuleset(dietId);
      if (fallbackRuleset.forbidden.length > 0) {
        console.log(
          `[RecipeAdaptation]   Using fallback with ${fallbackRuleset.forbidden.length} rules`,
        );
        ruleset.forbidden = fallbackRuleset.forbidden;
      }
    }

    // Analyze for violations (of gebruik bestaande bij twee-fase flow)
    const violations =
      existingViolations !== undefined
        ? existingViolations
        : this.analyzeRecipeForViolations(recipe, ruleset);

    let draft: RecipeAdaptationDraft;

    if (violations.length > 0) {
      // Alleen niet-conforme ingredienten vervangen; recept en volgorde behouden (geen volledige herschrijving).
      let defaultChoices: Array<{
        choice: ViolationChoice;
        substitute?: string;
      }> =
        violationChoices ??
        violations.map((v) => {
          const rule = ruleset.forbidden.find((r) => r.ruleCode === v.ruleCode);
          const sub =
            rule?.substitutionSuggestions?.[0] ??
            firstSuggestedAlternativeFromSuggestion(v.suggestion);
          return {
            choice: 'substitute' as ViolationChoice,
            substitute: sub ?? undefined,
          };
        });
      const indicesNeedingAISubstitute = defaultChoices
        .map((c, j) =>
          c.choice === 'substitute' &&
          (!c.substitute || isGenericSuggestion(c.substitute))
            ? j
            : -1,
        )
        .filter((j) => j >= 0);
      if (indicesNeedingAISubstitute.length > 0 && dietName) {
        const aiSubs = await suggestConcreteSubstitutes(
          {
            mealData: recipe.mealData,
            mealName: recipe.mealName,
            steps: recipe.steps,
          },
          violations,
          indicesNeedingAISubstitute,
          ruleset,
          dietName,
        );
        defaultChoices = defaultChoices.map((c, j) => {
          const sub = aiSubs.get(j);
          if (sub != null) return { ...c, substitute: sub };
          return c;
        });
      }
      const {
        ingredients: rewriteIngredients,
        steps: rewriteSteps,
        substitutions: substitutionPairs,
      } = this.generateRewrite(
        {
          mealData: recipe.mealData,
          mealName: recipe.mealName,
          steps: recipe.steps,
        },
        violations,
        ruleset,
        false,
        defaultChoices,
      );
      const summary =
        substitutionPairs.length > 0
          ? `${substitutionPairs.length} ingrediënt${substitutionPairs.length !== 1 ? 'en' : ''} vervangen door passende alternatieven. Bereidingswijze licht aangepast waar nodig.`
          : `${violations.length} afwijking${violations.length !== 1 ? 'en' : ''} gevonden.`;
      draft = {
        analysis: { violations, summary },
        rewrite: {
          title: recipe.mealName,
          ingredients: rewriteIngredients,
          steps: rewriteSteps,
        },
        substitutions: substitutionPairs,
      };
    } else {
      // Geen afwijkingen: geen AI-call, alleen samenvatting
      const summary =
        'Geen afwijkingen gevonden! Dit recept past perfect bij jouw dieet.';
      const noViolRefs = Array.isArray(recipe.mealData?.ingredientRefs)
        ? recipe.mealData.ingredientRefs
        : [];
      const noViolIngs = Array.isArray(recipe.mealData?.ingredients)
        ? recipe.mealData.ingredients
        : [];
      draft = {
        analysis: { violations, summary },
        rewrite: {
          title: `Aangepast: ${recipe.mealName}`,
          ingredients:
            noViolRefs.length > 0
              ? (noViolRefs as (Record<string, unknown> | null)[])
                  .filter((ing): ing is Record<string, unknown> => ing != null)
                  .map((ing: Record<string, unknown>) => ({
                    name: String(
                      ing.displayName ?? ing.name ?? ing.original_line ?? ing,
                    ),
                    quantity: String(
                      ing.quantityG ?? ing.quantity ?? ing.amount ?? '',
                    ).trim(),
                    unit: String(ing.unit ?? '').trim() || undefined,
                    note:
                      ing.note != null || ing.notes != null
                        ? String(ing.note ?? ing.notes)
                        : undefined,
                    ...(ing.section != null && ing.section !== ''
                      ? { section: String(ing.section) }
                      : {}),
                  }))
              : noViolIngs.map((ing: Record<string, unknown>) => ({
                  name: String(ing.name ?? ing.original_line ?? ing),
                  quantity: String(ing.quantity ?? ing.amount ?? '').trim(),
                  unit: String(ing.unit ?? '').trim() || undefined,
                  note:
                    ing.note != null || ing.notes != null
                      ? String(ing.note ?? ing.notes)
                      : undefined,
                  ...(ing.section != null && ing.section !== ''
                    ? { section: String(ing.section) }
                    : {}),
                })),
          steps: recipe.steps.map((step, index) => ({
            step: index + 1,
            text: typeof step === 'string' ? step : String(step),
          })),
        },
        confidence: 1.0,
      };
    }

    console.log(`[RecipeAdaptation] Draft created successfully`);
    console.log(`[RecipeAdaptation] ========================================`);

    return draft;
  }

  /**
   * Evaluate vNext guard rails in shadow mode
   *
   * Runs vNext evaluation in parallel to legacy validation for comparison.
   * Results are added to diagnostics field (non-breaking).
   *
   * @param draft - Recipe adaptation draft
   * @param dietId - Diet ID
   * @param locale - Locale
   * @param recipeId - Recipe ID (for logging)
   * @param legacyValidation - Legacy validation result (for discrepancy detection)
   */
  private async evaluateVNextGuardrails(
    draft: RecipeAdaptationDraft,
    dietId: string,
    locale: string | undefined,
    recipeId: string,
    legacyValidation: ValidationReport,
  ): Promise<void> {
    try {
      // Map draft to vNext targets
      const targets = mapRecipeDraftToGuardrailsTargets(
        draft,
        locale === 'en' ? 'en' : 'nl',
      );

      // Determine locale (default to 'nl')
      const vNextLocale = (locale === 'en' ? 'en' : 'nl') as Locale;

      // Load vNext ruleset
      const ruleset = await loadGuardrailsRuleset({
        dietId,
        mode: 'recipe_adaptation',
        locale: vNextLocale,
      });

      // Build evaluation context
      const context: EvaluationContext = {
        dietId,
        locale: vNextLocale,
        mode: 'recipe_adaptation',
        timestamp: new Date().toISOString(),
      };

      // Evaluate with vNext
      const decision = evaluateGuardrails({
        ruleset,
        context,
        targets,
      });

      // Build diagnostics
      const diagnostics: GuardrailsVNextDiagnostics = {
        rulesetVersion: ruleset.version,
        contentHash: ruleset.contentHash,
        outcome: decision.outcome,
        ok: decision.ok,
        reasonCodes: decision.reasonCodes,
        counts: {
          matches: decision.matches.length,
          applied: decision.appliedRuleIds.length,
        },
      };

      // Add to draft (non-breaking: optional field)
      if (!draft.diagnostics) {
        draft.diagnostics = {};
      }
      draft.diagnostics.guardrailsVnext = diagnostics;

      // Log discrepancy if legacy and vNext outcomes differ
      const legacyOutcome = legacyValidation.ok ? 'allowed' : 'blocked';
      const vNextOutcome = decision.outcome;

      if (
        legacyOutcome !== vNextOutcome &&
        legacyOutcome === 'allowed' &&
        vNextOutcome === 'blocked'
      ) {
        // Legacy allowed but vNext blocked - potential safety issue
        console.warn(
          `[RecipeAdaptation] Guard rails discrepancy: legacy=${legacyOutcome}, vNext=${vNextOutcome}`,
          {
            recipeId,
            dietId,
            legacyViolations: legacyValidation.matches.length,
            vNextMatches: decision.matches.length,
            vNextHash: ruleset.contentHash.substring(0, 8),
          },
        );
      } else if (
        legacyOutcome !== vNextOutcome &&
        legacyOutcome === 'blocked' &&
        vNextOutcome === 'allowed'
      ) {
        // Legacy blocked but vNext allowed - potential false positive in legacy
        console.warn(
          `[RecipeAdaptation] Guard rails discrepancy: legacy=${legacyOutcome}, vNext=${vNextOutcome}`,
          {
            recipeId,
            dietId,
            legacyViolations: legacyValidation.matches.length,
            vNextMatches: decision.matches.length,
            vNextHash: ruleset.contentHash.substring(0, 8),
          },
        );
      }
    } catch (error) {
      // Don't throw - shadow mode should not break the request
      console.error(
        '[RecipeAdaptation] vNext guard rails evaluation error:',
        error,
      );
    }
  }
}
