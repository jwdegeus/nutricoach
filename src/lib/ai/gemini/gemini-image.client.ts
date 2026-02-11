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

/** User-friendly error codes for image generation failures */
export type ImageGenerationErrorCode =
  | 'SAFETY_BLOCKED'
  | 'NO_IMAGE_IN_RESPONSE'
  | 'API_ERROR';

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: ImageGenerationErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

/**
 * Generate a recipe image from a text prompt using Gemini 2.5 Flash Image.
 * Returns base64 PNG data (without data URL prefix) and mime type.
 * @throws {ImageGenerationError} when no image is returned, with code and user-friendly message
 */
export async function generateRecipeImage(prompt: string): Promise<{
  dataBase64: string;
  mimeType: string;
}> {
  const ai = getImageClient();
  const model = getImageModel();

  const attempt = async (): Promise<{
    dataBase64: string;
    mimeType: string;
  }> => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const candidates = response.candidates;
    const promptFeedback = response.promptFeedback;

    // No candidates: check if blocked by safety or other
    if (!candidates?.length) {
      const blockReason = promptFeedback?.blockReason;
      if (blockReason === 'SAFETY' || blockReason === 'OTHER') {
        console.warn('[gemini-image] Prompt blocked:', {
          blockReason,
          blockReasonMessage: promptFeedback?.blockReasonMessage,
        });
        throw new ImageGenerationError(
          'De prompt werd geblokkeerd. Probeer een andere receptbeschrijving.',
          'SAFETY_BLOCKED',
          { blockReason },
        );
      }
      console.error('[gemini-image] No candidates in response:', {
        blockReason: promptFeedback?.blockReason,
        promptPreview: prompt.slice(0, 100),
      });
      throw new ImageGenerationError(
        'Geen afbeelding gegenereerd; probeer het opnieuw.',
        'NO_IMAGE_IN_RESPONSE',
      );
    }

    const parts = candidates[0].content?.parts;
    const finishReason = candidates[0].finishReason;

    if (!parts?.length) {
      console.error('[gemini-image] Empty parts in candidate:', {
        finishReason,
        candidateCount: candidates.length,
      });
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        throw new ImageGenerationError(
          'Afbeelding werd geblokkeerd door veiligheidsfilters. Probeer een andere receptbeschrijving.',
          'SAFETY_BLOCKED',
          { finishReason },
        );
      }
      throw new ImageGenerationError(
        'Geen afbeelding gegenereerd; probeer het opnieuw.',
        'NO_IMAGE_IN_RESPONSE',
      );
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

    // Has parts but no image – model returned text only
    console.warn('[gemini-image] Response has parts but no inlineData:', {
      finishReason,
      partCount: parts.length,
    });
    throw new ImageGenerationError(
      'Het model gaf geen afbeelding terug. Probeer het opnieuw.',
      'NO_IMAGE_IN_RESPONSE',
    );
  };

  try {
    return await attempt();
  } catch (err) {
    // Retry once for transient NO_IMAGE_IN_RESPONSE (known Gemini 2.5 Flash quirk)
    if (
      err instanceof ImageGenerationError &&
      err.code === 'NO_IMAGE_IN_RESPONSE'
    ) {
      console.warn('[gemini-image] Retrying after empty response...');
      try {
        return await attempt();
      } catch (retryErr) {
        throw retryErr;
      }
    }
    if (err instanceof ImageGenerationError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ImageGenerationError(msg, 'API_ERROR', {
      originalError: err instanceof Error ? err.message : String(err),
    });
  }
}
