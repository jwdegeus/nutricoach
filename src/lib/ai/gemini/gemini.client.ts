/**
 * Gemini Client - Server-only wrapper for Google Gemini API
 *
 * All models are configured via .env.local. No model names are hardcoded in call sites.
 *
 * Environment variables (all optional except GEMINI_API_KEY):
 *   GEMINI_API_KEY           - Required. API key from https://aistudio.google.com/app/apikey
 *   GEMINI_MODEL             - Default model for all purposes (fallback when purpose-specific is unset)
 *   GEMINI_MODEL_PLAN        - Meal plan generation (create/regenerate)
 *   GEMINI_MODEL_ENRICH      - Meal plan enrichment (nutrients, etc.)
 *   GEMINI_MODEL_HIGH_ACCURACY - Repair / high-accuracy tasks (e.g. recipe adaptation)
 *   GEMINI_MODEL_TRANSLATE   - Recipe import translation (EN → user language)
 *   GEMINI_MODEL_VISION      - Vision/OCR (recipe photo import, image analysis)
 *   GEMINI_MAX_OUTPUT_TOKENS - Max tokens per response (default 2048)
 *
 * Recipe image generation (Gemini 2.5 Flash Image) uses a separate client; see gemini-image.client.ts:
 *   GEMINI_IMAGE_API_KEY     - Optional; API key for image generation (falls back to GEMINI_API_KEY)
 *   GEMINI_MODEL_IMAGE       - Optional; default gemini-2.5-flash-image (https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-image)
 *
 * Example .env.local:
 *   GEMINI_API_KEY=your-key
 *   GEMINI_MODEL=gemini-1.5-flash
 *   GEMINI_MODEL_PLAN=gemini-1.5-flash
 *   GEMINI_MODEL_ENRICH=gemini-1.5-flash
 *   GEMINI_MODEL_TRANSLATE=gemini-1.5-flash
 *   GEMINI_MODEL_VISION=gemini-1.5-flash
 */

import 'server-only';
import { GoogleGenAI } from '@google/genai';

/**
 * Model selection policy (each maps to an env var)
 */
type ModelPurpose = 'plan' | 'enrich' | 'repair' | 'translate' | 'vision';

/**
 * Configuration for Gemini API
 */
