/**
 * Gemini Recipe Adaptation Service
 * 
 * Uses Gemini AI to intelligently adapt recipes based on diet restrictions.
 * Provides ingredient substitutions and cooking method adjustments.
 */

import "server-only";
import { getGeminiClient } from "@/src/lib/ai/gemini/gemini.client";
import type { RecipeAdaptationDraft, ViolationDetail } from "../recipe-ai.types";
import type { DietRuleset } from "./diet-validator";

type RecipeData = {
  mealData: any;
  mealName: string;
  steps: string[];
};

/**
 * Generate recipe adaptation using Gemini AI
 * 
 * Analyzes the recipe, identifies violations, and generates intelligent
 * substitutions and cooking method adjustments.
 */
export async function generateRecipeAdaptationWithGemini(
  recipe: RecipeData,
  violations: ViolationDetail[],
  ruleset: DietRuleset,
  dietName: string
): Promise<RecipeAdaptationDraft> {
  const gemini = getGeminiClient();

  // Build prompt for Gemini
  const prompt = buildAdaptationPrompt(recipe, violations, ruleset, dietName);

  // Define JSON schema for structured output
  const jsonSchema = {
    type: "object",
    properties: {
      adapted_ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            original: { type: "string" },
            substituted: { type: "string" },
            quantity: { type: ["string", "null"] },
            unit: { type: ["string", "null"] },
            note: { type: ["string", "null"] },
            reason: { type: "string" },
          },
          required: ["original", "substituted", "reason"],
        },
      },
      adapted_steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step_number: { type: "number" },
            original_text: { type: "string" },
            adapted_text: { type: "string" },
            changes: { type: "array", items: { type: "string" } },
          },
          required: ["step_number", "original_text", "adapted_text"],
        },
      },
      additional_suggestions: {
        type: "array",
        items: { type: "string" },
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
      },
    },
    required: ["adapted_ingredients", "adapted_steps", "confidence"],
  };

  try {
    console.log("[GeminiRecipeAdaptation] Calling Gemini for recipe adaptation...");
    const startTime = Date.now();

    const rawResponse = await gemini.generateJson({
      prompt,
      jsonSchema,
      temperature: 0.7, // Higher temperature for more creative substitutions
      purpose: "repair", // Use high-accuracy model for recipe adaptation
    });

    const duration = Date.now() - startTime;
    console.log(`[GeminiRecipeAdaptation] Gemini API call completed in ${duration}ms`);

    // Parse response
    let parsed: any;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error("[GeminiRecipeAdaptation] Failed to parse JSON:", parseError);
      throw new Error("Invalid JSON response from Gemini");
    }

    // Convert to RecipeAdaptationDraft format
    return convertGeminiResponseToDraft(parsed, recipe, violations);
  } catch (error) {
    console.error("[GeminiRecipeAdaptation] Error:", error);
    throw new Error(
      `Gemini recipe adaptation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Build prompt for Gemini recipe adaptation
 */
function buildAdaptationPrompt(
  recipe: RecipeData,
  violations: ViolationDetail[],
  ruleset: DietRuleset,
  dietName: string
): string {
  const ingredients = recipe.mealData?.ingredientRefs || recipe.mealData?.ingredients || [];
  const ingredientList = ingredients
    .map((ing: any) => {
      const name = ing.displayName || ing.name || ing.original_line || String(ing);
      const quantity = ing.quantityG || ing.quantity || ing.amount || "";
      const unit = ing.unit || "";
      return `${quantity} ${unit} ${name}`.trim();
    })
    .join("\n");

  const stepsList = recipe.steps
    .map((step, index) => `${index + 1}. ${typeof step === "string" ? step : String(step)}`)
    .join("\n");

  const violationsList = violations
    .map(
      (v) =>
        `- ${v.ingredientName}: ${v.ruleLabel} (suggestie: ${v.suggestion})`
    )
    .join("\n");

  const forbiddenTerms = ruleset.forbidden
    .map((r) => `${r.term}${r.synonyms ? ` (synoniemen: ${r.synonyms.join(", ")})` : ""}`)
    .join(", ");

  return `Je bent een expert voedingsdeskundige en chef-kok. Je taak is om een recept aan te passen zodat het voldoet aan een specifiek dieet.

RECEPT:
Naam: ${recipe.mealName}

Ingrediënten:
${ingredientList}

Bereidingswijze:
${stepsList}

DIET INFORMATIE:
Dieet: ${dietName}
Verboden ingrediënten: ${forbiddenTerms}

GEDETECTEERDE AFWIJKINGEN:
${violationsList}

OPDRACHT:
1. Vervang alle verboden ingrediënten met geschikte alternatieven die passen bij het dieet
2. Pas de bereidingswijze aan waar nodig (bijv. kooktijden, temperaturen, technieken)
3. Zorg dat de smaak en textuur zo dicht mogelijk bij het origineel blijven
4. Geef voor elke aanpassing een korte uitleg waarom deze substitutie geschikt is
5. Voeg eventueel extra suggesties toe voor het beste resultaat

BELANGRIJKE REGELS:
- Alle verboden ingrediënten MOETEN worden vervangen
- De aangepaste versie moet volledig dieet-compatibel zijn
- Behoud de structuur en volgorde van het originele recept
- Geef realistische hoeveelheden en kooktijden
- Wees specifiek in je aanpassingen (geen vage beschrijvingen)

Geef je antwoord in het Nederlands.`;
}

/**
 * Convert Gemini response to RecipeAdaptationDraft format
 */
function convertGeminiResponseToDraft(
  geminiResponse: any,
  recipe: RecipeData,
  violations: ViolationDetail[]
): RecipeAdaptationDraft {
  // Build adapted ingredients
  const adaptedIngredients = geminiResponse.adapted_ingredients || [];
  const ingredients = adaptedIngredients.map((ing: any) => ({
    name: ing.substituted || ing.original,
    quantity: ing.quantity || "",
    unit: ing.unit || "",
    note: ing.note || ing.reason || undefined,
  }));

  // Build adapted steps
  const adaptedSteps = geminiResponse.adapted_steps || [];
  const steps = adaptedSteps
    .sort((a: any, b: any) => a.step_number - b.step_number)
    .map((step: any) => ({
      text: step.adapted_text || step.original_text,
    }));

  // Build summary
  const summary =
    violations.length === 0
      ? "Geen afwijkingen gevonden! Dit recept past perfect bij jouw dieet."
      : `${violations.length} ingrediënt${violations.length !== 1 ? "en" : ""} aangepast voor jouw dieet. Hieronder vind je de aangepaste versie met alternatieven en verbeterde bereidingswijze.`;

  return {
    analysis: {
      violations,
      summary,
    },
    rewrite: {
      title: `Aangepast: ${recipe.mealName}`,
      ingredients,
      steps,
    },
    confidence: geminiResponse.confidence || 0.8,
    openQuestions: geminiResponse.additional_suggestions || [],
  };
}
