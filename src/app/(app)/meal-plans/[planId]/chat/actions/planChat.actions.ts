"use server";

import { createClient } from "@/src/lib/supabase/server";
import { PlanChatService } from "@/src/lib/agents/meal-planner/planChat.service";
import { AppError } from "@/src/lib/errors/app-error";

/**
 * Action result type
 */
type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: "AUTH_ERROR" | "VALIDATION_ERROR" | "DB_ERROR" | "AGENT_ERROR" | "RATE_LIMIT" | "CONFLICT";
        message: string;
      };
    };

/**
 * Submit a chat message and apply the resulting edit
 * 
 * @param raw - Raw input (will be validated)
 * @returns Reply message and optional applied edit result
 */
export async function submitPlanChatMessageAction(
  raw: unknown
): Promise<ActionResult<{ reply: string; applied?: { planId: string; changed: { type: string; date?: string; mealSlot?: string }; summary: string } }>> {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        ok: false,
        error: {
          code: "AUTH_ERROR",
          message: "Je moet ingelogd zijn om een chat bericht te versturen",
        },
      };
    }

    // Handle chat
    const service = new PlanChatService();
    const result = await service.handleChat({
      userId: user.id,
      raw,
    });

    return {
      ok: true,
      data: {
        reply: result.reply,
        applied: result.applied,
      },
    };
  } catch (error) {
    // Handle AppError directly
    if (error instanceof AppError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.safeMessage,
        },
      };
    }

    // Fallback for other errors
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Determine error code
    let code: "VALIDATION_ERROR" | "DB_ERROR" | "AGENT_ERROR" = "DB_ERROR";
    if (errorMessage.includes("validation") || errorMessage.includes("Invalid")) {
      code = "VALIDATION_ERROR";
    } else if (errorMessage.includes("Gemini") || errorMessage.includes("agent")) {
      code = "AGENT_ERROR";
    }

    return {
      ok: false,
      error: {
        code,
        message: errorMessage,
      },
    };
  }
}
