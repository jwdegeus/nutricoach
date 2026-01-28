/**
 * Plan Chat Service
 *
 * Service for handling plan chat/composer interactions.
 * Uses Gemini structured output to generate PlanEdit objects.
 */

import 'server-only';
import { getGeminiClient } from '@/src/lib/ai/gemini/gemini.client';
import { MealPlansService } from '@/src/lib/meal-plans/mealPlans.service';
import { PantryService } from '@/src/lib/pantry/pantry.service';
import { AppError } from '@/src/lib/errors/app-error';
import { deriveDietRuleSet } from '@/src/lib/diets';
import { getNevoFoodByCode } from '@/src/lib/nevo/nutrition-calculator';
import { planEditSchema, planChatRequestSchema } from './planEdit.schemas';
import { buildPlanChatPrompt } from './planChat.prompts';
import { applyPlanEdit, type ApplyPlanEditResult } from './planEdit.apply';
import type { PlanEdit } from './planEdit.types';
import type { MealPlanResponse } from '@/src/lib/diets';
import { zodToJsonSchema } from 'zod-to-json-schema';
// vNext guard rails (shadow mode) + Diet Logic (Dieetregels)
import {
  loadRulesetWithDietLogic,
  evaluateGuardrails,
} from '@/src/lib/guardrails-vnext';
import { mapPlanEditToGuardrailsTargets } from '@/src/lib/guardrails-vnext/adapters/plan-chat';
import type { EvaluationContext } from '@/src/lib/guardrails-vnext/types';
import { evaluateDietLogic } from '@/src/lib/diet-logic';

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
        'VALIDATION_ERROR',
        `Invalid chat request: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      );
    }

    // Step 2: Load plan
    const mealPlansService = new MealPlansService();
    const plan = await mealPlansService.loadPlanForUser(
      userId,
      chatRequest.planId,
    );

    // Step 3: Build context
    const request = plan.requestSnapshot;
    const rules = deriveDietRuleSet(request.profile);
    const planSnapshot = plan.planSnapshot;

    // Extract available dates from plan
    const availableDates = planSnapshot.days.map((day) => day.date);

    // Extract available meal slots from plan (unique slots across all days)
    const availableMealSlots: string[] = Array.from(
      new Set(
        planSnapshot.days.flatMap((day) => day.meals.map((meal) => meal.slot)),
      ),
    );

    // Build guardrails summary
    const allergies =
      request.profile.allergies.length > 0
        ? `Allergies: ${request.profile.allergies.join(', ')}`
        : '';
    const dislikes =
      request.profile.dislikes.length > 0
        ? `Dislikes: ${request.profile.dislikes.join(', ')}`
        : '';
    const maxPrep = request.profile.prepPreferences.maxPrepMinutes
      ? `Max prep time: ${request.profile.prepPreferences.maxPrepMinutes} minutes`
      : '';
    const guardrailsParts = [allergies, dislikes, maxPrep].filter(Boolean);
    const guardrailsSummary =
      guardrailsParts.length > 0
        ? guardrailsParts.join('; ')
        : 'Hard constraints enforced; diet rules active';

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
      Array.from(planNevoCodes).slice(0, 30),
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
      }),
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
      name: 'PlanEdit',
      target: 'openApi3',
    });

    // Step 7: Call Gemini structured output
    const gemini = getGeminiClient();
    let rawJson: string;
    try {
      rawJson = await gemini.generateJson({
        prompt,
        jsonSchema,
        temperature: 0.2,
        purpose: 'plan',
      });
    } catch (error) {
      throw new AppError(
        'AGENT_ERROR',
        `Failed to generate plan edit from Gemini API: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // Step 8: Parse JSON and validate
    let edit;
    try {
      const parsed = JSON.parse(rawJson);
      edit = planEditSchema.parse(parsed);
    } catch (error) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Invalid plan edit from Gemini: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      );
    }

    // Shadow mode: vNext guard rails evaluation (feature flag)
    const useVNextGuardrails = process.env.USE_VNEXT_GUARDRAILS === 'true';
    if (useVNextGuardrails) {
      try {
        await this.evaluateVNextGuardrails(
          edit,
          planSnapshot,
          plan.dietKey,
          chatRequest.planId,
          userId,
        );
      } catch (error) {
        // Don't fail the request if vNext evaluation fails (shadow mode only)
        console.error('[PlanChat] vNext guard rails evaluation failed:', error);
      }
    }

    // Enforcement gate: vNext guard rails enforcement (feature flag)
    // TODO [GUARD-RAILS-vNext]: RISK #3 - No Post-Validation in Plan Chat
    // This gate closes the bypass by blocking applyPlanEdit when HARD violations are detected.
    // See: docs/guard-rails-rebuild-plan.md section 6.2
    const enforceVNext =
      process.env.ENFORCE_VNEXT_GUARDRAILS_PLAN_CHAT === 'true';
    if (enforceVNext) {
      try {
        // Map edit and plan snapshot to vNext targets
        const targets = mapPlanEditToGuardrailsTargets(
          edit,
          planSnapshot,
          'nl',
        );

        // Load guardrails + Diet Logic (Dieetregels); use userId for is_inflamed from profile
        const { guardrails, dietLogic } = await loadRulesetWithDietLogic({
          dietId: plan.dietKey,
          mode: 'plan_chat',
          locale: 'nl',
          userId,
        });

        // Build evaluation context
        const context: EvaluationContext = {
          dietKey: plan.dietKey,
          locale: 'nl',
          mode: 'plan_chat',
          timestamp: new Date().toISOString(),
        };

        // Evaluate guardrails (allow/block)
        const decision = evaluateGuardrails({
          ruleset: guardrails,
          context,
          targets,
        });

        // Evaluate Diet Logic (DROP/FORCE/LIMIT/PASS) when available
        let dietResult: { ok: boolean; summary: string } | null = null;
        if (dietLogic) {
          const dietTargets = {
            ingredients: targets.ingredient.map((a) => ({ name: a.text })),
          };
          dietResult = evaluateDietLogic(dietLogic, dietTargets);
        }

        const blockedByGuardrails = !decision.ok;
        const blockedByDietLogic = dietResult !== null && !dietResult.ok;

        if (blockedByGuardrails || blockedByDietLogic) {
          const reasonCodes = blockedByGuardrails
            ? decision.reasonCodes
            : [...decision.reasonCodes, 'DIET_LOGIC_VIOLATION'];
          const message =
            blockedByDietLogic && dietResult
              ? dietResult.summary
              : 'Deze wijziging voldoet niet aan de dieetregels';

          console.log(
            `[PlanChat] vNext guard rails blocked apply: planId=${chatRequest.planId}, dietKey=${plan.dietKey}, outcome=${decision.outcome}, reasonCodes=${reasonCodes.slice(0, 5).join(',')}, hash=${guardrails.contentHash}`,
          );

          throw new AppError('GUARDRAILS_VIOLATION', message, {
            outcome: 'blocked',
            reasonCodes,
            contentHash: guardrails.contentHash,
            rulesetVersion: guardrails.version,
          });
        }
      } catch (error) {
        // Fail-closed on evaluator/loader errors (policy A: safest)
        if (
          error instanceof AppError &&
          error.code === 'GUARDRAILS_VIOLATION'
        ) {
          // Re-throw guardrails violations as-is
          throw error;
        }

        // Evaluator/loader error: block apply
        console.error(
          `[PlanChat] vNext guard rails evaluation error: planId=${chatRequest.planId}, error=${error instanceof Error ? error.message : String(error)}`,
        );

        throw new AppError(
          'GUARDRAILS_VIOLATION',
          'Fout bij evalueren dieetregels',
          {
            outcome: 'blocked',
            reasonCodes: ['EVALUATOR_ERROR'],
            contentHash: '',
          },
        );
      }
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
        'DB_ERROR',
        `Failed to apply plan edit: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  /**
   * Evaluate vNext guard rails in shadow mode
   *
   * Runs guardrails + Diet Logic evaluation on PlanEdit and plan snapshot.
   * Results are logged (no diagnostics field in response).
   *
   * @param edit - Plan edit
   * @param planSnapshot - Current plan snapshot
   * @param dietKey - Diet key
   * @param planId - Plan ID (for logging)
   * @param userId - Optional; when set, diet logic uses is_inflamed from user_diet_profiles
   */
  private async evaluateVNextGuardrails(
    edit: PlanEdit,
    planSnapshot: MealPlanResponse,
    dietKey: string,
    planId: string,
    userId?: string,
  ): Promise<void> {
    try {
      const targets = mapPlanEditToGuardrailsTargets(edit, planSnapshot, 'nl');

      const { guardrails, dietLogic } = await loadRulesetWithDietLogic({
        dietId: dietKey,
        mode: 'plan_chat',
        locale: 'nl',
        userId,
      });

      const context: EvaluationContext = {
        dietKey,
        locale: 'nl',
        mode: 'plan_chat',
        timestamp: new Date().toISOString(),
      };

      const decision = evaluateGuardrails({
        ruleset: guardrails,
        context,
        targets,
      });

      let dietOk: boolean | null = null;
      let dietSummary: string | null = null;
      if (dietLogic) {
        const dietResult = evaluateDietLogic(dietLogic, {
          ingredients: targets.ingredient.map((a) => ({ name: a.text })),
        });
        dietOk = dietResult.ok;
        dietSummary = dietResult.summary;
      }

      if (decision.outcome === 'blocked' || (dietOk === false && dietSummary)) {
        console.warn('[PlanChat] vNext guard rails blocked plan edit', {
          planId,
          dietKey,
          vNextOutcome: decision.outcome,
          vNextHash: guardrails.contentHash.substring(0, 8),
          reasonCodes: decision.reasonCodes.slice(0, 3),
          matches: decision.matches.length,
          dietLogicOk: dietOk,
          dietLogicSummary: dietSummary ?? undefined,
        });
      }
    } catch (error) {
      console.error('[PlanChat] vNext guard rails evaluation error:', error);
    }
  }
}
