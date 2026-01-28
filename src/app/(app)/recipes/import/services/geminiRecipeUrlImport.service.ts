/**
 * Gemini Recipe URL Import Service
 * 
 * Service for processing recipe URLs with Gemini API.
 * Fetches HTML and uses Gemini to extract recipe information.
 */

import "server-only";
import { z } from "zod";
import { getGeminiClient } from "@/src/lib/ai/gemini/gemini.client";
import {
  geminiExtractedRecipeSchema,
  type GeminiExtractedRecipe,
} from "../recipeImport.gemini.schemas";
import type { RecipeDraft } from "../recipeDraft.types";

/**
 * Check if a URL is a tracking pixel or non-image URL
 */
function isTrackingPixelOrNonImage(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Check for tracking pixels and analytics
  const trackingPatterns = [
    'facebook.com/tr',
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    '/analytics',
    '/tracking',
    '/pixel',
    '/beacon',
    'noscript',
    'amp;', // HTML entities
  ];
  
  if (trackingPatterns.some(pattern => lowerUrl.includes(pattern))) {
    return true;
  }
  
  // Check if URL has query params but no image extension
  if (url.includes('?') && !url.match(/\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?|$)/i)) {
    // Might be a tracking pixel, but allow if it's from a known image CDN
    const imageCdnPatterns = ['imgur.com', 'cloudinary.com', 'unsplash.com', 'pexels.com'];
    if (!imageCdnPatterns.some(cdn => lowerUrl.includes(cdn))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Extract image URL from HTML
 * Looks for og:image, recipe image, or main image
 * Filters out tracking pixels and non-image URLs
 */
function extractImageUrlFromHtml(html: string): string | undefined {
  // Try og:image meta tag first
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (ogImageMatch && ogImageMatch[1]) {
    const url = ogImageMatch[1];
    // Decode HTML entities
    const decodedUrl = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (!isTrackingPixelOrNonImage(decodedUrl)) {
      return decodedUrl;
    }
  }

  // Try recipe image in JSON-LD (we'll extract this separately, but also check HTML)
  // Look for common image patterns
  const imgTagMatch = html.match(/<img[^>]*class=["'][^"]*recipe[^"]*["'][^>]*src=["']([^"']+)["']/i);
  if (imgTagMatch && imgTagMatch[1]) {
    const url = imgTagMatch[1];
    const decodedUrl = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (!isTrackingPixelOrNonImage(decodedUrl)) {
      return decodedUrl;
    }
  }

  // Try first large image in main content
  // Match all img tags and filter them
  const imgTagMatches = html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi);
  for (const match of imgTagMatches) {
    if (match[1]) {
      const url = match[1];
      const decodedUrl = url.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      
      // Filter out small icons, logos, tracking pixels, etc.
      const lowerUrl = decodedUrl.toLowerCase();
      if (
        !lowerUrl.includes('icon') &&
        !lowerUrl.includes('logo') &&
        !lowerUrl.includes('avatar') &&
        !isTrackingPixelOrNonImage(decodedUrl)
      ) {
        return decodedUrl;
      }
    }
  }

  return undefined;
}

/**
 * Clean and extract relevant HTML content
 * Removes scripts, styles, navigation, and focuses on main content
 */
function extractRelevantHtmlContent(html: string): string {
  // Remove scripts and styles (they're not needed for recipe extraction)
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Try to find main content areas (common recipe page patterns)
  const contentSelectors = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*class="[^"]*recipe[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*recipe[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  // Try to extract main content
  for (const selector of contentSelectors) {
    const match = cleaned.match(selector);
    if (match && match[1] && match[1].length > 500) {
      // Found substantial content area
      cleaned = match[1];
      break;
    }
  }

  // Remove common navigation/header/footer patterns
  cleaned = cleaned
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Limit size but prioritize keeping the end (where recipes often are)
  const maxSize = 80000; // Increased to 80KB
  if (cleaned.length > maxSize) {
    // Try to keep both start (for JSON-LD) and end (for recipe content)
    const startPortion = cleaned.substring(0, maxSize / 2);
    const endPortion = cleaned.substring(cleaned.length - maxSize / 2);
    cleaned = startPortion + "\n... [middle content removed for size] ...\n" + endPortion;
  }

  return cleaned;
}

/**
 * Build prompt for Gemini to extract recipe from HTML
 */
function buildRecipeExtractionFromHtmlPrompt(
  html: string
): string {
  // Clean and extract relevant HTML content
  const cleanedHtml = extractRelevantHtmlContent(html);
  
  return `Extract recipe information from the HTML below.

HTML:
${cleanedHtml}

REQUIRED OUTPUT FORMAT (strict JSON):
{
  "title": "Recipe name in original language",
  "language_detected": "Source language code (e.g., 'en', 'nl', 'de') or null if unclear",
  "translated_to": null,
  "servings": number or null,
  "times": {
    "prep_minutes": number or null,
    "cook_minutes": number or null,
    "total_minutes": number or null
  },
  "ingredients": [
    {
      "original_line": "Exact text as it appears in HTML (REQUIRED)",
      "quantity": number or null,
      "unit": "string or null (e.g., 'g', 'ml', 'el', 'tl')",
      "name": "Normalized ingredient name in original language (REQUIRED)",
      "note": "string or null"
    }
  ],
  "instructions": [
    {
      "step": 1,
      "text": "Instruction text in original language (REQUIRED)"
    }
  ],
  "confidence": { "overall": number 0-100 or null, "fields": {} } (optional),
  "warnings": ["string"] (optional)
}

CRITICAL RULES:
1. Language Detection: Identify the source language and set "language_detected" (e.g., 'en', 'nl', 'de') or null if unclear
2. Keep ALL text in original language - do NOT translate anything
3. Ingredients MUST be objects with "original_line" and "name" fields (NOT strings)
4. Instructions MUST be objects with "step" (number) and "text" fields (NOT strings)
5. Always include "language_detected", "translated_to", "servings", and "times" fields (use null if not available)
6. Number instruction steps starting from 1

UNIT CONVERSION (convert English units to metric):
- "cups" or "cup" → "ml" (1 cup = 240 ml, so "1 cup" becomes "240 ml", "2 cups" becomes "480 ml")
- "tablespoons" or "tablespoon" or "tbsp" → "el" (1 tablespoon = 1 el, so "3 tablespoons" becomes "3 el")
- "teaspoons" or "teaspoon" or "tsp" → "tl" (1 teaspoon = 1 tl, so "1 teaspoon" becomes "1 tl")
- "oz" or "ounces" → "g" (1 oz = 28 g, so "15 oz" becomes "420 g")
- "lb" or "pounds" → "g" (1 lb = 450 g, so "1 lb" becomes "450 g")

Return ONLY valid JSON conforming to the schema above. Do NOT include markdown code blocks.`;
}

/**
 * Extract JSON from potentially wrapped response
 */
function extractJsonFromResponse(rawResponse: string): string {
  let jsonString = rawResponse.trim();

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = jsonString.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  }

  // Try to find JSON object boundaries (recovery attempt)
  const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    jsonString = jsonObjectMatch[0];
  }

  return jsonString;
}

/**
 * Parse and validate Gemini response
 */
function parseGeminiResponse(
  rawResponse: string,
  attemptRecovery: boolean = true
): GeminiExtractedRecipe {
  // First attempt: direct parse
  let jsonString = rawResponse.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonString);
  } catch (parseError) {
    // Recovery attempt: extract JSON from wrapped response
    if (attemptRecovery) {
      jsonString = extractJsonFromResponse(rawResponse);
      try {
        parsed = JSON.parse(jsonString);
      } catch (recoveryError) {
        throw new Error(
          `Failed to parse JSON from Gemini response. ` +
            `Parse error: ${parseError instanceof Error ? parseError.message : "Unknown"}. ` +
            `Recovery attempt also failed: ${recoveryError instanceof Error ? recoveryError.message : "Unknown"}. ` +
            `Raw response preview: ${rawResponse.substring(0, 500)}`
        );
      }
    } else {
      throw new Error(
        `Invalid JSON from Gemini: ${parseError instanceof Error ? parseError.message : "Unknown parse error"}. ` +
          `Raw response preview: ${rawResponse.substring(0, 500)}`
      );
    }
  }

  // Validate against schema
  try {
    return geminiExtractedRecipeSchema.parse(parsed);
  } catch (validationError) {
    // Check if this is a case where no recipe was found (empty ingredients/instructions)
    const parsedData = parsed as any;
    const hasWarnings = parsedData?.warnings && Array.isArray(parsedData.warnings) && parsedData.warnings.length > 0;
    const hasAccessDenied = hasWarnings && parsedData.warnings.some((w: string) => 
      w.toLowerCase().includes("access denied") || 
      w.toLowerCase().includes("toegang geweigerd") ||
      w.toLowerCase().includes("geen receptinformatie")
    );
    const isEmptyRecipe = (
      (!parsedData?.ingredients || parsedData.ingredients.length === 0) &&
      (!parsedData?.instructions || parsedData.instructions.length === 0)
    );

    if (hasAccessDenied || (isEmptyRecipe && hasWarnings)) {
      const warningMessage = hasAccessDenied 
        ? "De website blokkeert toegang tot deze pagina. Probeer een andere URL of controleer of de pagina publiek toegankelijk is."
        : parsedData.warnings?.[0] || "Geen receptinformatie gevonden op deze pagina.";
      
      throw new Error(warningMessage);
    }

    const errorDetails =
      validationError instanceof z.ZodError
        ? validationError.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
        : validationError instanceof Error
        ? validationError.message
        : "Unknown validation error";

    throw new Error(
      `Schema validation failed: ${errorDetails}. ` +
        `Parsed data preview: ${JSON.stringify(parsed, null, 2).substring(0, 1000)}`
    );
  }
}

/**
 * Map Gemini extracted recipe to RecipeDraft
 * 
 * IMPORTANT: Uses the TRANSLATED values (name, text) not original_line
 * The original_line is kept for reference but the translated name should be used
 */
function mapGeminiRecipeToDraft(
  extracted: GeminiExtractedRecipe,
  sourceUrl: string
): RecipeDraft {
  // Build ingredient text from translated name, quantity, unit, and note
  const ingredients = extracted.ingredients.map((ing) => {
    // Use the TRANSLATED name, not original_line
    let text = ing.name; // This should be translated
    
    // Add quantity and unit if present (units should already be converted)
    if (ing.quantity !== null && ing.quantity !== undefined) {
      text = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''} ${text}`;
    } else if (ing.unit) {
      text = `${ing.unit} ${text}`;
    }
    
    // Add note if present (should also be translated)
    if (ing.note) {
      text = `${text} (${ing.note})`;
    }
    
    return { text };
  });
  
  return {
    title: extracted.title, // Should be translated
    description: undefined, // Gemini schema doesn't include description
    servings: extracted.servings ? String(extracted.servings) : undefined,
    ingredients,
    steps: extracted.instructions.map((inst) => ({
      text: inst.text, // Should be translated
    })),
    sourceUrl,
    sourceLanguage: extracted.language_detected || undefined,
  };
}

/**
 * Process recipe URL with Gemini API
 * 
 * @param args - Configuration for URL processing
 * @returns Extracted recipe draft
 */
export async function processRecipeUrlWithGemini(args: {
  html: string;
  url: string;
}): Promise<{
  draft: RecipeDraft;
  extracted: GeminiExtractedRecipe;
  rawResponse: string;
}> {
  const { html, url } = args;
  
  console.log(`[processRecipeUrlWithGemini] URL: "${url}", HTML size: ${html.length} bytes`);
  
  // Build prompt for extraction only (no translation)
  const prompt = buildRecipeExtractionFromHtmlPrompt(html);
  
  const gemini = getGeminiClient();

  // Convert Zod schema to JSON schema for Gemini with explicit translation requirements
  const jsonSchema = {
    type: "object",
    properties: {
      title: { 
        type: "string",
        description: "Recipe title in original language"
      },
      language_detected: { 
        type: ["string", "null"],
        description: "Source language code (e.g., 'en', 'nl', 'de')"
      },
      translated_to: { 
        type: ["string", "null"],
        description: "Not used - set to null"
      },
      servings: { type: ["number", "null"] },
      times: {
        type: "object",
        properties: {
          prep_minutes: { type: ["number", "null"] },
          cook_minutes: { type: ["number", "null"] },
          total_minutes: { type: ["number", "null"] },
        },
        required: [],
      },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            original_line: { 
              type: "string",
              description: "Original text from HTML (keep as-is)"
            },
            quantity: { 
              type: ["number", "null"],
              description: "Quantity. Convert if needed: 1 cup = 240 ml, 1 oz = 28 g, 1 lb = 450 g"
            },
            unit: { 
              type: ["string", "null"],
              description: "Unit. Convert English units to metric: cups → ml, tablespoons → el, teaspoons → tl, oz → g, lb → g"
            },
            name: { 
              type: "string",
              description: "Ingredient name in original language"
            },
            note: { 
              type: ["string", "null"],
              description: "Note in original language if present"
            },
          },
          required: ["original_line", "name"],
        },
        minItems: 1,
      },
      instructions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "number" },
            text: { 
              type: "string",
              description: "Instruction text in original language"
            },
          },
          required: ["step", "text"],
        },
        minItems: 1,
      },
      confidence: {
        type: "object",
        properties: {
          overall: { type: ["number", "null"] },
          fields: { type: "object" },
        },
        required: [],
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["title", "language_detected", "translated_to", "servings", "times", "ingredients", "instructions"],
  };

  try {
    console.log(`[GeminiRecipeUrlImport] Calling Gemini API with HTML size: ${html.length} bytes`);
    const startTime = Date.now();
    
    // Call Gemini API with JSON schema to enforce structure
    const rawResponse = await gemini.generateJson({
      prompt,
      jsonSchema,
      temperature: 0.4,
      purpose: "plan",
    });
    
    const duration = Date.now() - startTime;
    console.log(`[GeminiRecipeUrlImport] API call completed in ${duration}ms, response length: ${rawResponse.length} chars`);

    // Parse and validate response (generateJson already returns valid JSON)
    let extracted: GeminiExtractedRecipe;
    try {
      const parsed = JSON.parse(rawResponse);
      extracted = geminiExtractedRecipeSchema.parse(parsed);
    } catch (parseError) {
      console.error(`[GeminiRecipeUrlImport] Failed to parse JSON from generateJson, trying fallback parser:`, parseError);
      // Fallback to old parsing method if needed
      extracted = parseGeminiResponse(rawResponse, true);
    }
    
    console.log(`[GeminiRecipeUrlImport] Extraction completed. Language detected: ${extracted.language_detected}`);

    // Extract image URL from HTML
    const imageUrl = extractImageUrlFromHtml(html);
    console.log(`[GeminiRecipeUrlImport] Extracted image URL: ${imageUrl || 'none'}`);

    // Convert relative URLs to absolute URLs
    let absoluteImageUrl = imageUrl;
    if (imageUrl) {
      try {
        const baseUrl = new URL(url);
        if (imageUrl.startsWith('/')) {
          // Relative URL - resolve against base URL
          absoluteImageUrl = new URL(imageUrl, baseUrl.origin).toString();
        } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          // Protocol-relative URL (//example.com/image.jpg)
          absoluteImageUrl = `https:${imageUrl}`;
        } else {
          absoluteImageUrl = imageUrl;
        }
        console.log(`[GeminiRecipeUrlImport] Resolved image URL: ${absoluteImageUrl}`);
      } catch (urlError) {
        console.error(`[GeminiRecipeUrlImport] Error resolving image URL:`, urlError);
        // Keep original URL if resolution fails
        absoluteImageUrl = imageUrl;
      }
    }

    // Map to RecipeDraft
    const draft = mapGeminiRecipeToDraft(extracted, url);
    
    // Add image URL and times to draft (use absolute URL)
    draft.imageUrl = absoluteImageUrl;
    draft.prepTimeMinutes = extracted.times?.prep_minutes || undefined;
    draft.cookTimeMinutes = extracted.times?.cook_minutes || undefined;
    draft.totalTimeMinutes = extracted.times?.total_minutes || undefined;

    return {
      draft,
      extracted,
      rawResponse,
    };
  } catch (error) {
    // Re-throw with context
    if (error instanceof Error) {
      throw new Error(
        `Gemini recipe extraction from URL failed: ${error.message}`
      );
    }
    throw new Error("Unknown error during Gemini recipe extraction from URL");
  }
}
