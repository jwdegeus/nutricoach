-- Migration: Recipe classification (meal slot, time, source, tags)
-- Description: Add persistent classification fields to custom_meals (recipes);
--              add user-owned recipe_tags and recipe_tag_links (many-to-many).
--              RLS on all tables; no recipe_books in codebase so recipe_book_id skipped.
-- Security: RLS-first; no SELECT *; minimal columns.

-- ============================================================================
-- 1) custom_meals (ALTER): meal_slot + 'other', total_minutes, servings
-- ============================================================================
-- Extend meal_slot to include 'other' (breakfast/lunch/dinner/snack/other)
ALTER TABLE public.custom_meals
  DROP CONSTRAINT IF EXISTS custom_meals_meal_slot_check;

ALTER TABLE public.custom_meals
  ADD CONSTRAINT custom_meals_meal_slot_check
  CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack', 'other'));

-- Classification fields (nullable for backwards compatibility)
ALTER TABLE public.custom_meals
  ADD COLUMN IF NOT EXISTS total_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS servings INTEGER NULL;

ALTER TABLE public.custom_meals
  ADD CONSTRAINT custom_meals_total_minutes_check
  CHECK (total_minutes IS NULL OR total_minutes >= 0);

ALTER TABLE public.custom_meals
  ADD CONSTRAINT custom_meals_servings_check
  CHECK (servings IS NULL OR servings >= 0);

COMMENT ON COLUMN public.custom_meals.total_minutes IS 'Bereidingstijd in minuten (classificatie)';
COMMENT ON COLUMN public.custom_meals.servings IS 'Aantal porties (classificatie)';

-- Index for filtering by total_minutes (user_id, meal_slot already indexed in 20260128000000)
CREATE INDEX IF NOT EXISTS idx_custom_meals_user_total_minutes
  ON public.custom_meals(user_id, total_minutes)
  WHERE total_minutes IS NOT NULL;

-- ============================================================================
-- 2) recipe_tags: user-owned tag labels (unique per user)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recipe_tags (
  id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  CONSTRAINT recipe_tags_label_length_check CHECK (char_length(trim(label)) > 0),
  CONSTRAINT recipe_tags_label_lowercase_check CHECK (label = lower(label)),
  CONSTRAINT recipe_tags_user_label_unique UNIQUE (user_id, label)
);

COMMENT ON TABLE public.recipe_tags IS 'User-owned recipe tag labels (e.g. "vegetarisch", "snel"); label unique per user.';
COMMENT ON COLUMN public.recipe_tags.label IS 'Tag label (must be lowercase; enforced by constraint).';

CREATE INDEX IF NOT EXISTS idx_recipe_tags_user_id ON public.recipe_tags(user_id);

ALTER TABLE public.recipe_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own recipe tags"
  ON public.recipe_tags
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recipe tags"
  ON public.recipe_tags
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipe tags"
  ON public.recipe_tags
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipe tags"
  ON public.recipe_tags
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3) recipe_tag_links: join custom_meals <-> recipe_tags
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.recipe_tag_links (
  recipe_id UUID NOT NULL REFERENCES public.custom_meals(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.recipe_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

COMMENT ON TABLE public.recipe_tag_links IS 'Many-to-many: recipes (custom_meals) <-> recipe_tags.';

CREATE INDEX IF NOT EXISTS idx_recipe_tag_links_tag_id ON public.recipe_tag_links(tag_id);
CREATE INDEX IF NOT EXISTS idx_recipe_tag_links_recipe_id ON public.recipe_tag_links(recipe_id);

ALTER TABLE public.recipe_tag_links ENABLE ROW LEVEL SECURITY;

-- Select: user may see link only if they own both the recipe and the tag
CREATE POLICY "Users can select own recipe tag links"
  ON public.recipe_tag_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_meals r
      WHERE r.id = recipe_tag_links.recipe_id AND r.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.recipe_tags t
      WHERE t.id = recipe_tag_links.tag_id AND t.user_id = auth.uid()
    )
  );

-- Insert: user may add link only if they own both recipe and tag
CREATE POLICY "Users can insert own recipe tag links"
  ON public.recipe_tag_links
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.custom_meals r
      WHERE r.id = recipe_id AND r.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.recipe_tags t
      WHERE t.id = tag_id AND t.user_id = auth.uid()
    )
  );

-- Delete: same ownership
CREATE POLICY "Users can delete own recipe tag links"
  ON public.recipe_tag_links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.custom_meals r
      WHERE r.id = recipe_tag_links.recipe_id AND r.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.recipe_tags t
      WHERE t.id = recipe_tag_links.tag_id AND t.user_id = auth.uid()
    )
  );

-- ============================================================================
-- Validatie (test queries in comments – run handmatig om RLS + constraints te verifiëren)
-- ============================================================================
-- RLS custom_meals: bestaande policies blijven; nieuwe kolommen zijn nullable.
--
-- recipe_tags:
--   INSERT: INSERT INTO public.recipe_tags (user_id, label) VALUES (auth.uid(), 'snel');
--   SELECT: SELECT id, user_id, label FROM public.recipe_tags WHERE user_id = auth.uid();
--   (Geen SELECT *.)
--
-- recipe_tag_links:
--   INSERT: INSERT INTO public.recipe_tag_links (recipe_id, tag_id) VALUES ('<custom_meal_id>', '<tag_id>')
--     alleen als custom_meals.id eigenaar = auth.uid() en recipe_tags.id eigenaar = auth.uid();
--   SELECT: SELECT rtl.recipe_id, rtl.tag_id FROM public.recipe_tag_links rtl
--     JOIN public.custom_meals r ON r.id = rtl.recipe_id AND r.user_id = auth.uid()
--     JOIN public.recipe_tags t ON t.id = rtl.tag_id AND t.user_id = auth.uid();
--
-- Constraints:
--   custom_meals.meal_slot IN ('breakfast','lunch','dinner','snack','other');
--   custom_meals.total_minutes IS NULL OR total_minutes >= 0;
--   custom_meals.servings IS NULL OR servings >= 0;
--   recipe_tags.label trim length > 0; label = lower(label); UNIQUE (user_id, label).
