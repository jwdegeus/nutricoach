/**
 * Types for ingredient overview (get_ingredient_overview_v1 / get_ingredient_overview_paginated).
 * NEVO rank 1, AI 2, custom 3, FNDDS Survey 4.
 */

export type IngredientOverviewSource =
  | 'nevo'
  | 'ai'
  | 'custom'
  | 'fndds_survey'
  | 'all';

export interface IngredientOverviewRow {
  ingredient_uid: string;
  source: Exclude<IngredientOverviewSource, 'all'>;
  source_rank: number;
  source_id: string;
  display_name: string;
  description: string | null;
  created_at: string;
  /** NEVO/custom/AI: food_group_nl; FNDDS: null. Zichtbaar in overzicht om AI-categorieën te beheren. */
  food_group_nl: string | null;
  /** From ingredient_state_overrides; default true. Disabled items can be dimmed in UI. */
  is_enabled: boolean;
}

export interface LoadIngredientOverviewInput {
  /** Search on display_name / description (ilike); max 200 chars. */
  q?: string;
  /** Filter by source; default 'all'. */
  source?: IngredientOverviewSource;
  /** Page size; default 50, max 200. */
  limit?: number;
  /** Offset for paging; default 0. */
  offset?: number;
  /** Locale (for future use); default nl-NL. */
  locale?: string;
}

export interface LoadIngredientOverviewResult {
  rows: IngredientOverviewRow[];
  totalCount?: number;
}
