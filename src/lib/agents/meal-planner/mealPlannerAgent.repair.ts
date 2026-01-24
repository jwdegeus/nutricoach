/**
 * Repair Prompt Builder
 * 
 * Builds prompts for repairing malformed or invalid meal plan outputs
 * from the Gemini API.
 */

/**
 * Build a repair prompt for fixing meal plan generation issues
 * 
 * Creates a prompt that instructs Gemini to repair a malformed or
 * invalid JSON output while maintaining schema compliance and hard constraints.
 * 
 * @param args - Repair prompt arguments
 * @param args.originalPrompt - The original prompt that was used
 * @param args.badOutput - The malformed or invalid output (raw text or stringified JSON)
 * @param args.issues - Summary of issues found (parse errors, schema violations, constraint violations)
 * @param args.responseJsonSchema - The JSON schema that the output must conform to
 * @returns Formatted repair prompt
 */
export function buildRepairPrompt(args: {
  originalPrompt: string;
  badOutput: string;
  issues: string;
  responseJsonSchema: object;
}): string {
  const { originalPrompt, badOutput, issues, responseJsonSchema } = args;

  return `You previously generated a meal plan, but the output had issues that need to be fixed.

ORIGINAL REQUEST:
${originalPrompt}

ISSUES FOUND:
${issues}

INVALID OUTPUT (to be repaired):
${badOutput}

REQUIRED JSON SCHEMA:
${JSON.stringify(responseJsonSchema, null, 2)}

TASK: Repair the output above to create a valid meal plan that:
1. Is valid JSON conforming exactly to the provided schema
2. Does NOT add any extra fields beyond what the schema requires
3. Respects ALL hard constraints from the original request (especially allergies, forbidden ingredients, and required categories)
4. Maintains the same date range and meal slots as requested
5. Outputs ONLY the JSON object - no markdown, no explanations, no code blocks

Generate the repaired meal plan now. Output ONLY the JSON object, nothing else.`;
}
