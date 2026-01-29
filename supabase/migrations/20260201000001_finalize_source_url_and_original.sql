-- Migration: Finalize - set source_url and original snapshots
-- Description: Update finalize_recipe_import to set source_url (recipe page URL)
--              and meal_data_original / ai_analysis_original at insert time

DROP FUNCTION IF EXISTS public.finalize_recipe_import(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.finalize_recipe_import(
  p_job_id UUID,
  p_meal_slot TEXT DEFAULT 'dinner'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_job RECORD;
  v_recipe_id UUID;
  v_extracted_recipe JSONB;
  v_title TEXT;
  v_servings INTEGER;
  v_prep_time INTEGER;
  v_cook_time INTEGER;
  v_total_time INTEGER;
  v_instructions JSONB;
  v_ingredients JSONB;
  v_meal_data JSONB;
  v_source_domain TEXT;
  v_source_url TEXT;
  v_source_image_url TEXT;
  v_source_image_path TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_ERROR: User must be authenticated';
  END IF;

  SELECT id, user_id, status, extracted_recipe_json, source_locale, target_locale, source_image_meta
  INTO v_job
  FROM public.recipe_imports
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Recipe import job not found';
  END IF;
  IF v_job.user_id != v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Recipe import job does not belong to current user';
  END IF;

  IF v_job.status = 'finalized' THEN
    SELECT recipe_id INTO v_recipe_id FROM public.recipe_imports WHERE id = p_job_id;
    IF v_recipe_id IS NOT NULL THEN
      RETURN v_recipe_id;
    END IF;
  END IF;

  IF v_job.status != 'ready_for_review' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Job status must be ''ready_for_review'', but is ''%''', v_job.status;
  END IF;
  IF v_job.extracted_recipe_json IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: NO_EXTRACTED_DATA: No extracted recipe data available. Process import with Gemini first.';
  END IF;

  v_extracted_recipe := v_job.extracted_recipe_json;

  v_title := TRIM(v_extracted_recipe->>'title');
  IF v_title = '' OR v_title IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Recipe title is required';
  END IF;

  v_servings := CASE
    WHEN v_extracted_recipe->>'servings' IS NULL THEN NULL
    WHEN jsonb_typeof(v_extracted_recipe->'servings') = 'number' AND (v_extracted_recipe->>'servings')::INTEGER > 0 THEN (v_extracted_recipe->>'servings')::INTEGER
    WHEN jsonb_typeof(v_extracted_recipe->'servings') = 'string' AND (v_extracted_recipe->>'servings')::TEXT ~ '^[0-9]+\.?[0-9]*$' THEN (v_extracted_recipe->>'servings')::NUMERIC::INTEGER
    ELSE NULL
  END;

  v_prep_time := CASE WHEN (v_extracted_recipe->'times'->>'prep_minutes')::INTEGER > 0 THEN (v_extracted_recipe->'times'->>'prep_minutes')::INTEGER ELSE NULL END;
  v_cook_time := CASE WHEN (v_extracted_recipe->'times'->>'cook_minutes')::INTEGER > 0 THEN (v_extracted_recipe->'times'->>'cook_minutes')::INTEGER ELSE NULL END;
  v_total_time := CASE WHEN (v_extracted_recipe->'times'->>'total_minutes')::INTEGER > 0 THEN (v_extracted_recipe->'times'->>'total_minutes')::INTEGER ELSE NULL END;

  WITH sorted_instructions AS (
    SELECT jsonb_agg(jsonb_build_object('step', step, 'text', text) ORDER BY step) AS instructions
    FROM jsonb_to_recordset(v_extracted_recipe->'instructions') AS x(step INTEGER, text TEXT)
    WHERE TRIM(text) != ''
  )
  SELECT instructions INTO v_instructions FROM sorted_instructions;

  SELECT jsonb_agg(jsonb_build_object(
    'original_line', COALESCE(TRIM(original_line), ''),
    'quantity', CASE WHEN quantity > 0 THEN quantity ELSE NULL END,
    'unit', CASE WHEN TRIM(unit) != '' THEN TRIM(unit) ELSE NULL END,
    'name', TRIM(name),
    'note', CASE WHEN TRIM(note) != '' THEN TRIM(note) ELSE NULL END
  ))
  INTO v_ingredients
  FROM jsonb_to_recordset(v_extracted_recipe->'ingredients') AS x(original_line TEXT, quantity NUMERIC, unit TEXT, name TEXT, note TEXT)
  WHERE TRIM(name) != '';

  IF v_ingredients IS NULL OR jsonb_array_length(v_ingredients) = 0 THEN
    RAISE WARNING 'Recipe import % has no ingredients after normalization', p_job_id;
  END IF;

  v_meal_data := jsonb_build_object(
    'id', 'recipe_' || extract(epoch from now())::text || '_' || substr(md5(random()::text), 1, 9),
    'name', v_title,
    'slot', p_meal_slot,
    'date', CURRENT_DATE::text,
    'ingredientRefs', '[]'::jsonb,
    'ingredients', COALESCE(v_ingredients, '[]'::jsonb),
    'prepTime', COALESCE(v_prep_time, v_total_time),
    'servings', v_servings
  );

  IF v_job.source_image_meta IS NOT NULL THEN
    IF v_job.source_image_meta ? 'domain' THEN
      v_source_domain := v_job.source_image_meta->>'domain';
    END IF;
    IF v_job.source_image_meta ? 'url' AND v_job.source_image_meta->>'url' IS NOT NULL AND TRIM(v_job.source_image_meta->>'url') != '' THEN
      v_source_url := TRIM(v_job.source_image_meta->>'url');
    END IF;
    IF v_job.source_image_meta ? 'savedImageUrl' AND v_job.source_image_meta->>'savedImageUrl' IS NOT NULL AND v_job.source_image_meta->>'savedImageUrl' != '' THEN
      v_source_image_url := v_job.source_image_meta->>'savedImageUrl';
      IF v_job.source_image_meta ? 'savedImagePath' AND v_job.source_image_meta->>'savedImagePath' IS NOT NULL AND v_job.source_image_meta->>'savedImagePath' != '' THEN
        v_source_image_path := v_job.source_image_meta->>'savedImagePath';
      END IF;
    ELSIF v_job.source_image_meta ? 'imageUrl' AND v_job.source_image_meta->>'imageUrl' IS NOT NULL AND v_job.source_image_meta->>'imageUrl' != '' THEN
      v_source_image_url := v_job.source_image_meta->>'imageUrl';
    ELSIF v_job.source_image_meta ? 'image_url' AND v_job.source_image_meta->>'image_url' IS NOT NULL AND v_job.source_image_meta->>'image_url' != '' THEN
      v_source_image_url := v_job.source_image_meta->>'image_url';
    END IF;
  END IF;

  IF v_source_domain IS NOT NULL AND TRIM(v_source_domain) != '' THEN
    INSERT INTO public.recipe_sources (name, is_system, created_by_user_id, usage_count)
    VALUES (TRIM(v_source_domain), false, v_user_id, 1)
    ON CONFLICT (name) DO UPDATE SET usage_count = recipe_sources.usage_count + 1, updated_at = NOW();
  END IF;

  INSERT INTO public.custom_meals (
    user_id, name, meal_slot, diet_key, source_type,
    source_image_url, source_image_path, source, source_url,
    ai_analysis, original_language, translated_content,
    meal_data, meal_data_original, ai_analysis_original,
    consumption_count
  )
  VALUES (
    v_user_id, v_title, p_meal_slot, NULL, 'gemini',
    v_source_image_url, v_source_image_path, v_source_domain, v_source_url,
    v_extracted_recipe, v_job.source_locale, NULL,
    v_meal_data, v_meal_data, v_extracted_recipe,
    0
  )
  RETURNING id INTO v_recipe_id;

  IF v_ingredients IS NOT NULL AND jsonb_array_length(v_ingredients) > 0 THEN
    INSERT INTO public.recipe_ingredients (recipe_id, user_id, original_line, quantity, unit, name, note, nevo_food_id)
    SELECT v_recipe_id, v_user_id, TRIM(ing->>'original_line'),
      CASE WHEN (ing->>'quantity')::NUMERIC > 0 THEN (ing->>'quantity')::NUMERIC ELSE NULL END,
      CASE WHEN TRIM(ing->>'unit') != '' THEN TRIM(ing->>'unit') ELSE NULL END,
      TRIM(ing->>'name'),
      CASE WHEN TRIM(ing->>'note') != '' THEN TRIM(ing->>'note') ELSE NULL END,
      NULL
    FROM jsonb_array_elements(v_ingredients) AS ing;
  END IF;

  UPDATE public.recipe_imports
  SET status = 'finalized', finalized_at = NOW(), recipe_id = v_recipe_id, updated_at = NOW()
  WHERE id = p_job_id;

  RETURN v_recipe_id;
END;
$$;
