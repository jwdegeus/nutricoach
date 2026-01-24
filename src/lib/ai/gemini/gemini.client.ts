/**
 * Gemini Client - Server-only wrapper for Google Gemini API
 * 
 * Provides a type-safe interface for generating structured JSON output
 * using Google's Gemini API with schema validation.
 * 
 * This module is server-only and cannot be imported in client components.
 */

import "server-only";
import { GoogleGenAI } from "@google/genai";

/**
 * Model selection policy
 */
type ModelPurpose = "plan" | "enrich" | "repair" | "translate" | "vision";

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
        "GEMINI_API_KEY environment variable is required. " +
        "Please set it in your .env.local file."
      );
    }

    this.ai = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";
    this.maxOutputTokens = parseInt(
      process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "2048",
      10
    );
  }

  /**
   * Get model name based on purpose
   * 
   * @param purpose - Purpose of the API call
   * @returns Model name
   */
  getModelName(purpose: ModelPurpose = "plan"): string {
    switch (purpose) {
      case "plan":
        // Use GEMINI_MODEL_PLAN if set, otherwise fallback to GEMINI_MODEL, otherwise default
        return process.env.GEMINI_MODEL_PLAN ?? this.model;
      case "enrich":
        // Use GEMINI_MODEL_ENRICH if set, otherwise fallback to GEMINI_MODEL, otherwise default
        return process.env.GEMINI_MODEL_ENRICH ?? this.model;
      case "repair":
        // Use GEMINI_MODEL_HIGH_ACCURACY if set, otherwise fallback to GEMINI_MODEL, otherwise default
        return process.env.GEMINI_MODEL_HIGH_ACCURACY ?? this.model;
      case "translate":
        // Use default model for translation (fast and cheap)
        return this.model;
      case "vision":
        // Use vision-capable model (gemini-2.0-flash-exp supports vision)
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
  }): Promise<string> {
    const { prompt, jsonSchema, temperature = 0.4, purpose = "plan" } = args;

    // Select model based on purpose
    const modelName = this.getModelName(purpose);

    try {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          response_mime_type: "application/json",
          response_json_schema: jsonSchema,
          temperature,
          max_output_tokens: this.maxOutputTokens,
        },
      });

      // Extract text from response
      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini API");
      }

      return text;
    } catch (error) {
      // Handle quota/rate limit errors (429) with better messaging
      if (error instanceof Error) {
        const errorMessage = error.message;
        
        // Check for quota exceeded errors
        if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
          // Try to extract retry delay from error message
          const retryMatch = errorMessage.match(/retry.*?(\d+)\s*s/i) || errorMessage.match(/(\d+)\s*second/i);
          const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
          
          const retryInfo = retrySeconds 
            ? ` Please retry in ${retrySeconds} seconds.`
            : " Please wait a moment and try again.";
          
          throw new Error(
            `Gemini API quota exceeded (rate limit).${retryInfo} ` +
            "This usually means you've hit the free tier limits. " +
            "Consider upgrading to a paid plan or waiting for the quota to reset. " +
            "For more info: https://ai.google.dev/gemini-api/docs/rate-limits"
          );
        }
        
        // Re-throw with more context (but don't expose API key or full prompt)
        throw new Error(
          `Gemini API error: ${errorMessage}. ` +
          "Check your API key and model configuration."
        );
      }
      throw new Error("Unknown error from Gemini API");
    }
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
    const { prompt, temperature = 0.4, purpose = "plan" } = args;

    // Select model based on purpose
    const modelName = this.getModelName(purpose);

    try {
      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          temperature,
          max_output_tokens: this.maxOutputTokens,
        },
      });

      // Extract text from response
      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini API");
      }

      return text;
    } catch (error) {
      // Handle quota/rate limit errors (429) with better messaging
      if (error instanceof Error) {
        const errorMessage = error.message;
        
        // Check for quota exceeded errors
        if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
          // Try to extract retry delay from error message
          const retryMatch = errorMessage.match(/retry.*?(\d+)\s*s/i) || errorMessage.match(/(\d+)\s*second/i);
          const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
          
          const retryInfo = retrySeconds 
            ? ` Please retry in ${retrySeconds} seconds.`
            : " Please wait a moment and try again.";
          
          throw new Error(
            `Gemini API quota exceeded (rate limit).${retryInfo} ` +
            "This usually means you've hit the free tier limits. " +
            "Consider upgrading to a paid plan or waiting for the quota to reset. " +
            "For more info: https://ai.google.dev/gemini-api/docs/rate-limits"
          );
        }
        
        // Re-throw with more context (but don't expose API key or full prompt)
        throw new Error(
          `Gemini API error: ${errorMessage}. ` +
          "Check your API key and model configuration."
        );
      }
      throw new Error("Unknown error from Gemini API");
    }
  }

  /**
   * Analyze an image (photo, screenshot) and extract recipe/meal information
   * 
   * @param args - Configuration for image analysis
   * @param args.imageData - Base64 encoded image data or image URL
   * @param args.mimeType - MIME type of the image (e.g., 'image/jpeg', 'image/png')
   * @param args.prompt - Optional additional prompt for analysis
   * @param args.jsonSchema - Optional JSON schema for structured output
   * @param args.temperature - Temperature for generation (0.0-1.0, default: 0.4)
   * @returns Analysis result (JSON string if schema provided, otherwise plain text)
   */
  async analyzeImage(args: {
    imageData: string; // Base64 string or data URL
    mimeType: string; // e.g., 'image/jpeg', 'image/png'
    prompt?: string;
    jsonSchema?: object;
    temperature?: number;
  }): Promise<string> {
    const { imageData, mimeType, prompt, jsonSchema, temperature = 0.4 } = args;
    const modelName = this.getModelName("vision");

    // Build content parts
    const parts: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }> = [];

    // Add image
    // Handle data URL format (data:image/jpeg;base64,...)
    let base64Data = imageData;
    if (imageData.startsWith("data:")) {
      const base64Match = imageData.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        base64Data = base64Match[1];
      } else {
        throw new Error("Invalid data URL format");
      }
    }

    parts.push({
      inlineData: {
        data: base64Data,
        mimeType,
      },
    });

    // Add prompt if provided
    const analysisPrompt = prompt || 
      "Analyze this image. If it contains a recipe or meal information, extract all details including: recipe name, ingredients with quantities, cooking instructions, prep time, servings, and any nutritional information. If the text is in English, provide a Dutch translation. Return the information in a structured format.";
    
    parts.push({ text: analysisPrompt });

    try {
      const config: any = {
        temperature,
        max_output_tokens: this.maxOutputTokens,
      };

      // Add JSON schema if provided
      if (jsonSchema) {
        config.response_mime_type = "application/json";
        config.response_json_schema = jsonSchema;
      }

      const response = await this.ai.models.generateContent({
        model: modelName,
        contents: parts,
        config,
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini Vision API");
      }

      return text;
    } catch (error) {
      // Handle quota/rate limit errors (429) with better messaging
      if (error instanceof Error) {
        const errorMessage = error.message;
        
        // Check for quota exceeded errors
        if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
          const retryMatch = errorMessage.match(/retry.*?(\d+)\s*s/i) || errorMessage.match(/(\d+)\s*second/i);
          const retrySeconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
          
          const retryInfo = retrySeconds 
            ? ` Please retry in ${retrySeconds} seconds.`
            : " Please wait a moment and try again.";
          
          throw new Error(
            `Gemini Vision API quota exceeded (rate limit).${retryInfo} ` +
            "This usually means you've hit the free tier limits. " +
            "Consider upgrading to a paid plan or waiting for the quota to reset."
          );
        }
        
        throw new Error(
          `Gemini Vision API error: ${errorMessage}. ` +
          "Check your API key and model configuration."
        );
      }
      throw new Error("Unknown error from Gemini Vision API");
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
