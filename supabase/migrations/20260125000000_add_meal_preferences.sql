-- Migration: Add meal preferences to user_preferences
-- Created: 2026-01-25
-- Description: Adds breakfast_preference, lunch_preference, and dinner_preference fields to user_preferences table as TEXT arrays for multiple tags

-- Add meal preference columns to user_preferences table (as arrays for multiple tags)
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS breakfast_preference TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lunch_preference TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dinner_preference TEXT[] NOT NULL DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.user_preferences.breakfast_preference IS 'User preferences for breakfast meals as tags (e.g., ["eiwit shake", "groene smoothie"])';
COMMENT ON COLUMN public.user_preferences.lunch_preference IS 'User preferences for lunch meals as tags (e.g., ["groene smoothie", "salade"])';
COMMENT ON COLUMN public.user_preferences.dinner_preference IS 'User preferences for dinner meals as tags (e.g., ["kip met groente", "vis"])';
