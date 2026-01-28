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

const AI_SUGGESTION_MIN_CONFIDENCE = 0.7;

/**
 * Haalt JSON uit een response die voorafgegaan wordt door tekst (bijv. "Hier is het aangepaste recept:\n\n{...}").
 */
function extractJsonFromResponse(raw: string): string {
  const s = raw.trim();
  // Markdown code block
  const jsonBlock = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlock) {
    return jsonBlock[1].trim();
  }
  // Eerste { tot bijbehorende }
  const start = s.indexOf("{");
  if (start === -1) return s;
  let depth = 0;
  let inString = false;
  let escape = false;
  let quote: string | null = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === quote) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

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
      temperature: 0.4,
      purpose: "repair",
    });

    const duration = Date.now() - startTime;
    console.log(`[GeminiRecipeAdaptation] Gemini API call completed in ${duration}ms`);

    // Parse response; als Gemini tekst voor de JSON zet (bijv. "Hier is het..."), haal JSON eruit
    let parsed: any;
    try {
      const jsonStr = extractJsonFromResponse(rawResponse);
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[GeminiRecipeAdaptation] Failed to parse JSON:", parseError);
      console.error("[GeminiRecipeAdaptation] Raw response (first 300 chars):", rawResponse.slice(0, 300));
      throw new Error("Invalid JSON response from Gemini");
    }

    // Convert to RecipeAdaptationDraft format
    return convertGeminiResponseToDraft(parsed, recipe, violations);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[GeminiRecipeAdaptation] Error:", msg);
    if (stack) console.error("[GeminiRecipeAdaptation] Stack:", stack);
    throw new Error(`Gemini recipe adaptation failed: ${msg}`);
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
        `- ${v.ingredientName} | Regel: ${v.ruleLabel} | Voorgestelde vervangingen uit dieetregels: ${v.suggestion}`
    )
    .join("\n");

  const mustReplaceNames = violations.map((v) => v.ingredientName).join(", ");
  const violationRuleCodes = new Set(violations.map((v) => v.ruleCode));
  const relevantForbidden = ruleset.forbidden.filter(
    (r) => violationRuleCodes.has(r.ruleCode) || violations.some((v) => v.ruleLabel?.includes(r.term))
  );
  const forbiddenTerms = (relevantForbidden.length > 0 ? relevantForbidden : ruleset.forbidden)
    .map((r) => `${r.term}${r.synonyms?.length ? ` (${r.synonyms.slice(0, 3).join(", ")})` : ""}`)
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

GEDETECTEERDE AFWIJKINGEN (deze ingrediënten zijn NIET toegestaan – ze MOETEN worden vervangen):
${violationsList}

KRITIEK – VERPLICHT VERVANGEN:
Deze ingrediënten staan in de afwijkingen en zijn verboden: ${mustReplaceNames}.
Voor elk van deze ingrediënten MOET je bij "substituted" een ANDER, dieet-compatibel ingrediënt invullen. Nooit hetzelfde woord behouden (bijv. "tomaten" → vervang door "paprika" of een ander toegestaan alternatief uit de voorgestelde vervangingen, nooit "tomaten" als substituted).

BELANGRIJK – Gebruik bij voorkeur de voorgestelde vervangingen:
Bij elke afwijking staat "Voorgestelde vervangingen uit dieetregels". Kies bij voorkeur één van die vermelde alternatieven. Alleen een eigen alternatief als geen van de voorgestelde opties past.

OPDRACHT:
1. Vervang alle verboden ingrediënten; voor elk ingrediënt uit de afwijkingen: substituted ≠ original, gebruik een voorgesteld alternatief
2. Pas de bereidingswijze aan zodat alle verwijzingen naar de oude ingrediënten naar de nieuwe verwijzen
3. Behoud smaak en textuur zo goed mogelijk met de gekozen substituten
4. Geef bij elke aanpassing een korte reason
5. Optioneel: extra suggesties

REGELS:
- Voor GEDETECTEERDE AFWIJKINGEN: substituted moet altijd een ander ingrediënt zijn dan original (nooit ongewijzigd laten)
- De aangepaste versie moet volledig dieet-compatibel zijn
- Behoud structuur en volgorde van het recept
- Realistische hoeveelheden en kooktijden

