-- Migration: Update finalize_recipe_import to include source domain
-- Created: 2026-01-31
-- Description: Update RPC function to extract and save domain from source_image_meta

-- Drop and recreate the function with source domain support
DROP FUNCTION IF EXISTS public.finalize_recipe_import(UUID, TEXT);

-- Recreate the function (copy from 20260130000002_rpc_finalize_recipe_import.sql with source support)
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
  v_source_image_url TEXT;
  v_source_image_path TEXT;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_ERROR: User must be authenticated';
  END IF;

  -- Lock and load job row (FOR UPDATE prevents concurrent finalizations)
  SELECT 
    id,
    user_id,
    status,
    extracted_recipe_json,
    source_locale,
    target_locale,
    source_image_meta
  INTO v_job
  FROM public.recipe_imports
  WHERE id = p_job_id
  FOR UPDATE;

  -- Debug: Log source_image_meta
  RAISE NOTICE 'Job source_image_meta: %', v_job.source_image_meta;

  -- Check job exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Recipe import job not found';
  END IF;

  -- Check ownership
  IF v_job.user_id != v_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN: Recipe import job does not belong to current user';
  END IF;

  -- Idempotency check: if already finalized with recipe_id, return existing recipe_id
  IF v_job.status = 'finalized' THEN
    SELECT recipe_id INTO v_recipe_id
    FROM public.recipe_imports
    WHERE id = p_job_id;
    
    IF v_recipe_id IS NOT NULL THEN
      RETURN v_recipe_id;
    END IF;
  END IF;

  -- Check status
  IF v_job.status != 'ready_for_review' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Job status must be ''ready_for_review'', but is ''%''', v_job.status;
  END IF;

  -- Validate extracted_recipe_json exists
  IF v_job.extracted_recipe_json IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: NO_EXTRACTED_DATA: No extracted recipe data available. Process import with Gemini first.';
  END IF;

  v_extracted_recipe := v_job.extracted_recipe_json;

  -- Extract and normalize recipe data
  v_title := TRIM(v_extracted_recipe->>'title');
  IF v_title = '' OR v_title IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Recipe title is required';
  END IF;

  -- Extract servings (nullable) - handle both string and number
  v_servings := CASE 
    WHEN v_extracted_recipe->>'servings' IS NULL THEN NULL
    WHEN jsonb_typeof(v_extracted_recipe->'servings') = 'number' AND (v_extracted_recipe->>'servings')::INTEGER > 0 
    THEN (v_extracted_recipe->>'servings')::INTEGER
    WHEN jsonb_typeof(v_extracted_recipe->'servings') = 'string' AND (v_extracted_recipe->>'servings')::TEXT ~ '^[0-9]+\.?[0-9]*$' 
    THEN (v_extracted_recipe->>'servings')::NUMERIC::INTEGER
    ELSE NULL 
  END;

  -- Extract times (nullable, 0 becomes NULL)
  v_prep_time := CASE 
    WHEN (v_extracted_recipe->'times'->>'prep_minutes')::INTEGER > 0 
    THEN (v_extracted_recipe->'times'->>'prep_minutes')::INTEGER 
    ELSE NULL 
  END;

  v_cook_time := CASE 
    WHEN (v_extracted_recipe->'times'->>'cook_minutes')::INTEGER > 0 
    THEN (v_extracted_recipe->'times'->>'cook_minutes')::INTEGER 
    ELSE NULL 
  END;

  v_total_time := CASE 
    WHEN (v_extracted_recipe->'times'->>'total_minutes')::INTEGER > 0 
    THEN (v_extracted_recipe->'times'->>'total_minutes')::INTEGER 
    ELSE NULL 
  END;

  -- Extract and normalize instructions (sort by step, filter empty)
  WITH sorted_instructions AS (
    SELECT 
      jsonb_agg(
        jsonb_build_object('step', step, 'text', text)
        ORDER BY step
      ) AS instructions
    FROM jsonb_to_recordset(v_extracted_recipe->'instructions') AS x(
      step INTEGER,
      text TEXT
    )
    WHERE TRIM(text) != ''
  )
  SELECT instructions INTO v_instructions FROM sorted_instructions;

  -- Extract ingredients (filter empty names, normalize)
  SELECT jsonb_agg(
    jsonb_build_object(
      'original_line', COALESCE(TRIM(original_line), ''),
      'quantity', CASE WHEN quantity > 0 THEN quantity ELSE NULL END,
      'unit', CASE WHEN TRIM(unit) != '' THEN TRIM(unit) ELSE NULL END,
      'name', TRIM(name),
      'note', CASE WHEN TRIM(note) != '' THEN TRIM(note) ELSE NULL END
    )
  )
  INTO v_ingredients
  FROM jsonb_to_recordset(v_extracted_recipe->'ingredients') AS x(
    original_line TEXT,
    quantity NUMERIC,
    unit TEXT,
    name TEXT,
    note TEXT
  )
  WHERE TRIM(name) != '';

  -- Validate at least one ingredient
  IF v_ingredients IS NULL OR jsonb_array_length(v_ingredients) = 0 THEN
    -- Log warning but allow (edge case)
    RAISE WARNING 'Recipe import % has no ingredients after normalization', p_job_id;
  END IF;

  -- Build meal_data JSONB (for custom_meals.meal_data)
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

  -- Extract domain and image URL from source_image_meta if available (for URL imports)
  IF v_job.source_image_meta IS NOT NULL THEN
    RAISE NOTICE 'source_image_meta is not null, checking for image URLs...';
    IF v_job.source_image_meta ? 'domain' THEN
      v_source_domain := v_job.source_image_meta->>'domain';
      RAISE NOTICE 'Found domain: %', v_source_domain;
    END IF;
    -- Prefer savedImageUrl (downloaded and saved locally) over external imageUrl
    IF v_job.source_image_meta ? 'savedImageUrl' THEN
      v_source_image_url := v_job.source_image_meta->>'savedImageUrl';
      RAISE NOTICE 'Found savedImageUrl: %', v_source_image_url;
      -- Also get savedImagePath if available
      IF v_job.source_image_meta ? 'savedImagePath' THEN
        v_source_image_path := v_job.source_image_meta->>'savedImagePath';
        RAISE NOTICE 'Found savedImagePath: %', v_source_image_path;
      END IF;
    ELSIF v_job.source_image_meta ? 'imageUrl' THEN
      v_source_image_url := v_job.source_image_meta->>'imageUrl';
      RAISE NOTICE 'Using imageUrl (fallback): %', v_source_image_url;
    ELSIF v_job.source_image_meta ? 'image_url' THEN
      v_source_image_url := v_job.source_image_meta->>'image_url';
      RAISE NOTICE 'Using image_url (fallback): %', v_source_image_url;
    ELSE
      RAISE NOTICE 'No image URL found in source_image_meta. Keys: %', array(SELECT jsonb_object_keys(v_job.source_image_meta));
    END IF;
  ELSE
    RAISE NOTICE 'source_image_meta IS NULL';
  END IF;
  
  RAISE NOTICE 'Final values: v_source_image_url = %, v_source_image_path = %', v_source_image_url, v_source_image_path;

  -- Step 1: Insert into custom_meals
  INSERT INTO public.custom_meals (
    user_id,
    name,
    meal_slot,
    diet_key,
    source_type,
    source_image_url,
    source_image_path,
    source,
    ai_analysis,
    original_language,
    translated_content,
    meal_data,
    consumption_count
  )
  VALUES (
    v_user_id,
    v_title,
    p_meal_slot,
    NULL, -- No diet type assigned yet
    'gemini', -- From recipe import
    v_source_image_url, -- Image URL from recipe (if available, prefers saved local URL)
    v_source_image_path, -- Image path if downloaded and saved locally
    v_source_domain, -- Domain name (e.g., "ah.nl") from URL import
    v_extracted_recipe, -- Store full extracted recipe
    v_job.source_locale,
    NULL, -- Already translated
    v_meal_data,
    0
  )
  RETURNING id INTO v_recipe_id;

  -- Step 2: Bulk insert recipe_ingredients (if any)
  IF v_ingredients IS NOT NULL AND jsonb_array_length(v_ingredients) > 0 THEN
    INSERT INTO public.recipe_ingredients (
      recipe_id,
      user_id,
      original_line,
      quantity,
      unit,
      name,
      note,
      nevo_food_id
    )
    SELECT
      v_recipe_id,
      v_user_id,
      TRIM(ing->>'original_line'),
      CASE WHEN (ing->>'quantity')::NUMERIC > 0 THEN (ing->>'quantity')::NUMERIC ELSE NULL END,
      CASE WHEN TRIM(ing->>'unit') != '' THEN TRIM(ing->>'unit') ELSE NULL END,
      TRIM(ing->>'name'),
      CASE WHEN TRIM(ing->>'note') != '' THEN TRIM(ing->>'note') ELSE NULL END,
      NULL -- No NEVO mapping in this step
    FROM jsonb_array_elements(v_ingredients) AS ing;
  END IF;

  -- Step 3: Update recipe_imports
  UPDATE public.recipe_imports
  SET
    status = 'finalized',
    finalized_at = NOW(),
    recipe_id = v_recipe_id,
    updated_at = NOW()
  WHERE id = p_job_id;

  RETURN v_recipe_id;
END;
$$;
