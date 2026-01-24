/**
 * Plan Chat Service
 * 
 * Service for handling plan chat/composer interactions.
 * Uses Gemini structured output to generate PlanEdit objects.
 */

import "server-only";
import { getGeminiClient } from "@/src/lib/ai/gemini/gemini.client";
import { MealPlansService } from "@/src/lib/meal-plans/mealPlans.service";
import { PantryService } from "@/src/lib/pantry/pantry.service";
import { AppError } from "@/src/lib/errors/app-error";
import { deriveDietRuleSet } from "@/src/lib/diets";
import { getNevoFoodByCode } from "@/src/lib/nevo/nutrition-calculator";
import { planEditSchema, planChatRequestSchema } from "./planEdit.schemas";
import { buildPlanChatPrompt } from "./planChat.prompts";
import { applyPlanEdit, type ApplyPlanEditResult } from "./planEdit.apply";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Plan Chat Service
 */
export class PlanChatService {
  /**
   * Handle a chat message and apply the resulting edit
   * 
   * @param args - Chat arguments
   * @returns Reply message and optional applied edit result
   */
  async handleChat(args: {
    userId: string;
    raw: unknown;
  }): Promise<{ reply: string; applied?: ApplyPlanEditResult }> {
    const { userId, raw } = args;

    // Step 1: Parse and validate request
    let chatRequest;
    try {
      chatRequest = planChatRequestSchema.parse(raw);
    } catch (error) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Invalid chat request: ${error instanceof Error ? error.message : "Unknown validation error"}`
      );
    }

    // Step 2: Load plan
    const mealPlansService = new MealPlansService();
    const plan = await mealPlansService.loadPlanForUser(
      userId,
      chatRequest.planId
    );

    // Step 3: Build context
    const request = plan.requestSnapshot;
    const rules = deriveDietRuleSet(request.profile);
    const planSnapshot = plan.planSnapshot;

    // Extract available dates from plan
    const availableDates = planSnapshot.days.map((day) => day.date);

    // Extract available meal slots from plan (unique slots across all days)
    const availableMealSlots: string[] = Array.from(
      new Set(planSnapshot.days.flatMap((day) => day.meals.map((meal) => meal.slot)))
    );

    // Build guardrails summary
    const allergies = request.profile.allergies.length > 0
      ? `Allergies: ${request.profile.allergies.join(", ")}`
      : "";
    const dislikes = request.profile.dislikes.length > 0
      ? `Dislikes: ${request.profile.dislikes.join(", ")}`
      : "";
    const maxPrep = request.profile.prepPreferences.maxPrepMinutes
      ? `Max prep time: ${request.profile.prepPreferences.maxPrepMinutes} minutes`
      : "";
    const guardrailsParts = [allergies, dislikes, maxPrep].filter(Boolean);
    const guardrailsSummary = guardrailsParts.length > 0
      ? guardrailsParts.join("; ")
      : "Hard constraints enforced; diet rules active";

    // Step 4: Load pantry context (Stap 15)
    // Collect nevoCodes from current plan
    const planNevoCodes = new Set<string>();
    for (const day of planSnapshot.days) {
      for (const meal of day.meals) {
        if (meal.ingredientRefs) {
          for (const ref of meal.ingredientRefs) {
            planNevoCodes.add(ref.nevoCode);
          }
        }
      }
    }

    // Load pantry availability for these codes (limit to top 30 to keep context small)
    const pantryService = new PantryService();
    const pantryAvailability = await pantryService.loadAvailabilityByNevoCodes(
      userId,
      Array.from(planNevoCodes).slice(0, 30)
    );

    // Build pantry context with names
    const pantryContext = await Promise.all(
      pantryAvailability.map(async (item) => {
        const codeNum = parseInt(item.nevoCode, 10);
        const food = isNaN(codeNum) ? null : await getNevoFoodByCode(codeNum);
        const name = food?.name_nl || food?.name_en || `NEVO ${item.nevoCode}`;
        return {
          nevoCode: item.nevoCode,
          name,
          availableG: item.availableG,
        };
      })
    );

    // Step 5: Build prompt
    const prompt = buildPlanChatPrompt({
      planId: plan.id,
      dietKey: plan.dietKey,
      dateFrom: plan.dateFrom,
      days: plan.days,
      availableDates,
      availableMealSlots,
      messages: chatRequest.messages,
      guardrailsSummary,
      pantryContext: pantryContext.length > 0 ? pantryContext : undefined,
    });

    // Step 6: Convert Zod schema to JSON schema
    const jsonSchema = zodToJsonSchema(planEditSchema, {
      name: "PlanEdit",
      target: "openApi3",
    });

    // Step 7: Call Gemini structured output
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt,
        jsonSchema,
        temperature: 0.2,
        purpose: "plan",
      });
    } catch (error) {
      throw new AppError(
        "AGENT_ERROR",
        `Failed to generate plan edit from Gemini API: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 8: Parse JSON and validate
    let edit;
    try {
      const parsed = JSON.parse(rawJson);
      edit = planEditSchema.parse(parsed);
    } catch (error) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Invalid plan edit from Gemini: ${error instanceof Error ? error.message : "Unknown validation error"}`
      );
    }

    // Step 9: Apply edit
    let applied: ApplyPlanEditResult | undefined;
    try {
      applied = await applyPlanEdit({
        userId,
        edit,
      });
    } catch (error) {
      // If apply fails, still return a reply but note the error
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        "DB_ERROR",
        `Failed to apply plan edit: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // Step 10: Build reply
    const reply = applied
      ? `${edit.userIntentSummary}\n\n${applied.summary}`
      : edit.userIntentSummary;

    return {
      reply,
      applied,
    };
  }
}
