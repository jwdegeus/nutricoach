-- Add vegetable scoring columns to meal_plan_generator_settings.
-- Thresholds (g): 1..2000, low <= mid <= high.
-- Scores: 0..20, low <= mid <= high.
-- Trigger updated_at is already on the table; no change needed.

ALTER TABLE public.meal_plan_generator_settings
  ADD COLUMN IF NOT EXISTS veg_threshold_low_g INT NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS veg_threshold_mid_g INT NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS veg_threshold_high_g INT NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS veg_score_low INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS veg_score_mid INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS veg_score_high INT NOT NULL DEFAULT 4;

ALTER TABLE public.meal_plan_generator_settings
  ADD CONSTRAINT chk_veg_threshold_low_g
    CHECK (veg_threshold_low_g >= 1 AND veg_threshold_low_g <= 2000),
  ADD CONSTRAINT chk_veg_threshold_mid_g
    CHECK (veg_threshold_mid_g >= 1 AND veg_threshold_mid_g <= 2000),
  ADD CONSTRAINT chk_veg_threshold_high_g
    CHECK (veg_threshold_high_g >= 1 AND veg_threshold_high_g <= 2000),
  ADD CONSTRAINT chk_veg_thresholds_order
    CHECK (
      veg_threshold_low_g <= veg_threshold_mid_g
      AND veg_threshold_mid_g <= veg_threshold_high_g
    ),
  ADD CONSTRAINT chk_veg_score_low
    CHECK (veg_score_low >= 0 AND veg_score_low <= 20),
  ADD CONSTRAINT chk_veg_score_mid
    CHECK (veg_score_mid >= 0 AND veg_score_mid <= 20),
  ADD CONSTRAINT chk_veg_score_high
    CHECK (veg_score_high >= 0 AND veg_score_high <= 20),
  ADD CONSTRAINT chk_veg_scores_order
    CHECK (
      veg_score_low <= veg_score_mid
      AND veg_score_mid <= veg_score_high
    );
