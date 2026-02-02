/**
 * Gemini Image Client – recipe image generation with Gemini 2.5 Flash Image.
 *
 * Uses a separate API key and model for cost control (see pricing:
 * https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-image).
 *
 * Environment variables:
 *   GEMINI_IMAGE_API_KEY  - API key for image generation (optional; falls back to GEMINI_API_KEY)
 *   GEMINI_MODEL_IMAGE   - Model name (default: gemini-2.5-flash-image)
 */

import 'server-only';
import { GoogleGenAI } from '@google/genai';

const IMAGE_MODEL_ENV = 'GEMINI_MODEL_IMAGE';
const IMAGE_API_KEY_ENV = 'GEMINI_IMAGE_API_KEY';
const DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';

let imageClientInstance: GoogleGenAI | null = null;

function getImageClient(): GoogleGenAI {
  if (!imageClientInstance) {
    const apiKey =
      process.env[IMAGE_API_KEY_ENV]?.trim() ||
      process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error(
        'GEMINI_IMAGE_API_KEY or GEMINI_API_KEY must be set for recipe image generation. Add to .env.local.',
      );
    }
    imageClientInstance = new GoogleGenAI({ apiKey });
  }
  return imageClientInstance;
}

function getImageModel(): string {
  return process.env[IMAGE_MODEL_ENV]?.trim() || DEFAULT_IMAGE_MODEL;
}

/**
 * Generate a recipe image from a text prompt using Gemini 2.5 Flash Image.
 * Returns base64 PNG data (without data URL prefix) and mime type, or null if no image in response.
 */
export async function generateRecipeImage(prompt: string): Promise<{
  dataBase64: string;
  mimeType: string;
} | null> {
  const ai = getImageClient();
  const model = getImageModel();

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const candidates = response.candidates;
  if (!candidates?.length) {
    return null;
  }

  const parts = candidates[0].content?.parts;
  if (!parts?.length) {
    return null;
  }

  for (const part of parts) {
    const inlineData = (
      part as { inlineData?: { data?: string; mimeType?: string } }
    ).inlineData;
    if (inlineData?.data) {
      return {
        dataBase64: inlineData.data,
        mimeType: inlineData.mimeType || 'image/png',
      };
    }
  }

  return null;
}
