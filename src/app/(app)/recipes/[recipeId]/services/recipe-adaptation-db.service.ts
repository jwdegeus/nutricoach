/**
 * Recipe Adaptation Database Service
 * 
 * Server-side service for persisting recipe adaptations and runs.
 */

import "server-only";
import { createClient } from "@/src/lib/supabase/server";
import type {
  RecipeAdaptationDraft,
  ViolationDetail,
  IngredientLine,
  StepLine,
} from "../recipe-ai.types";
import type { ValidationReport } from "./diet-validator";

/**
 * Recipe adaptation status
 */
export type RecipeAdaptationStatus = "draft" | "applied" | "archived";

/**
 * Recipe adaptation record from database
 */
export type RecipeAdaptationRecord = {
  id: string;
  userId: string;
  recipeId: string;
  dietId: string;
  dietRulesetVersion: number;
  status: RecipeAdaptationStatus;
  title: string;
  analysisSummary: string | null;
  analysisViolations: ViolationDetail[];
  rewriteIngredients: IngredientLine[];
  rewriteSteps: StepLine[];
  nutritionEstimate: any | null;
  confidence: number | null;
  openQuestions: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Recipe adaptation run record from database
 */
export type RecipeAdaptationRunRecord = {
  id: string;
  recipeAdaptationId: string;
  model: string | null;
  promptVersion: number;
  inputSnapshot: any;
  outputSnapshot: RecipeAdaptationDraft;
  validationReport: ValidationReport;
  outcome: "success" | "needs_retry" | "failed";
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  createdAt: string;
};

/**
 * Input for creating a recipe adaptation
 */
export type CreateRecipeAdaptationInput = {
  userId: string;
  recipeId: string;
  dietId: string;
  dietRulesetVersion?: number;
  status?: RecipeAdaptationStatus;
  adaptation: RecipeAdaptationDraft;
};

/**
 * Input for creating a recipe adaptation run
 */
export type CreateRecipeAdaptationRunInput = {
  recipeAdaptationId: string;
  model?: string | null;
  promptVersion?: number;
  inputSnapshot: any;
  outputSnapshot: RecipeAdaptationDraft;
  validationReport: ValidationReport;
  outcome: "success" | "needs_retry" | "failed";
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
};

/**
 * Recipe Adaptation Database Service
 */
export class RecipeAdaptationDbService {
  /**
   * Create or update a recipe adaptation
   * 
   * If an adaptation with the same (userId, recipeId, dietId) exists,
   * it will be updated. Otherwise, a new one is created.
   * 
   * @param input - Adaptation input
   * @returns Recipe adaptation record
   */
  async upsertAdaptation(
    input: CreateRecipeAdaptationInput
  ): Promise<RecipeAdaptationRecord> {
    const supabase = await createClient();

    const adaptation = input.adaptation;

    const insertData = {
      user_id: input.userId,
      recipe_id: input.recipeId,
      diet_id: input.dietId,
      diet_ruleset_version: input.dietRulesetVersion || 1,
      status: input.status || "draft",
      title: adaptation.rewrite.title,
      analysis_summary: adaptation.analysis.summary || null,
      analysis_violations: adaptation.analysis.violations as any,
      rewrite_ingredients: adaptation.rewrite.ingredients as any,
      rewrite_steps: adaptation.rewrite.steps as any,
      nutrition_estimate: null, // Not in RecipeAdaptationDraft type yet
      confidence: adaptation.confidence || null,
      open_questions: adaptation.openQuestions || [],
    };

    // Try to find existing adaptation
    const { data: existing } = await supabase
      .from("recipe_adaptations")
      .select("id")
      .eq("user_id", input.userId)
      .eq("recipe_id", input.recipeId)
      .eq("diet_id", input.dietId)
      .maybeSingle();

    let result;
    if (existing) {
      // Update existing
      const { data: updatedData, error } = await supabase
        .from("recipe_adaptations")
        .update(insertData)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update recipe adaptation: ${error.message}`);
      }

      result = updatedData;
    } else {
      // Insert new
      const { data: insertedData, error } = await supabase
        .from("recipe_adaptations")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create recipe adaptation: ${error.message}`);
      }

      result = insertedData;
    }

    return this.mapToRecord(result);
  }

  /**
   * Get recipe adaptation by ID
   * 
   * @param adaptationId - Adaptation ID
   * @param userId - User ID (for authorization)
   * @returns Recipe adaptation record or null
   */
  async getAdaptationById(
    adaptationId: string,
    userId: string
  ): Promise<RecipeAdaptationRecord | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("recipe_adaptations")
      .select("*")
      .eq("id", adaptationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get recipe adaptation: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return this.mapToRecord(data);
  }

  /**
   * Get adaptations for a recipe
   * 
   * @param recipeId - Recipe ID
   * @param userId - User ID
   * @param dietId - Optional diet ID filter
   * @returns Array of recipe adaptation records
   */
  async getAdaptationsForRecipe(
    recipeId: string,
    userId: string,
    dietId?: string
  ): Promise<RecipeAdaptationRecord[]> {
    const supabase = await createClient();

    let query = supabase
      .from("recipe_adaptations")
      .select("*")
      .eq("user_id", userId)
      .eq("recipe_id", recipeId)
      .order("created_at", { ascending: false });

    if (dietId) {
      query = query.eq("diet_id", dietId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get recipe adaptations: ${error.message}`);
    }

    return (data || []).map((row) => this.mapToRecord(row));
  }

  /**
   * Update adaptation status
   * 
   * @param adaptationId - Adaptation ID
   * @param userId - User ID (for authorization)
   * @param status - New status
   * @returns Updated recipe adaptation record
   */
  async updateStatus(
    adaptationId: string,
    userId: string,
    status: RecipeAdaptationStatus
  ): Promise<RecipeAdaptationRecord> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("recipe_adaptations")
      .update({ status })
      .eq("id", adaptationId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update adaptation status: ${error.message}`);
    }

    return this.mapToRecord(data);
  }

  /**
   * Create a recipe adaptation run
   * 
   * @param input - Run input
   * @returns Recipe adaptation run record
   */
  async createRun(
    input: CreateRecipeAdaptationRunInput
  ): Promise<RecipeAdaptationRunRecord> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("recipe_adaptation_runs")
      .insert({
        recipe_adaptation_id: input.recipeAdaptationId,
        model: input.model || null,
        prompt_version: input.promptVersion || 1,
        input_snapshot: input.inputSnapshot as any,
        output_snapshot: input.outputSnapshot as any,
        validation_report: input.validationReport as any,
        outcome: input.outcome,
        tokens_in: input.tokensIn || null,
        tokens_out: input.tokensOut || null,
        latency_ms: input.latencyMs || null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create adaptation run: ${error.message}`);
    }

    return this.mapRunToRecord(data);
  }

  /**
   * Get runs for an adaptation
   * 
   * @param adaptationId - Adaptation ID
   * @param userId - User ID (for authorization check)
   * @returns Array of run records
   */
  async getRunsForAdaptation(
    adaptationId: string,
    userId: string
  ): Promise<RecipeAdaptationRunRecord[]> {
    const supabase = await createClient();

    // First verify the adaptation belongs to the user
    const { data: adaptation } = await supabase
      .from("recipe_adaptations")
      .select("id")
      .eq("id", adaptationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!adaptation) {
      throw new Error("Adaptation not found or access denied");
    }

    const { data, error } = await supabase
      .from("recipe_adaptation_runs")
      .select("*")
      .eq("recipe_adaptation_id", adaptationId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get adaptation runs: ${error.message}`);
    }

    return (data || []).map((row) => this.mapRunToRecord(row));
  }

  /**
   * Map database row to RecipeAdaptationRecord
   */
  private mapToRecord(row: any): RecipeAdaptationRecord {
    return {
      id: row.id,
      userId: row.user_id,
      recipeId: row.recipe_id,
      dietId: row.diet_id,
      dietRulesetVersion: row.diet_ruleset_version,
      status: row.status,
      title: row.title,
      analysisSummary: row.analysis_summary,
      analysisViolations: (row.analysis_violations || []) as ViolationDetail[],
      rewriteIngredients: (row.rewrite_ingredients || []) as IngredientLine[],
      rewriteSteps: (row.rewrite_steps || []) as StepLine[],
      nutritionEstimate: row.nutrition_estimate,
      confidence: row.confidence ? Number(row.confidence) : null,
      openQuestions: (row.open_questions || []) as string[],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map database row to RecipeAdaptationRunRecord
   */
  private mapRunToRecord(row: any): RecipeAdaptationRunRecord {
    return {
      id: row.id,
      recipeAdaptationId: row.recipe_adaptation_id,
      model: row.model,
      promptVersion: row.prompt_version,
      inputSnapshot: row.input_snapshot,
      outputSnapshot: row.output_snapshot as RecipeAdaptationDraft,
      validationReport: row.validation_report as ValidationReport,
      outcome: row.outcome,
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      latencyMs: row.latency_ms,
      createdAt: row.created_at,
    };
  }
}
