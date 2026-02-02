-- Migration: Add shopping day and meal plan lead time to user_preferences
-- Description: Boodschappendag (0=Sun … 6=Sat) en weekmenu vooraf (24/48/72 uur).

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS shopping_day INTEGER NOT NULL DEFAULT 5
    CHECK (shopping_day >= 0 AND shopping_day <= 6),
  ADD COLUMN IF NOT EXISTS meal_plan_lead_time_hours INTEGER NOT NULL DEFAULT 48
    CHECK (meal_plan_lead_time_hours IN (24, 48, 72));

COMMENT ON COLUMN public.user_preferences.shopping_day IS 'Boodschappendag: 0=zondag … 5=vrijdag … 6=zaterdag';
COMMENT ON COLUMN public.user_preferences.meal_plan_lead_time_hours IS 'Weekmenu vooraf: 24, 48 of 72 uur vóór boodschappendag';
