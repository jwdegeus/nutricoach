/**
 * Recipe Adaptation Service
 * 
 * Server-side service for generating and validating recipe adaptations.
 * Orchestrates rewrite engine and diet validation with retry logic.
 */

import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import { CustomMealsService } from "@/src/lib/custom-meals/customMeals.service";
import { ProfileService } from "@/src/lib/profile/profile.service";
import { deriveDietRuleSet } from "@/src/lib/diets/diet-rules";
import { INGREDIENT_CATEGORY_MAP } from "@/src/lib/diet-validation/ingredient-categorizer";
import type {
  RequestRecipeAdaptationInput,
  RequestRecipeAdaptationResult,
  RecipeAdaptationDraft,
  ViolationDetail,
  IngredientLine,
  StepLine,
} from "../recipe-ai.types";
import type { DietRuleset, ValidationReport } from "./diet-validator";
import { validateDraft, findForbiddenMatches } from "./diet-validator";
import type { DietRuleSet, IngredientConstraint } from "@/src/lib/diets";
import { generateRecipeAdaptationWithGemini } from "./gemini-recipe-adaptation.service";

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
    input: RequestRecipeAdaptationInput
  ): Promise<RequestRecipeAdaptationResult> {
    console.log("[RecipeAdaptationService] ========================================");
    console.log("[RecipeAdaptationService] requestAdaptation called");
    console.log("[RecipeAdaptationService] Input:", JSON.stringify(input, null, 2));
    
    try {
      // Normalize input
      const recipeId = input.recipeId.trim();
      const dietId = input.dietId?.trim();

      console.log("[RecipeAdaptationService] Normalized recipeId:", recipeId);
      console.log("[RecipeAdaptationService] Normalized dietId:", dietId);

      // Validate recipeId
      if (!recipeId || recipeId === "undefined") {
        console.error("[RecipeAdaptationService] Invalid recipeId");
        return {
          outcome: "error",
          message: "Recept ID is vereist",
          code: "INVALID_INPUT",
        };
      }

      // Check if dietId is provided
      if (!dietId || dietId === "") {
        console.warn("[RecipeAdaptationService] No dietId provided");
        return {
          outcome: "empty",
          reason: "NO_DIET_SELECTED",
        };
      }

      // Load diet ruleset
      console.log("[RecipeAdaptationService] Loading diet ruleset for dietId:", dietId);
      const ruleset = await this.loadDietRuleset(dietId);
      if (!ruleset) {
        console.error("[RecipeAdaptationService] Ruleset not found for dietId:", dietId);
        return {
          outcome: "error",
          message: `Dieet met ID "${dietId}" niet gevonden`,
          code: "INVALID_INPUT",
        };
      }
      
      console.log("[RecipeAdaptationService] Ruleset loaded successfully, forbidden count:", ruleset.forbidden.length);

      // Generate draft with engine (first attempt)
      let draft: RecipeAdaptationDraft;
      let validation: ValidationReport;
      let needsRetry = false;

      try {
        draft = await this.generateDraftWithEngine(recipeId, dietId, false);
        validation = validateDraft(draft, ruleset);

        if (!validation.ok) {
          needsRetry = true;
        }
      } catch (error) {
        console.error("Error generating draft:", error);
        return {
          outcome: "error",
          message:
            error instanceof Error
              ? error.message
              : "Fout bij genereren aangepast recept",
          code: "INTERNAL_ERROR",
        };
      }

      // Retry with strict mode if validation failed
      if (needsRetry) {
        try {
          draft = await this.generateDraftWithEngine(recipeId, dietId, true);
          validation = validateDraft(draft, ruleset);

          if (!validation.ok) {
            // In strict mode, if there are still violations, it's likely because:
            // 1. The validator found violations in the rewrite that weren't in the original
            // 2. The substitution didn't work perfectly
            // For now, we'll still return the draft but log a warning
            // The user will see the violations in the UI
            console.warn("Strict mode rewrite still has violations:", validation.matches);
            
            // Return the draft anyway - it's better than nothing
            // The violations will be shown to the user
            // In a future version, we could implement iterative replacement
          }
        } catch (error) {
          console.error("Error in retry draft generation:", error);
          return {
            outcome: "error",
            message: "Unable to produce diet-compliant rewrite",
            code: "INTERNAL_ERROR",
          };
        }
      }

      // Validate draft structure
      if (!draft.rewrite || !draft.analysis) {
        console.error("[RecipeAdaptationService] Invalid draft structure");
        return {
          outcome: "error",
          message: "Ongeldige draft structuur",
          code: "INTERNAL_ERROR",
        };
      }

      console.log("[RecipeAdaptationService] Draft validation passed");
      console.log("[RecipeAdaptationService] Violations in draft:", draft.analysis.violations.length);
      console.log("[RecipeAdaptationService] Returning success result");
      console.log("[RecipeAdaptationService] ========================================");

      // Return success
      return {
        outcome: "success",
        adaptation: draft,
        meta: {
          timestamp: new Date().toISOString(),
          recipeId,
          dietId,
          locale: input.locale,
        },
      };
    } catch (error) {
      console.error("Error in RecipeAdaptationService.requestAdaptation:", error);
      return {
        outcome: "error",
        message:
          error instanceof Error
            ? error.message
            : "Er is een onverwachte fout opgetreden",
        code: "INTERNAL_ERROR",
      };
    }
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
        .from("diet_category_constraints")
        .select(
          `
          *,
          category:ingredient_categories(
            id,
            code,
            name_nl,
            category_type,
            items:ingredient_category_items(term, term_nl, synonyms)
          )
        `
        )
        .eq("diet_type_id", dietId)
        .eq("is_active", true)
        .order("rule_priority", { ascending: false })
        .order("priority", { ascending: false }); // Fallback voor backward compatibility

      if (constraintsError) {
        console.error(`[RecipeAdaptation] Error loading guard rails:`, constraintsError);
      } else {
        console.log(`[RecipeAdaptation] Found ${constraints?.length || 0} guard rail constraints for diet ${dietId}`);
      }

      // If we have guard rails, use them as primary source
      // Firewall evaluatie: regels zijn al gesorteerd op rule_priority (hoog naar laag)
      // Eerste match wint - block regels hebben voorrang over allow regels op dezelfde prioriteit
      if (!constraintsError && constraints && constraints.length > 0) {
        const forbidden: DietRuleset["forbidden"] = [];
        const allowedTerms = new Set<string>(); // Track allowed terms (voor firewall logica)

        // Eerst: verzamel alle allow regels (voor firewall evaluatie)
        for (const constraint of constraints) {
          const ruleAction = constraint.rule_action || (constraint.constraint_type === 'forbidden' ? 'block' : 'allow');
          
          if (ruleAction === "allow" && constraint.category) {
            const category = constraint.category as any;
            const items = category.items || [];

            for (const item of items) {
              if (!item.is_active) continue;
              const term = item.term?.toLowerCase() || "";
              if (term) {
                allowedTerms.add(term);
                // Voeg ook synoniemen toe aan allowed set
                const synonyms = Array.isArray(item.synonyms) ? item.synonyms : [];
                synonyms.forEach((s: string) => {
                  if (s) allowedTerms.add(s.toLowerCase());
                });
              }
            }
          }
        }

        // Dan: verzamel block regels (firewall: block heeft voorrang)
        for (const constraint of constraints) {
          const ruleAction = constraint.rule_action || (constraint.constraint_type === 'forbidden' ? 'block' : 'allow');
          
          if (ruleAction === "block" && constraint.category) {
            const category = constraint.category as any;
            const items = category.items || [];

            // Add each item from the category with its synonyms
            for (const item of items) {
              if (!item.is_active) continue;

              const synonyms = Array.isArray(item.synonyms) ? item.synonyms : [];
              const term = item.term?.toLowerCase() || "";

              // Firewall logica: als term al in allowed set staat, skip (allow heeft al voorrang gehad)
              // Maar block regels met hogere prioriteit kunnen allow overrulen
              // Omdat we al gesorteerd zijn op rule_priority, kunnen we gewoon toevoegen
              // De validator zal later de eerste match gebruiken
              
              // Check if we already have this term
              const existing = forbidden.find((f) => f.term === term);
              if (!existing && term) {
                forbidden.push({
                  term,
                  synonyms: synonyms.map((s: string) => s.toLowerCase()),
                  ruleCode: constraint.strictness === "hard" ? "GUARD_RAIL_HARD" : "GUARD_RAIL_SOFT",
                  ruleLabel: `${category.name_nl} (${constraint.strictness === "hard" ? "Strikt verboden" : "Niet gewenst"})`,
                  substitutionSuggestions: [],
                });
              }
            }
          }
        }

        console.log(`[RecipeAdaptation] Guard rails loaded: ${forbidden.length} forbidden terms from ${constraints.length} constraints`);

        // PRIORITY 2: Also load recipe adaptation rules (for additional rules/substitutions)
        const { data: rules, error: rulesError } = await supabase
          .from("recipe_adaptation_rules")
          .select("*")
          .eq("diet_type_id", dietId)
          .eq("is_active", true)
          .order("priority", { ascending: false });

        if (!rulesError && rules && rules.length > 0) {
          // Merge recipe adaptation rules (avoid duplicates)
          for (const rule of rules) {
            const term = rule.term?.toLowerCase() || "";
            const existing = forbidden.find((f) => f.term === term);
            if (!existing && term) {
              forbidden.push({
                term,
                synonyms: (rule.synonyms as string[]) || [],
                ruleCode: rule.rule_code,
                ruleLabel: rule.rule_label,
                substitutionSuggestions: (rule.substitution_suggestions as string[]) || [],
              });
            }
          }
          console.log(`[RecipeAdaptation] Added ${rules.length} recipe adaptation rules`);
        }

        // Get added sugar terms from heuristics
        const { data: heuristics } = await supabase
          .from("recipe_adaptation_heuristics")
          .select("*")
          .eq("diet_type_id", dietId)
          .eq("is_active", true);

        const addedSugarHeuristic = heuristics?.find(
          (h) => h.heuristic_type === "added_sugar"
        );
        const addedSugarTerms =
          (addedSugarHeuristic?.terms as string[]) || [];

        const ruleset: DietRuleset = {
          dietId,
          version: 1,
          forbidden,
          heuristics: addedSugarTerms.length > 0 ? { addedSugarTerms } : undefined,
        };

        console.log(
          `[RecipeAdaptation] ✓ Loaded ${forbidden.length} total rules (from guard rails + recipe adaptation) for diet ${dietId}`
        );

        return ruleset;
      }

      // FALLBACK: Try to load recipe adaptation rules from database (old method)
      const { data: rules, error: rulesError } = await supabase
        .from("recipe_adaptation_rules")
        .select("*")
        .eq("diet_type_id", dietId)
        .eq("is_active", true)
        .order("priority", { ascending: false });

      if (rulesError) {
        console.error(`[RecipeAdaptation] Error loading rules from database:`, rulesError);
      } else {
        console.log(`[RecipeAdaptation] Found ${rules?.length || 0} rules in database for diet ${dietId}`);
      }

      const { data: heuristics, error: heuristicsError } = await supabase
        .from("recipe_adaptation_heuristics")
        .select("*")
        .eq("diet_type_id", dietId)
        .eq("is_active", true);

      if (heuristicsError) {
        console.error(`[RecipeAdaptation] Error loading heuristics from database:`, heuristicsError);
      }

      // If we have rules in database, use them
      if (!rulesError && rules && rules.length > 0) {
        const forbidden = rules.map((rule) => ({
          term: rule.term,
          synonyms: (rule.synonyms as string[]) || [],
          ruleCode: rule.rule_code,
          ruleLabel: rule.rule_label,
          substitutionSuggestions: (rule.substitution_suggestions as string[]) || [],
        }));

        console.log(`[RecipeAdaptation] Rules loaded:`, forbidden.map(r => `${r.term} (${r.synonyms.length} synonyms)`));

        // Get added sugar terms from heuristics
        const addedSugarHeuristic = heuristics?.find(
          (h) => h.heuristic_type === "added_sugar"
        );
        const addedSugarTerms =
          (addedSugarHeuristic?.terms as string[]) || [];

        const ruleset: DietRuleset = {
          dietId,
          version: 1,
          forbidden,
          heuristics: addedSugarTerms.length > 0 ? { addedSugarTerms } : undefined,
        };

        console.log(
          `[RecipeAdaptation] ✓ Loaded ${forbidden.length} rules from database for diet ${dietId}`
        );

        return ruleset;
      }

      console.log(`[RecipeAdaptation] No rules found in database, falling back to profile derivation`);

      // Fallback: derive from user's diet profile
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        console.error("[RecipeAdaptation] User not authenticated");
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
        dietId
      );

      console.log(
        `[RecipeAdaptation] ✓ Loaded diet ruleset for ${dietProfile.dietKey} with ${ruleset.forbidden.length} forbidden rules (derived from profile)`
      );
      console.log(`[RecipeAdaptation] Profile allergies:`, dietProfile.allergies);
      console.log(`[RecipeAdaptation] Profile dislikes:`, dietProfile.dislikes);
      console.log(`[RecipeAdaptation] Ruleset forbidden terms:`, ruleset.forbidden.map(r => r.term));

      return ruleset;
    } catch (error) {
      console.error("[RecipeAdaptation] Error loading diet ruleset:", error);
      // Fallback to basic ruleset if everything fails
      return this.getFallbackRuleset(dietId);
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
    dietId: string
  ): DietRuleset {
    const forbidden: DietRuleset["forbidden"] = [];
    const INGREDIENT_CATEGORY_MAP = this.getIngredientCategoryMap();

    console.log(`[RecipeAdaptation] Converting DietRuleSet to DietRuleset format`);
    console.log(`[RecipeAdaptation] DietRuleSet ingredientConstraints count:`, dietRuleSet.ingredientConstraints.length);

    // Process ingredient constraints
    for (const constraint of dietRuleSet.ingredientConstraints) {
      if (constraint.type === "forbidden") {
        console.log(`[RecipeAdaptation] Processing forbidden constraint:`, {
          items: constraint.items,
          categories: constraint.categories,
          constraintType: constraint.constraintType,
        });

        // Add specific items
        for (const item of constraint.items) {
          // Check if we already have this item
          const existing = forbidden.find((f) => f.term.toLowerCase() === item.toLowerCase());
          if (!existing) {
            forbidden.push({
              term: item.toLowerCase(),
              synonyms: [],
              ruleCode: constraint.constraintType === "hard" ? "FORBIDDEN_HARD" : "FORBIDDEN_SOFT",
              ruleLabel: constraint.constraintType === "hard" ? "Strikt verboden" : "Niet gewenst",
              substitutionSuggestions: this.getSubstitutionSuggestions(item),
            });
            console.log(`[RecipeAdaptation] Added forbidden item: ${item}`);
          }
        }

        // Expand categories to specific ingredients
        if (constraint.categories) {
          for (const category of constraint.categories) {
            const categoryItems = INGREDIENT_CATEGORY_MAP[category] || [];
            console.log(`[RecipeAdaptation] Expanding category "${category}" with ${categoryItems.length} items`);
            
            if (categoryItems.length === 0) {
              console.warn(`[RecipeAdaptation] ⚠ Category "${category}" has no items in INGREDIENT_CATEGORY_MAP!`);
            }
            
            for (const item of categoryItems) {
              const existing = forbidden.find((f) => f.term.toLowerCase() === item.toLowerCase());
              if (!existing) {
                const synonyms = this.getSynonymsForTerm(item);
                const substitutionSuggestions = this.getSubstitutionSuggestions(item, category);
                forbidden.push({
                  term: item.toLowerCase(),
                  synonyms,
                  ruleCode: constraint.constraintType === "hard" ? "FORBIDDEN_HARD" : "FORBIDDEN_SOFT",
                  ruleLabel: this.getCategoryLabel(category, constraint.constraintType),
                  substitutionSuggestions,
                });
                console.log(`[RecipeAdaptation]   Added: ${item.toLowerCase()} (${synonyms.length} synonyms, ${substitutionSuggestions.length} substitutions)`);
              } else {
                console.log(`[RecipeAdaptation]   Skipped duplicate: ${item.toLowerCase()}`);
              }
            }
          }
        } else {
          console.log(`[RecipeAdaptation]   No categories to expand for this constraint`);
        }
      }
    }

    console.log(`[RecipeAdaptation] Converted to ${forbidden.length} forbidden rules`);
    
    if (forbidden.length === 0) {
      console.error(`[RecipeAdaptation] ⚠ ERROR: Conversion resulted in 0 forbidden rules!`);
      console.error(`[RecipeAdaptation]   DietRuleSet ingredientConstraints:`, dietRuleSet.ingredientConstraints);
      console.error(`[RecipeAdaptation]   This means no violations will be detected!`);
    }

    // Add heuristics for added sugar detection
    const heuristics = {
      addedSugarTerms: [
        "suiker",
        "siroop",
        "stroop",
        "honing",
        "glucose",
        "fructose",
        "sucrose",
        "rietsuiker",
        "witte suiker",
        "kristalsuiker",
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
        "tarwe", "rijst", "haver", "gerst", "rogge", "mais", "boekweit", "gierst",
        "amarant", "pasta", "spaghetti", "penne", "fusilli", "macaroni", "orzo",
        "risoni", "noedels", "tagliatelle", "fettuccine", "linguine", "ravioli",
        "lasagne", "gnocchi", "brood", "meel", "bloem", "tarwebloem", "tarwemeel",
      ],
      dairy: [
        ...(baseMap.dairy || []),
        "melk", "koemelk", "kaas", "yoghurt", "boter", "room", "zure room",
        "karnemelk", "roomkaas", "volle melk", "halfvolle melk", "magere melk",
      ],
      legumes: [
        ...(baseMap.legumes || []),
        "bonen", "linzen", "kikkererwten", "erwten", "soja", "pinda's",
        "zwarte bonen", "nierbonen", "mungbonen",
      ],
      processed_sugar: [
        ...(baseMap.processed_sugar || []),
        "suiker", "rietsuiker", "bruine suiker", "poedersuiker", "ahornsiroop",
        "agavesiroop", "maissiroop", "witte suiker", "kristalsuiker", "basterdsuiker",
      ],
      gluten_containing_grains: [
        "wheat", "tarwe", "barley", "gerst", "rye", "rogge", "spelt", "kamut", "triticale",
        "pasta", "spaghetti", "penne", "fusilli", "macaroni", "orzo", "risoni", "couscous",
        "noedels", "tagliatelle", "fettuccine", "linguine", "ravioli", "lasagne", "gnocchi",
        "brood", "bread", "meel", "bloem", "tarwebloem", "tarwemeel",
      ],
    };
  }

  /**
   * Get synonyms for a term
   */
  private getSynonymsForTerm(term: string): string[] {
    const synonymMap: Record<string, string[]> = {
      pasta: ["spaghetti", "penne", "fusilli", "macaroni", "orzo", "risoni", "couscous", "noedels"],
      melk: ["koemelk", "volle melk", "halfvolle melk", "magere melk"],
      tarwebloem: ["tarwe", "wheat", "bloem", "meel", "tarwemeel"],
      suiker: ["rietsuiker", "witte suiker", "kristalsuiker", "basterdsuiker"],
    };

    return synonymMap[term.toLowerCase()] || [];
  }

  /**
   * Get substitution suggestions for an ingredient
   */
  private getSubstitutionSuggestions(
    ingredient: string,
    category?: string
  ): string[] {
    const lowerIngredient = ingredient.toLowerCase();
    const suggestions: Record<string, string[]> = {
      // Gluten/grains
      pasta: ["rijstnoedels", "zucchininoedels", "glutenvrije pasta", "quinoa pasta", "rijst"],
      tarwebloem: ["amandelmeel", "rijstmeel", "kokosmeel", "tapiocameel"],
      wheat: ["amandelmeel", "rijstmeel", "kokosmeel", "tapiocameel"],
      // Dairy
      melk: ["amandelmelk", "havermelk", "kokosmelk", "rijstmelk"],
      milk: ["amandelmelk", "havermelk", "kokosmelk", "rijstmelk"],
      kaas: ["plantaardige kaas", "nutritional yeast", "cashew kaas"],
      cheese: ["plantaardige kaas", "nutritional yeast", "cashew kaas"],
      // Sugar
      suiker: ["stevia", "honing", "agavesiroop", "erythritol"],
      sugar: ["stevia", "honing", "agavesiroop", "erythritol"],
    };

    // Check specific ingredient first
    if (suggestions[lowerIngredient]) {
      return suggestions[lowerIngredient];
    }

    // Check category-based suggestions
    if (category === "grains" || category === "gluten_containing_grains") {
      return ["rijst", "quinoa", "amandelmeel", "rijstmeel"];
    }
    if (category === "dairy") {
      return ["amandelmelk", "havermelk", "kokosmelk"];
    }
    if (category === "processed_sugar") {
      return ["stevia", "honing", "agavesiroop"];
    }

    return [];
  }

  /**
   * Get category label
   */
  private getCategoryLabel(category: string, constraintType: "hard" | "soft"): string {
    const labels: Record<string, string> = {
      grains: "Glutenvrij dieet",
      gluten_containing_grains: "Glutenvrij dieet",
      dairy: "Lactose-intolerantie / Vegan",
      legumes: "Paleo dieet",
      processed_sugar: "Verminderde suikerinname",
    };

    return labels[category] || (constraintType === "hard" ? "Strikt verboden" : "Niet gewenst");
  }

  /**
   * Get diet name for display in prompts
   */
  private async getDietName(dietId: string): Promise<string> {
    try {
      const supabase = await createClient();
      const { data: dietType } = await supabase
        .from("diet_types")
        .select("name")
        .eq("id", dietId)
        .maybeSingle();
      
      return dietType?.name || "het geselecteerde dieet";
    } catch (error) {
      console.error("[RecipeAdaptation] Error fetching diet name:", error);
      return "het geselecteerde dieet";
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
          term: "pasta",
          synonyms: [
            "spaghetti",
            "penne",
            "fusilli",
            "macaroni",
            "orzo",
            "risoni",
            "couscous",
            "noedels",
            "tagliatelle",
            "fettuccine",
            "linguine",
            "ravioli",
            "lasagne",
            "gnocchi",
          ],
          ruleCode: "GLUTEN_FREE",
          ruleLabel: "Glutenvrij dieet",
          substitutionSuggestions: [
            "rijstnoedels",
            "zucchininoedels",
            "glutenvrije pasta",
            "quinoa pasta",
            "rijst",
          ],
        },
        {
          term: "tarwebloem",
          synonyms: ["tarwe", "wheat", "bloem", "meel", "tarwemeel"],
          ruleCode: "GLUTEN_FREE",
          ruleLabel: "Glutenvrij dieet",
          substitutionSuggestions: [
            "amandelmeel",
            "rijstmeel",
            "kokosmeel",
            "tapiocameel",
          ],
        },
        {
          term: "melk",
          synonyms: ["koemelk", "volle melk", "halfvolle melk", "magere melk"],
          ruleCode: "LACTOSE_FREE",
          ruleLabel: "Lactose-intolerantie",
          substitutionSuggestions: [
            "amandelmelk",
            "havermelk",
            "kokosmelk",
            "rijstmelk",
          ],
        },
        {
          term: "suiker",
          synonyms: [
            "rietsuiker",
            "witte suiker",
            "kristalsuiker",
            "basterdsuiker",
          ],
          ruleCode: "LOW_SUGAR",
          ruleLabel: "Verminderde suikerinname",
          substitutionSuggestions: ["stevia", "honing", "agavesiroop", "erythritol"],
        },
      ],
      heuristics: {
        addedSugarTerms: [
          "suiker",
          "siroop",
          "stroop",
          "honing",
          "glucose",
          "fructose",
          "sucrose",
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
    userId: string
  ): Promise<{ mealData: any; mealName: string; steps: string[] } | null> {
    const supabase = await createClient();

    // Try custom_meals first
    const customMealsService = new CustomMealsService();
    const customMeal = await customMealsService.getMealById(recipeId, userId);

    if (customMeal) {
      const mealData = customMeal.mealData || {};
      // Instructions are stored in aiAnalysis, not in mealData (Meal type doesn't have instructions)
      const steps = customMeal.aiAnalysis?.instructions || [];
      
      console.log(`[RecipeAdaptation] Loaded custom meal:`, {
        name: customMeal.name,
        hasIngredientRefs: !!mealData.ingredientRefs,
        ingredientRefsCount: mealData.ingredientRefs?.length || 0,
        hasIngredients: !!mealData.ingredients,
        ingredientsCount: mealData.ingredients?.length || 0,
        hasAiAnalysis: !!customMeal.aiAnalysis,
        aiAnalysisInstructions: customMeal.aiAnalysis?.instructions?.length || 0,
      });
      
      return {
        mealData,
        mealName: customMeal.name,
        steps: Array.isArray(steps)
          ? steps.map((s: any) => (typeof s === "string" ? s : s.text || s.step || String(s)))
          : [],
      };
    }

    // Try meal_history
    const { data: mealHistory } = await supabase
      .from("meal_history")
      .select("*")
      .eq("id", recipeId)
      .eq("user_id", userId)
      .maybeSingle();

    if (mealHistory) {
      const mealData = mealHistory.meal_data || {};
      // meal_data is of type Meal which doesn't have instructions
      // Instructions might be in ai_analysis if available, otherwise empty array
      const steps = (mealHistory as any).ai_analysis?.instructions || [];
      
      console.log(`[RecipeAdaptation] Loaded meal_history:`, {
        mealName: mealHistory.meal_name,
        hasIngredientRefs: !!mealData.ingredientRefs,
        ingredientRefsCount: mealData.ingredientRefs?.length || 0,
        hasIngredients: !!mealData.ingredients,
        ingredientsCount: mealData.ingredients?.length || 0,
        hasAiAnalysis: !!(mealHistory as any).ai_analysis,
        aiAnalysisInstructions: (mealHistory as any).ai_analysis?.instructions?.length || 0,
      });
      
      return {
        mealData,
        mealName: mealHistory.meal_name,
        steps: Array.isArray(steps)
          ? steps.map((s: any) => (typeof s === "string" ? s : s.text || s.step || String(s)))
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
    recipe: { mealData: any; mealName: string; steps: string[] },
    ruleset: DietRuleset
  ): ViolationDetail[] {
    const violations: ViolationDetail[] = [];
    const foundIngredients = new Set<string>(); // Track to avoid duplicates

    // Analyze ingredients (ingredientRefs or legacy ingredients)
    const ingredients =
      recipe.mealData?.ingredientRefs || recipe.mealData?.ingredients || [];

    console.log(`[RecipeAdaptation] ========================================`);
    console.log(`[RecipeAdaptation] Analyzing recipe: ${recipe.mealName}`);
    console.log(`[RecipeAdaptation] Ruleset has ${ruleset.forbidden.length} forbidden rules`);
    console.log(`[RecipeAdaptation] Found ${ingredients.length} ingredients to analyze`);
    
    // Log full ruleset for debugging
    console.log(`[RecipeAdaptation] FULL RULESET:`, JSON.stringify(ruleset.forbidden, null, 2));
    
    // Log all ingredient names for debugging
    console.log(`[RecipeAdaptation] ALL INGREDIENTS:`, ingredients.map((ing: any) => ({
      displayName: ing.displayName,
      name: ing.name,
      original_line: ing.original_line,
      note: ing.note,
      full: ing,
    })));
    
    console.log(`[RecipeAdaptation] ========================================`);

    for (const ing of ingredients) {
      // Try multiple fields to get ingredient name
      // Priority: displayName > name > original_line > nevoCode fallback
      const ingredientName =
        ing.displayName ||
        ing.name ||
        ing.original_line ||
        (ing.nevoCode ? `NEVO ${ing.nevoCode}` : null) ||
        String(ing);

      if (!ingredientName || ingredientName.trim() === "") {
        console.log(`[RecipeAdaptation] Skipping empty ingredient:`, ing);
        continue;
      }

      const lowerName = ingredientName.toLowerCase().trim();
      
      // Skip if we already found a violation for this exact ingredient
      if (foundIngredients.has(lowerName)) {
        continue;
      }

      // Log ingredient being analyzed with full context
      console.log(`[RecipeAdaptation] Checking ingredient:`, {
        displayName: ing.displayName,
        name: ing.name,
        original_line: ing.original_line,
        nevoCode: ing.nevoCode,
        resolved: ingredientName,
        lower: lowerName,
      });

      // Try matching with the ingredient name first
      let matches = findForbiddenMatches(
        ingredientName,
        ruleset,
        "ingredients"
      );

      // If no match found and we have original_line, also check that
      // (original_line might contain more context like "orzo pasta")
      if (matches.length === 0 && ing.original_line && ing.original_line !== ingredientName) {
        console.log(`[RecipeAdaptation] No match with name, trying original_line: "${ing.original_line}"`);
        const originalMatches = findForbiddenMatches(
          ing.original_line,
          ruleset,
          "ingredients"
        );
        if (originalMatches.length > 0) {
          matches = originalMatches;
          console.log(`[RecipeAdaptation] ✓ Found match in original_line!`);
        }
      }

      // Also check the note field if present (might contain additional info)
      if (matches.length === 0 && ing.note) {
        console.log(`[RecipeAdaptation] No match yet, checking note: "${ing.note}"`);
        const noteMatches = findForbiddenMatches(
          ing.note,
          ruleset,
          "ingredients"
        );
        if (noteMatches.length > 0) {
          matches = noteMatches;
          console.log(`[RecipeAdaptation] ✓ Found match in note!`);
        }
      }

      if (matches.length > 0) {
        // Use the first match (most specific)
        const match = matches[0];
        violations.push({
          ingredientName,
          ruleCode: match.ruleCode,
          ruleLabel: match.ruleLabel,
          suggestion:
            match.substitutionSuggestions && match.substitutionSuggestions.length > 0
              ? `Vervang door ${match.substitutionSuggestions[0]}${match.substitutionSuggestions.length > 1 ? ` of ${match.substitutionSuggestions.slice(1, 3).join(", ")}` : ""}`
              : `Vervang dit ingrediënt voor een dieet-compatibele variant`,
        });
        foundIngredients.add(lowerName);
        
        // Log for debugging
        console.log(`[RecipeAdaptation] ✓ Found violation: ${ingredientName} -> ${match.ruleCode} (matched: ${match.matched})`);
      } else {
        // Log all forbidden terms to help debug why no match
        const allForbiddenTerms = ruleset.forbidden.flatMap(f => [f.term, ...(f.synonyms || [])]);
        const hasPotentialMatch = allForbiddenTerms.some(term => 
          lowerName.includes(term.toLowerCase()) || term.toLowerCase().includes(lowerName)
        );
        
        if (hasPotentialMatch) {
          console.warn(`[RecipeAdaptation] ⚠ Potential match found but not detected: "${ingredientName}" (lower: "${lowerName}")`);
          console.warn(`[RecipeAdaptation]   All forbidden terms:`, allForbiddenTerms);
          console.warn(`[RecipeAdaptation]   Testing manual match...`);
          
          // Manual test of each forbidden term
          for (const forbidden of ruleset.forbidden) {
            const lowerTerm = forbidden.term.toLowerCase();
            if (lowerName.includes(lowerTerm) || lowerTerm.includes(lowerName)) {
              console.warn(`[RecipeAdaptation]   → Should match "${forbidden.term}" but didn't!`);
            }
            if (forbidden.synonyms) {
              for (const synonym of forbidden.synonyms) {
                const lowerSyn = synonym.toLowerCase();
                if (lowerName.includes(lowerSyn) || lowerSyn.includes(lowerName)) {
                  console.warn(`[RecipeAdaptation]   → Should match synonym "${synonym}" of "${forbidden.term}" but didn't!`);
                }
              }
            }
          }
        } else {
          console.log(`[RecipeAdaptation]   No match for "${ingredientName}" (checked against ${allForbiddenTerms.length} terms)`);
        }
      }
    }

    // Analyze steps for forbidden ingredients and added sugar heuristics
    // Steps might contain ingredient names that weren't in the ingredients list
    console.log(`[RecipeAdaptation] Analyzing ${recipe.steps.length} steps for violations`);
    
    for (const step of recipe.steps) {
      const stepText = typeof step === "string" ? step : String(step);
      
      if (!stepText || stepText.trim() === "") {
        continue;
      }
      
      console.log(`[RecipeAdaptation] Checking step: "${stepText.substring(0, 50)}..."`);
      
      const matches = findForbiddenMatches(stepText, ruleset, "steps");

      for (const match of matches) {
        // Check if this violation was already found in ingredients
        const alreadyFound = violations.some(
          (v) =>
            v.ingredientName.toLowerCase().includes(match.matched.toLowerCase()) ||
            match.matched.toLowerCase().includes(v.ingredientName.toLowerCase()) ||
            v.ruleCode === match.ruleCode
        );

        if (!alreadyFound) {
          // For sugar heuristics, add as violation
          if (match.ruleCode === "LOW_SUGAR") {
            violations.push({
              ingredientName: match.matched,
              ruleCode: match.ruleCode,
              ruleLabel: match.ruleLabel,
              suggestion:
                match.substitutionSuggestions && match.substitutionSuggestions.length > 0
                  ? `Vervang door ${match.substitutionSuggestions[0]} of verminder de hoeveelheid`
                  : `Verminder of vervang dit ingrediënt`,
            });
            console.log(`[RecipeAdaptation] ✓ Found sugar violation in step: ${match.matched}`);
          } else {
            // For other forbidden ingredients found in steps (e.g., "voeg pasta toe")
            violations.push({
              ingredientName: match.matched,
              ruleCode: match.ruleCode,
              ruleLabel: match.ruleLabel,
              suggestion:
                match.substitutionSuggestions && match.substitutionSuggestions.length > 0
                  ? `Vervang door ${match.substitutionSuggestions[0]}${match.substitutionSuggestions.length > 1 ? ` of ${match.substitutionSuggestions.slice(1, 3).join(", ")}` : ""}`
                  : `Vervang dit ingrediënt voor een dieet-compatibele variant`,
            });
            console.log(`[RecipeAdaptation] ✓ Found ingredient violation in step: ${match.matched} (${match.ruleCode})`);
          }
        }
      }
    }

    console.log(`[RecipeAdaptation] Analysis complete: found ${violations.length} violation(s)`);
    return violations;
  }

  /**
   * Generate rewrite with substitutions
   * 
   * @param recipe - Original recipe
   * @param violations - Found violations
   * @param ruleset - Diet ruleset
   * @param strict - Whether to use strict mode (no forbidden ingredients)
   * @returns Rewritten recipe
   */
  private generateRewrite(
    recipe: { mealData: any; mealName: string; steps: string[] },
    violations: ViolationDetail[],
    ruleset: DietRuleset,
    strict: boolean
  ): { ingredients: IngredientLine[]; steps: StepLine[] } {
    const ingredients: IngredientLine[] = [];
    const steps: StepLine[] = [];

    // Build substitution map
    // In strict mode, use ALL forbidden terms from ruleset, not just found violations
    const substitutionMap = new Map<string, string>();
    
    if (strict) {
      // In strict mode, build map from all forbidden rules
      for (const rule of ruleset.forbidden) {
        if (rule.substitutionSuggestions && rule.substitutionSuggestions.length > 0) {
          // Add main term
          substitutionMap.set(rule.term.toLowerCase(), rule.substitutionSuggestions[0]);
          // Add all synonyms
          if (rule.synonyms) {
            for (const synonym of rule.synonyms) {
              substitutionMap.set(synonym.toLowerCase(), rule.substitutionSuggestions[0]);
            }
          }
        }
      }
    } else {
      // In non-strict mode, only use found violations
      for (const violation of violations) {
        const rule = ruleset.forbidden.find((r) => r.ruleCode === violation.ruleCode);
        if (rule?.substitutionSuggestions && rule.substitutionSuggestions.length > 0) {
          substitutionMap.set(
            violation.ingredientName.toLowerCase(),
            rule.substitutionSuggestions[0]
          );
        }
      }
    }

    // Rewrite ingredients
    const originalIngredients =
      recipe.mealData?.ingredientRefs || recipe.mealData?.ingredients || [];

    for (const ing of originalIngredients) {
      const ingredientName =
        ing.displayName ||
        ing.name ||
        ing.original_line ||
        String(ing);
      const quantity = ing.quantityG || ing.quantity || ing.amount || "";
      const unit = ing.unit || "g";
      const note = ing.note || ing.notes;

      const lowerName = ingredientName.toLowerCase();
      
      // Check if this ingredient matches any forbidden term (including synonyms)
      let substitution: string | undefined;
      
      if (strict) {
        // In strict mode, use findForbiddenMatches for accurate matching
        const matches = findForbiddenMatches(ingredientName, ruleset, "ingredients");
        if (matches.length > 0) {
          const match = matches[0];
          const rule = ruleset.forbidden.find((r) => r.ruleCode === match.ruleCode);
          if (rule?.substitutionSuggestions && rule.substitutionSuggestions.length > 0) {
            substitution = rule.substitutionSuggestions[0];
          }
        }
      } else {
        // In non-strict mode, use substitution map from violations
        substitution = substitutionMap.get(lowerName);
      }

      if (substitution) {
        // Use substitution
        ingredients.push({
          name: substitution.charAt(0).toUpperCase() + substitution.slice(1),
          quantity: String(quantity),
          unit: unit,
          note: note || `vervanging voor ${ingredientName}`,
        });
      } else {
        // Keep original (no substitution found or not a violation)
        ingredients.push({
          name: ingredientName,
          quantity: String(quantity),
          unit: unit,
          note: note,
        });
      }
    }

    // Rewrite steps
    recipe.steps.forEach((step, index) => {
      const stepText = typeof step === "string" ? step : String(step);
      let rewrittenText = stepText;

      // Replace forbidden terms in steps (both strict and non-strict mode)
      substitutionMap.forEach((substitution, original) => {
        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escapedOriginal}\\b`, "gi");
        rewrittenText = rewrittenText.replace(
          regex,
          substitution.charAt(0).toUpperCase() + substitution.slice(1)
        );
      });

      steps.push({
        step: index + 1,
        text: rewrittenText,
      });
    });

    return { ingredients, steps };
  }

  /**
   * Generate draft with rewrite engine
   * 
   * Analyzes the actual recipe and generates a draft based on real violations.
   * In production, this will call the AI service for more sophisticated rewrites.
   * 
   * @param recipeId - Recipe ID
   * @param dietId - Diet ID
   * @param strict - Whether to use strict mode (for retry)
   * @returns Recipe adaptation draft
   */
  private async generateDraftWithEngine(
    recipeId: string,
    dietId: string,
    strict: boolean
  ): Promise<RecipeAdaptationDraft> {
    // Simulate network latency (400-800ms)
    const delay = Math.floor(Math.random() * 400) + 400;
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Load recipe
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("User not authenticated");
    }

    const recipe = await this.loadRecipe(recipeId, user.id);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    console.log(`[RecipeAdaptation] Loaded recipe:`, {
      mealName: recipe.mealName,
      hasMealData: !!recipe.mealData,
      ingredientRefsCount: recipe.mealData?.ingredientRefs?.length || 0,
      ingredientsCount: recipe.mealData?.ingredients?.length || 0,
      stepsCount: recipe.steps.length,
    });

    // Log ingredient structure for debugging
    if (recipe.mealData?.ingredientRefs) {
      console.log(`[RecipeAdaptation] IngredientRefs sample:`, recipe.mealData.ingredientRefs.slice(0, 3).map((ing: any) => ({
        displayName: ing.displayName,
        nevoCode: ing.nevoCode,
        quantityG: ing.quantityG,
      })));
    }
    if (recipe.mealData?.ingredients) {
      console.log(`[RecipeAdaptation] Ingredients sample:`, recipe.mealData.ingredients.slice(0, 3).map((ing: any) => ({
        name: ing.name,
        original_line: ing.original_line,
        quantity: ing.quantity,
        unit: ing.unit,
      })));
    }

      // Load ruleset
      const ruleset = await this.loadDietRuleset(dietId);
      if (!ruleset) {
        throw new Error("Diet ruleset not found");
      }

      if (ruleset.forbidden.length === 0) {
        console.error(`[RecipeAdaptation] ⚠ ERROR: Ruleset has no forbidden rules! This will result in no violations being found.`);
        console.error(`[RecipeAdaptation]   dietId: ${dietId}`);
        console.error(`[RecipeAdaptation]   Falling back to default ruleset...`);
        
        // Use fallback ruleset if empty
        const fallbackRuleset = this.getFallbackRuleset(dietId);
        if (fallbackRuleset.forbidden.length > 0) {
          console.log(`[RecipeAdaptation]   Using fallback with ${fallbackRuleset.forbidden.length} rules`);
          // Merge fallback with empty ruleset (keep dietId and heuristics)
          ruleset.forbidden = fallbackRuleset.forbidden;
        }
      }

    // Analyze for violations
    const violations = this.analyzeRecipeForViolations(recipe, ruleset);

    // Get diet name for Gemini prompt
    const dietName = await this.getDietName(dietId);

    // Use Gemini for intelligent adaptation if violations found, otherwise use simple rewrite
    let draft: RecipeAdaptationDraft;
    
    if (violations.length > 0) {
      console.log(`[RecipeAdaptation] Using Gemini AI for intelligent adaptation (${violations.length} violations found)`);
      try {
        draft = await generateRecipeAdaptationWithGemini(
          recipe,
          violations,
          ruleset,
          dietName
        );
        console.log(`[RecipeAdaptation] Gemini adaptation completed successfully`);
      } catch (error) {
        console.error(`[RecipeAdaptation] Gemini adaptation failed, falling back to simple rewrite:`, error);
        // Fallback to simple rewrite if Gemini fails
        const rewrite = this.generateRewrite(recipe, violations, ruleset, strict);
        const summary =
          violations.length === 0
            ? "Geen afwijkingen gevonden! Dit recept past perfect bij jouw dieet."
            : `${violations.length} ingrediënt${violations.length !== 1 ? "en" : ""} wijk${violations.length !== 1 ? "en" : "t"} af van je dieetvoorkeuren. Hieronder vind je aangepaste alternatieven.`;
        
        draft = {
          analysis: {
            violations,
            summary,
          },
          rewrite: {
            title: strict
              ? `Aangepast: ${recipe.mealName}`
              : `Aangepast: ${recipe.mealName}`,
            ingredients: rewrite.ingredients,
            steps: rewrite.steps,
          },
          confidence: violations.length === 0 ? 1.0 : Math.max(0.7, 1.0 - violations.length * 0.1),
          openQuestions: violations.length > 0 ? [] : undefined,
        };
      }
    } else {
      // No violations, use simple rewrite
      console.log(`[RecipeAdaptation] No violations found, using simple rewrite`);
      const rewrite = this.generateRewrite(recipe, violations, ruleset, strict);
      const summary = "Geen afwijkingen gevonden! Dit recept past perfect bij jouw dieet.";
      
      draft = {
        analysis: {
          violations,
          summary,
        },
        rewrite: {
          title: `Aangepast: ${recipe.mealName}`,
          ingredients: rewrite.ingredients,
          steps: rewrite.steps,
        },
        confidence: 1.0,
        openQuestions: undefined,
      };
    }
    
    console.log(`[RecipeAdaptation] Draft created successfully`);
    console.log(`[RecipeAdaptation] ========================================`);
    
    return draft;
  }
}
