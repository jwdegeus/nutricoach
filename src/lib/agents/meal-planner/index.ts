/**
 * Meal Planner Agent - Barrel exports
 *
 * Central export point for the meal planning agent service.
 */

export { MealPlannerAgentService } from './mealPlannerAgent.service';
export { buildMealPlanPrompt } from './mealPlannerAgent.prompts';
export {
  validateHardConstraints,
  type ValidationIssue,
} from './mealPlannerAgent.validate';
export { buildRepairPrompt } from './mealPlannerAgent.repair';

// Shopping list and pantry coverage
export { MealPlannerShoppingService } from './mealPlannerShopping.service';
export type {
  PantryAvailability,
  ShoppingListItem,
  ShoppingListGroup,
  MealIngredientCoverage,
  MealCoverage,
  MealPlanCoverage,
  ShoppingListResponse,
} from './mealPlannerShopping.types';

// Meal enrichment
export { MealPlannerEnrichmentService } from './mealPlannerEnrichment.service';
export type {
  EnrichedMeal,
  CookPlanDay,
  MealPlanEnrichmentResponse,
  MealEnrichmentOptions,
} from './mealPlannerEnrichment.types';
export { mealPlanEnrichmentResponseSchema } from './mealPlannerEnrichment.schemas';
export {
  validateEnrichment,
  type EnrichmentIssue,
} from './mealPlannerEnrichment.validate';

// Plan chat/composer
export { PlanChatService } from './planChat.service';
export { applyPlanEdit, type ApplyPlanEditResult } from './planEdit.apply';
export type {
  PlanEdit,
  PlanEditAction,
  PlanEditConstraints,
  PlanEditPantryUpdate,
} from './planEdit.types';
export {
  planEditSchema,
  planChatMessageSchema,
  planChatRequestSchema,
  type PlanEditInput,
  type PlanChatMessage,
  type PlanChatRequest,
} from './planEdit.schemas';
