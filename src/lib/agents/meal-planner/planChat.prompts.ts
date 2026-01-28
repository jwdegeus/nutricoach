/**
 * Plan Chat Prompts
 *
 * Builds prompts for the plan chat/composer interface.
 * Gemini returns a structured PlanEdit JSON object.
 */

/**
 * Build prompt for plan chat
 *
 * @param args - Chat prompt arguments
 * @returns Formatted prompt string
 */
export function buildPlanChatPrompt(args: {
  planId: string;
  dietKey: string;
  dateFrom: string;
  days: number;
  availableDates: string[];
  availableMealSlots: string[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  guardrailsSummary: string;
  pantryContext?: Array<{
    nevoCode: string;
    name: string;
    availableG?: number;
  }>; // Optional pantry context
}): string {
  const {
    planId,
    dietKey,
    dateFrom,
    days,
    availableDates,
    availableMealSlots,
    messages,
    guardrailsSummary,
    pantryContext,
  } = args;

  // Format conversation history
  const conversationHistory = messages
    .map((msg) => {
      const role = msg.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${msg.content}`;
    })
    .join('\n\n');

  // Format available dates
  const datesList =
    availableDates.length > 0
      ? availableDates.join(', ')
      : 'No dates available';

  // Format available meal slots
  const slotsList =
    availableMealSlots.length > 0
      ? availableMealSlots.join(', ')
      : 'No meal slots available';

  // Format pantry context (limit to 30 items to keep context small)
  const pantryInfo =
    pantryContext && pantryContext.length > 0
      ? `\n\nPANTRY CONTEXT (items available in user's pantry - use these when making suggestions):
${pantryContext
  .slice(0, 30)
  .map((item) => {
    const availableInfo = item.availableG
      ? ` (${item.availableG}g available)`
      : ' (available)';
    return `  - ${item.name} (nevoCode: ${item.nevoCode})${availableInfo}`;
  })
  .join(
    '\n',
  )}${pantryContext.length > 30 ? `\n  ... and ${pantryContext.length - 30} more items` : ''}

When suggesting meals, prioritize ingredients from the pantry when possible. This makes suggestions more realistic and practical.`
      : '';

  const prompt = `You are a meal plan editing assistant. Your task is to interpret user requests and output a structured PlanEdit JSON object.

CONTEXT:
- Plan ID: ${planId}
- Diet: ${dietKey}
- Date range: ${dateFrom} (${days} days)
- Available dates: ${datesList}
- Available meal slots: ${slotsList}

GUARDRAILS (hard constraints enforced):
${guardrailsSummary}
${pantryInfo}

CONVERSATION HISTORY:
${conversationHistory}

TASK:
Analyze the user's latest message and output EXACTLY ONE JSON object conforming to the PlanEdit schema.

AVAILABLE ACTIONS:
1. REPLACE_MEAL - Replace one meal in a plan
   - Requires: date, mealSlot
   - Use when user wants to change a specific meal

2. REGENERATE_DAY - Regenerate one day
   - Requires: date
   - Use when user wants to refresh an entire day or says something vague like "make it healthier"

3. ADD_SNACK - Add snack/smoothie to a day
   - Requires: date, mealSlot
   - Use when user wants to add a snack or smoothie

4. REMOVE_MEAL - Remove a meal slot/snack
   - Requires: date, mealSlot
   - Use when user wants to remove a meal

5. UPDATE_PANTRY - Mark items as available / set availableG
   - Requires: pantryUpdates (min 1 item)
   - Use ONLY when user explicitly says they have items in their pantry (e.g., "I have X in the house", "I already have Y")

ACTION SELECTION RULES (PRECISION RULES - Stap 15):
- PRECISION: If user says "vervang lunch/ontbijt/diner" or "change breakfast/lunch/dinner", choose REPLACE_MEAL with the specific mealSlot
- PRECISION: If user says "voeg snack/smoothie toe" or "add snack/smoothie", choose ADD_SNACK with the slot name
- PRECISION: Only if user explicitly says "maak hele dag anders" or "regenerate entire day" or "refresh whole day", choose REGENERATE_DAY
- If user says something vague (e.g., "make it healthier", "improve this day") WITHOUT mentioning a specific meal slot, choose REGENERATE_DAY with the first available date (or dateFrom if no specific date mentioned)
- If user mentions a specific date, use that date (must be in availableDates list)
- If user mentions a specific meal slot, use that slot (must be in availableMealSlots list)
- If user says "I have X" or "I already have Y", choose UPDATE_PANTRY and extract nevoCodes from pantry context
- If user wants to change a specific meal, choose REPLACE_MEAL
- If user wants to add a snack/smoothie, choose ADD_SNACK
- If user wants to remove a meal, choose REMOVE_MEAL

CRITICAL PRECISION:
- "Vervang lunch" → REPLACE_MEAL (date, mealSlot: "lunch")
- "Voeg smoothie toe" → ADD_SNACK (date, mealSlot: "snack" or "smoothie")
- "Maak hele dag anders" → REGENERATE_DAY (date)
- Default to slot-only actions (REPLACE_MEAL/ADD_SNACK) when user mentions a specific meal slot

OUTPUT REQUIREMENTS:
1. Output MUST be exactly ONE valid JSON object conforming to the PlanEdit schema
2. Do NOT include markdown formatting, code blocks, or explanations
3. Do NOT include any text outside the JSON object
4. action: must be one of the enum values (REPLACE_MEAL, REGENERATE_DAY, ADD_SNACK, REMOVE_MEAL, UPDATE_PANTRY)
5. planId: must be "${planId}"
6. date: must be in YYYY-MM-DD format and must be one of: ${availableDates.join(', ')} (or omit if not required for action)
7. mealSlot: must be one of: ${availableMealSlots.join(', ')} (or omit if not required for action)
8. userIntentSummary: one sentence summary of what the user wants (max 200 chars)
9. constraints: optional overrides (maxPrepMinutes, targetCalories, highProtein, vegetarian, avoidIngredients)
10. pantryUpdates: required for UPDATE_PANTRY, array of { nevoCode, availableG?, isAvailable? }
11. notes: optional array of short rationale bullets

CRITICAL:
- If user intent is unclear, default to REGENERATE_DAY with dateFrom
- Always validate that date and mealSlot are in the available lists
- For UPDATE_PANTRY, only include items the user explicitly mentioned having
- Be pragmatic: if user says "change breakfast on Monday", use REPLACE_MEAL with that date and mealSlot

Now output the PlanEdit JSON object:`;

  return prompt;
}