class GeminiClient {
  private ai: GoogleGenAI;
  private model: string;
  private maxOutputTokens: number;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY environment variable is required. ' +
          'Please set it in your .env.local file.',
      );
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    this.maxOutputTokens = parseInt(
      process.env.GEMINI_MAX_OUTPUT_TOKENS ?? '2048',
      10,
    );
  }

  /**
   * Get model name for a purpose. Uses env: GEMINI_MODEL_<PURPOSE> or GEMINI_MODEL.
   */
  getModelName(purpose: ModelPurpose = 'plan'): string {
    switch (purpose) {
      case 'plan':
        return process.env.GEMINI_MODEL_PLAN ?? this.model;
      case 'enrich':
        return process.env.GEMINI_MODEL_ENRICH ?? this.model;
      case 'repair':
        return process.env.GEMINI_MODEL_HIGH_ACCURACY ?? this.model;
      case 'translate':
        return process.env.GEMINI_MODEL_TRANSLATE ?? this.model;
      case 'vision':
        return process.env.GEMINI_MODEL_VISION ?? this.model;
      default:
        return this.model;
    }
  }

  /**
   * Generate JSON content from a prompt with schema validation
   *
   * @param args - Configuration for JSON generation
   * @param args.prompt - The prompt to send to the model
   * @param args.jsonSchema - JSON schema to enforce on the response
   * @param args.temperature - Temperature for generation (0.0-1.0, default: 0.4)
   * @param args.purpose - Purpose of the call (determines model selection)
   * @returns Raw JSON string from the model
   *
   * @example
   * ```ts
   * const client = new GeminiClient();
   * const json = await client.generateJson({
   *   prompt: "Generate a meal plan for 7 days",
   *   jsonSchema: { type: "object", properties: { ... } },
   *   temperature: 0.4,
   *   purpose: "plan"
   * });
   * ```
   */
  async generateJson(args: {
    prompt: string;
    jsonSchema: object;
    temperature?: number;
    purpose?: ModelPurpose;
    /** Override max output tokens (default from env). Use higher value for large JSON (e.g. recipe adaptation). */
    maxOutputTokens?: number;
  }): Promise<string> {
    const {
      prompt,
      jsonSchema,
      temperature = 0.4,
      purpose = 'plan',
      maxOutputTokens: maxTokensOverride,
    } = args;

    // Select model based on purpose
    const modelName = this.getModelName(purpose);
    const maxTokens = maxTokensOverride ?? this.maxOutputTokens;

    const maxRetries = 3;
    const baseDelayMs = 2000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema,
            temperature,
            maxOutputTokens: maxTokens,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('Empty response from Gemini API');
        }

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        const isRateLimit =
          errorMessage.includes('429') ||
          errorMessage.includes('RESOURCE_EXHAUSTED') ||
          errorMessage.includes('quota') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('RPM');

        if (isRateLimit && attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          console.warn(
            `[GeminiClient] generateJson rate limit (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        if (!isRateLimit) {
          console.error('[GeminiClient] generateJson error:', errorMessage);
          if (lastError.stack)
            console.error('[GeminiClient] Stack:', lastError.stack);
          throw new Error(
            `Gemini API error: ${errorMessage}. ` +
              'Check your API key and model configuration.',
          );
        }

        const retryMatch =
          errorMessage.match(/retry.*?(\d+)\s*s/i) ||
          errorMessage.match(/(\d+)\s*second/i);
        const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
        const retryInfo = retrySeconds
          ? ` Please retry in ${retrySeconds} seconds.`
          : ' Please wait a moment and try again.';

        throw new Error(
          `Gemini API quota exceeded (rate limit).${retryInfo} ` +
            "This usually means you've hit the free tier limits. " +
            'Consider upgrading to a paid plan or waiting for the quota to reset. ' +
            'For more info: https://ai.google.dev/gemini-api/docs/rate-limits',
        );
      }
    }

    throw lastError || new Error('Unknown error from Gemini API');
  }

  /**
   * Generate plain text content from a prompt
   *
   * @param args - Configuration for text generation
   * @param args.prompt - The prompt to send to the model
   * @param args.temperature - Temperature for generation (0.0-1.0, default: 0.4)
   * @param args.purpose - Purpose of the call (determines model selection)
   * @returns Text response from the model
   */
  async generateText(args: {
    prompt: string;
    temperature?: number;
    purpose?: ModelPurpose;
  }): Promise<string> {
    const { prompt, temperature = 0.4, purpose = 'plan' } = args;

    // Select model based on purpose
    const modelName = this.getModelName(purpose);

    const maxRetries = 3;
    const baseDelayMs = 2000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            temperature,
            maxOutputTokens: this.maxOutputTokens,
          },
        });

        const text = response.text;
        if (!text) {
          throw new Error('Empty response from Gemini API');
        }

        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        const isRateLimit =
          errorMessage.includes('429') ||
          errorMessage.includes('RESOURCE_EXHAUSTED') ||
          errorMessage.includes('quota') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('RPM');

        if (isRateLimit && attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          console.warn(
            `[GeminiClient] generateText rate limit (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        if (!isRateLimit) {
          console.error('[GeminiClient] generateText error:', errorMessage);
          if (lastError.stack)
            console.error('[GeminiClient] Stack:', lastError.stack);
          throw new Error(
            `Gemini API error: ${errorMessage}. ` +
              'Check your API key and model configuration.',
          );
        }

        const retryMatch =
          errorMessage.match(/retry.*?(\d+)\s*s/i) ||
          errorMessage.match(/(\d+)\s*second/i);
        const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
        const retryInfo = retrySeconds
          ? ` Please retry in ${retrySeconds} seconds.`
          : ' Please wait a moment and try again.';

        throw new Error(
          `Gemini API quota exceeded (rate limit).${retryInfo} ` +
            "This usually means you've hit the free tier limits. " +
            'Consider upgrading to a paid plan or waiting for the quota to reset. ' +
            'For more info: https://ai.google.dev/gemini-api/docs/rate-limits',
        );
      }
    }

    throw lastError || new Error('Unknown error from Gemini API');
  }

  /**
   * Normalize image input to base64 + mimeType (strip data URL prefix if present)
   */
  private normalizeImageData(imageData: string): {
    base64Data: string;
    mimeType: string;
  } {
    let base64Data = imageData;
    let mimeType = 'image/jpeg';
    if (imageData.startsWith('data:')) {
      const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      } else {
        throw new Error('Invalid data URL format');
      }
    }
    return { base64Data, mimeType };
  }

  /**
   * Analyze one or more images (photo, screenshot) and extract recipe/meal information.
   * For multiple images, they are sent in order as e.g. page 1, page 2 of the same recipe.
   *
   * @param args.imageData - Single image: base64 or data URL (use with mimeType)
   * @param args.mimeType - Single image MIME type
   * @param args.images - Multiple images: array of { imageData, mimeType }. When set, imageData/mimeType are ignored.
   */
  async analyzeImage(args: {
    imageData?: string;
    mimeType?: string;
    images?: Array<{ imageData: string; mimeType: string }>;
    prompt?: string;
    jsonSchema?: object;
    temperature?: number;
    purpose?: ModelPurpose;
  }): Promise<string> {
    const {
      imageData,
      mimeType,
      images: imagesArg,
      prompt,
      jsonSchema,
      temperature = 0.4,
      purpose = 'vision',
    } = args;
    const modelName = this.getModelName(purpose);

    const parts: Array<{
      inlineData?: { data: string; mimeType: string };
      text?: string;
    }> = [];

    if (imagesArg && imagesArg.length > 0) {
      for (let i = 0; i < imagesArg.length; i++) {
        const { base64Data, mimeType: mt } = this.normalizeImageData(
          imagesArg[i].imageData,
        );
        parts.push({ inlineData: { data: base64Data, mimeType: mt } });
      }
    } else if (imageData && mimeType) {
      const { base64Data, mimeType: mt } = this.normalizeImageData(imageData);
      parts.push({ inlineData: { data: base64Data, mimeType: mt } });
    } else {
      throw new Error(
        'Either imageData+mimeType or images array must be provided',
      );
    }

    // Add prompt if provided
    const analysisPrompt =
      prompt ||
      'Analyze this image. If it contains a recipe or meal information, extract all details including: recipe name, ingredients with quantities, cooking instructions, prep time, servings, and any nutritional information. If the text is in English, provide a Dutch translation. Return the information in a structured format.';

    parts.push({ text: analysisPrompt });

    try {
      const config: {
        temperature: number;
        maxOutputTokens: number;
        responseMimeType?: string;
        responseJsonSchema?: unknown;
      } = {
        temperature,
        maxOutputTokens: this.maxOutputTokens,
      };

      // Add JSON schema if provided
      if (jsonSchema) {
        config.responseMimeType = 'application/json';
        config.responseJsonSchema = jsonSchema;
      }

      // Retry logic for rate limits with exponential backoff
      let lastError: Error | null = null;
      const maxRetries = 3;
      const baseDelayMs = 2000; // 2 seconds

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await this.ai.models.generateContent({
            model: modelName,
            contents: parts,
            config,
          });

          const text = response.text;
          if (!text) {
            throw new Error('Empty response from Gemini Vision API');
          }

          return text;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const errorMessage = lastError.message;

          // Check for rate limit errors (429, RESOURCE_EXHAUSTED, quota)
          const isRateLimit =
            errorMessage.includes('429') ||
            errorMessage.includes('RESOURCE_EXHAUSTED') ||
            errorMessage.includes('quota') ||
            errorMessage.includes('rate limit') ||
            errorMessage.includes('RPM');

          if (isRateLimit && attempt < maxRetries) {
            // Calculate exponential backoff delay
            const delayMs = baseDelayMs * Math.pow(2, attempt);
            console.warn(
              `[GeminiClient] Rate limit hit (attempt ${attempt + 1}/${maxRetries + 1}), ` +
                `retrying in ${delayMs}ms...`,
            );

            // Wait before retrying
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue; // Retry
          }

          // If not a rate limit error, or we've exhausted retries, throw
          if (!isRateLimit) {
            throw new Error(
              `Gemini Vision API error: ${errorMessage}. ` +
                'Check your API key and model configuration.',
            );
          }

          // Rate limit error after all retries exhausted
          const retryMatch =
            errorMessage.match(/retry.*?(\d+)\s*s/i) ||
            errorMessage.match(/(\d+)\s*second/i);
          const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;

          const retryInfo = retrySeconds
            ? ` Please retry in ${retrySeconds} seconds.`
            : ' Please wait a moment and try again.';

          throw new Error(
            `Gemini Vision API rate limit exceeded after ${maxRetries + 1} attempts.${retryInfo} ` +
              `Model: ${modelName}. ` +
              'Check GEMINI_MODEL / GEMINI_MODEL_VISION env or try gemini-1.5-flash.',
          );
        }
      }

      // Should never reach here, but TypeScript needs this
      throw lastError || new Error('Unknown error from Gemini Vision API');
    } catch (error) {
      // Re-throw if already processed
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error from Gemini Vision API');
    }
  }
}

// Export singleton instance
let clientInstance: GeminiClient | null = null;

/**
 * Get or create the Gemini client instance
 *
 * @returns Singleton GeminiClient instance
 */
export function getGeminiClient(): GeminiClient {
  if (!clientInstance) {
    clientInstance = new GeminiClient();
  }
  return clientInstance;
}
