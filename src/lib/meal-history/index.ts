/**
 * Meal History Module
 *
 * Exports for meal history, ratings, and scoring services.
 */

export { MealHistoryService } from './mealHistory.service';
export type {
  MealHistoryRecord,
  StoreMealInput,
  FindMealsOptions,
} from './mealHistory.service';

export { MealScoringService } from './mealScoring.service';