Geef je antwoord ALLEEN als een geldig JSON-object (adapted_ingredients, adapted_steps, confidence), zonder introductietekst of uitleg ervoor of erna.`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Haal het eerste voorgestelde alternatief uit een suggestion-tekst (bijv. "Vervang door paprika, courgette of biet" → "paprika"). */
function firstSuggestedAlternative(suggestion: string): string | null {
  const m = suggestion.match(/vervang\s+door\s+(.+)/i);
  const rest = (m ? m[1] : suggestion).trim();
  const first = rest.split(/\s+of\s+|\s*,\s*/).map((s) => s.trim()).filter(Boolean)[0];
  return first || null;
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
  const ingredients = adaptedIngredients.map((ing: any) => {
    let name = ing.substituted || ing.original;
    const orig = (ing.original || "").toString().toLowerCase().trim();
    const sub = (name || "").toString().toLowerCase().trim();

    const violation = violations.find((v) => {
      const vn = v.ingredientName.toLowerCase();
      return orig.includes(vn) || vn.includes(orig) || sub === vn || vn.includes(sub) || sub.includes(vn);
    });
    if (violation) {
      const vn = violation.ingredientName.toLowerCase();
      const stillViolation =
        sub === orig || sub.includes(orig) || orig.includes(sub) || sub === vn || sub.includes(vn);
      if (stillViolation) {
        const fallback = firstSuggestedAlternative(violation.suggestion);
        if (fallback) {
          name = fallback;
          console.log(`[GeminiRecipeAdaptation] Fallback: "${ing.original}" → "${fallback}" (violation: ${violation.ingredientName})`);
        }
      }
    }

    return {
      name: name || ing.original,
      quantity: ing.quantity || "",
      unit: ing.unit || "",
      note: ing.note || ing.reason || undefined,
    };
  });

  // Build map: violated ingredient name → substitute (from suggestion), for use in steps
  const replacementMap = new Map<string, string>();
  for (const v of violations) {
    const fallback = firstSuggestedAlternative(v.suggestion);
    if (fallback) {
      replacementMap.set(v.ingredientName.toLowerCase().trim(), fallback);
    }
  }

  // Build adapted steps; replace any remaining violation-ingredient names in text (lange namen eerst)
  const adaptedSteps = geminiResponse.adapted_steps || [];
  const replacementsByLength = [...replacementMap.entries()].sort((a, b) => b[0].length - a[0].length);
  const steps = adaptedSteps
    .sort((a: any, b: any) => a.step_number - b.step_number)
    .map((step: any) => {
      let text = step.adapted_text || step.original_text || "";
      const lower = text.toLowerCase();
      for (const [violatedName, substitute] of replacementsByLength) {
        if (lower.includes(violatedName)) {
          text = text.replace(new RegExp(escapeRegex(violatedName), "gi"), substitute);
        }
      }
      return { text };
    });

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

/**
 * AI-augmentatie: laat de model redeneren over dieetregels en ingrediënten.
 * Vult code-based violations aan met suggesties waar het model bv. "mozzarella = zuivel" afleidt.
 */
export async function suggestViolationsWithAI(
  recipe: RecipeData,
  ruleset: DietRuleset,
  dietName: string
): Promise<ViolationDetail[]> {
  const gemini = getGeminiClient();
  const ingredients = recipe.mealData?.ingredientRefs || recipe.mealData?.ingredients || [];
  const ingredientLines = ingredients.map((ing: any) => {
    const parts = [ing.displayName, ing.name, ing.original_line, ing.note].filter(Boolean);
    return parts.join(" ").trim();
  }).filter(Boolean);
  const ruleSummary = [...new Set(ruleset.forbidden.map((r) => r.ruleLabel))].join("; ");

  const prompt = `Je bent een dieetdeskundige. Gegeven de dieetregels en de recept-ingrediënten hieronder, welke ingrediënten wijken waarschijnlijk af?

DIET: ${dietName}
VERBODEN/BEPERKTE REGELS (uit dieetregels): ${ruleSummary}

RECEPT-INGREDIËNTEN (elk regel = één ingrediënt of combinatie):
${ingredientLines.map((l, i) => `${i + 1}. ${l}`).join("\n")}

Redeneer kort: bv. "mozzarella is zuivel", "honing is toegevoegde suiker", "sojasaus is soja".
Geef alleen suggesties met confidence >= ${AI_SUGGESTION_MIN_CONFIDENCE}.

Antwoord in JSON: { "suggestions": [ { "ingredient": "exacte naam zoals in de lijst", "ruleLabel": "naam van de regel die geschonden wordt", "confidence": 0.85 } ] }
Alleen objecten met confidence >= ${AI_SUGGESTION_MIN_CONFIDENCE} opnemen.`;

  try {
    const raw = await gemini.generateJson({
      prompt,
      jsonSchema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ingredient: { type: "string" },
                ruleLabel: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["ingredient", "ruleLabel", "confidence"],
            },
          },
        },
        required: ["suggestions"],
      },
      temperature: 0.2,
      purpose: "repair",
    });
    const parsed = JSON.parse(raw);
    const suggestions = (parsed.suggestions || [])
      .filter((s: { confidence?: number }) => (s.confidence ?? 0) >= AI_SUGGESTION_MIN_CONFIDENCE);
    const ruleByLabel = new Map(ruleset.forbidden.map((r) => [r.ruleLabel, r]));
    return suggestions.map((s: { ingredient: string; ruleLabel: string }) => {
      const rule = ruleByLabel.get(s.ruleLabel) ?? ruleset.forbidden.find((r) => r.ruleLabel.includes(s.ruleLabel) || s.ruleLabel.includes(r.ruleLabel));
      const suggestion =
        rule?.substitutionSuggestions?.length
          ? `Vervang door ${rule.substitutionSuggestions.slice(0, 3).join(" of ")}`
          : "Vervang voor een dieet-compatibele variant.";
      return {
        ingredientName: s.ingredient,
        ruleCode: rule?.ruleCode ?? "AI_SUGGESTED",
        ruleLabel: s.ruleLabel,
        suggestion,
      };
    });
  } catch (err) {
    console.warn("[GeminiRecipeAdaptation] AI suggestViolations failed:", err);
    return [];
  }
}
