-- Migration: Improve Wahls Paleo Ingredient Categories
-- Created: 2026-01-31
-- Description: Ruimt duplicaten op en vult ingredientgroepen met meer passende ingredienten
-- Idempotent: Kan meerdere keren worden uitgevoerd zonder side effects

BEGIN;

-- Helper function for upserting ingredient category items
-- Works with partial unique indexes by checking existence first
CREATE OR REPLACE FUNCTION upsert_ingredient_category_item(
  p_category_id UUID,
  p_term TEXT,
  p_term_nl TEXT,
  p_synonyms JSONB,
  p_display_order INTEGER
) RETURNS VOID AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if item already exists (with subgroup_id IS NULL)
  SELECT EXISTS(
    SELECT 1 
    FROM public.ingredient_category_items 
    WHERE category_id = p_category_id 
      AND term = p_term 
      AND subgroup_id IS NULL
  ) INTO v_exists;
  
  IF v_exists THEN
    -- Update existing item
    UPDATE public.ingredient_category_items
    SET 
      synonyms = p_synonyms,
      term_nl = COALESCE(p_term_nl, term_nl),
      display_order = p_display_order,
      is_active = true,
      updated_at = NOW()
    WHERE category_id = p_category_id 
      AND term = p_term 
      AND subgroup_id IS NULL;
  ELSE
    -- Insert new item
    INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order, subgroup_id)
    VALUES (p_category_id, p_term, p_term_nl, p_synonyms, p_display_order, NULL);
  END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  v_diet_type_id UUID;
BEGIN
  -- ============================================================================
  -- Step 1: Lookup diet_type_id voor "Wahls Paleo"
  -- ============================================================================
  
  SELECT id INTO v_diet_type_id
  FROM public.diet_types
  WHERE name = 'Wahls Paleo'
  LIMIT 1;
  
  IF v_diet_type_id IS NULL THEN
    RAISE EXCEPTION 'Diet type "Wahls Paleo" niet gevonden in diet_types tabel';
  END IF;
  
  RAISE NOTICE 'Gevonden diet_type_id: %', v_diet_type_id;
  
  -- ============================================================================
  -- Step 2: Verwijder duplicaten en fouten
  -- ============================================================================
  
  -- Verwijder "boerenkool (collard)" duplicaat uit leafy_greens (we hebben al "kale" = boerenkool)
  DELETE FROM public.ingredient_category_items
  WHERE category_id IN (SELECT id FROM public.ingredient_categories WHERE code = 'wahls_leafy_greens')
    AND term = 'collard greens';
  
  -- Verwijder "zoete aardappel" uit potato synonyms in limited_non_gluten_grains (staat al in colored)
  UPDATE public.ingredient_category_items
  SET synonyms = '["aardappel", "potato", "potatoes", "aardappelen"]'::jsonb
  WHERE category_id IN (SELECT id FROM public.ingredient_categories WHERE code = 'wahls_limited_non_gluten_grains')
    AND term = 'potato';
  
  -- Verwijder "pompoen (squash)" duplicaat - merge met pumpkin
  UPDATE public.ingredient_category_items
  SET synonyms = '["pompoen", "pumpkin", "butternut squash", "butternut pompoen", "squash", "zucchini", "courgette", "yellow squash", "gele pompoen"]'::jsonb
  WHERE category_id IN (SELECT id FROM public.ingredient_categories WHERE code = 'wahls_colored')
    AND term = 'pumpkin';
  
  DELETE FROM public.ingredient_category_items
  WHERE category_id IN (SELECT id FROM public.ingredient_categories WHERE code = 'wahls_colored')
    AND term = 'squash';
  
  RAISE NOTICE 'Duplicaten verwijderd';
  
  -- ============================================================================
  -- Step 3: Voeg meer ingredienten toe aan elke categorie
  -- ============================================================================
  
  -- Forbidden: Gluten - meer granen en producten
  PERFORM upsert_ingredient_category_item(ic.id, 'kamut', 'kamut', '["kamut", "khorasan wheat"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'farro', 'farro', '["farro", "emmer"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'bulgur', 'bulgur', '["bulgur", "bulghur"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'couscous', 'couscous', '["couscous"]'::jsonb, 11)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'crackers', 'crackers', '["crackers", "biscuits", "koekjes"]'::jsonb, 12)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten';
  
  -- Forbidden: Dairy - meer zuivelproducten
  PERFORM upsert_ingredient_category_item(ic.id, 'sour cream', 'zure room', '["zure room", "sour cream", "crème fraîche"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'cottage cheese', 'hüttenkäse', '["hüttenkäse", "cottage cheese", "kwark"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'cream cheese', 'roomkaas', '["roomkaas", "cream cheese", "philadelphia"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'ice cream', 'ijs', '["ijs", "ice cream", "roomijs"]'::jsonb, 11)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy';
  
  -- Forbidden: Soy - meer sojaproducten
  PERFORM upsert_ingredient_category_item(ic.id, 'soy milk', 'sojamelk', '["sojamelk", "soy milk", "soya milk"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_soy';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'natto', 'natto', '["natto"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_soy';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'soy protein', 'soja eiwit', '["soja eiwit", "soy protein", "soy protein isolate"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_soy';
  
  -- Forbidden: Added Sugar - meer suikers
  PERFORM upsert_ingredient_category_item(ic.id, 'maple syrup', 'ahornsiroop', '["ahornsiroop", "maple syrup"]'::jsonb, 6)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_added_sugar';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'molasses', 'melasse', '["melasse", "molasses", "blackstrap molasses"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_added_sugar';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'stevia', 'stevia', '["stevia", "stevia extract"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_added_sugar';
  
  -- Forbidden: Ultra-Processed - meer bewerkte producten
  PERFORM upsert_ingredient_category_item(ic.id, 'instant noodles', 'instant noedels', '["instant noedels", "instant noodles", "ramen"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_ultra_processed';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'processed meat', 'bewerkt vlees', '["bewerkt vlees", "processed meat", "worst", "sausage", "ham", "bacon"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_ultra_processed';
  
  -- Sea Vegetables - meer zeewieren
  PERFORM upsert_ingredient_category_item(ic.id, 'hijiki', 'hijiki', '["hijiki", "hiziki"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sea_vegetables';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'arame', 'arame', '["arame"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sea_vegetables';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'sea lettuce', 'zeesla', '["zeesla", "sea lettuce", "ulva"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sea_vegetables';
  
  -- Leafy Greens - meer bladgroenten
  PERFORM upsert_ingredient_category_item(ic.id, 'watercress', 'waterkers', '["waterkers", "watercress"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'mustard greens', 'mosterdblad', '["mosterdblad", "mustard greens"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'turnip greens', 'raapstelen', '["raapstelen", "turnip greens"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'dandelion greens', 'paardenbloem', '["paardenbloem", "dandelion greens"]'::jsonb, 11)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'endive', 'andijvie', '["andijvie", "endive", "escarole"]'::jsonb, 12)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens';
  
  -- Sulfur Rich - meer zwavelrijke groenten
  PERFORM upsert_ingredient_category_item(ic.id, 'radish', 'radijs', '["radijs", "radish", "daikon", "witte radijs"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'turnip', 'knolraap', '["knolraap", "turnip", "white turnip"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'rutabaga', 'koolraap', '["koolraap", "rutabaga", "swede"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'kohlrabi', 'koolrabi', '["koolrabi", "kohlrabi"]'::jsonb, 11)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'shallot', 'sjalot', '["sjalot", "shallot", "eschalot"]'::jsonb, 12)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich';
  
  -- Colored Vegetables - meer gekleurde groenten
  PERFORM upsert_ingredient_category_item(ic.id, 'tomato', 'tomaat', '["tomaat", "tomato", "tomatoes", "tomaten", "cherry tomato", "cherrytomaat"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'eggplant', 'aubergine', '["aubergine", "eggplant"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'purple cabbage', 'rode kool', '["rode kool", "purple cabbage", "red cabbage"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'red onion', 'rode ui', '["rode ui", "red onion"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored';
  
  -- Organ Meat - meer orgaanvlees
  PERFORM upsert_ingredient_category_item(ic.id, 'brain', 'hersenen', '["hersenen", "brain", "calf brain"]'::jsonb, 6)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_organ_meat';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'sweetbreads', 'zwezerik', '["zwezerik", "sweetbreads", "thymus"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_organ_meat';
  
  -- Omega-3 Fish - meer vette vis
  PERFORM upsert_ingredient_category_item(ic.id, 'tuna', 'tonijn', '["tonijn", "tuna", "bluefin tuna", "yellowfin tuna"]'::jsonb, 6)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_omega3_fish';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'trout', 'forel', '["forel", "trout", "rainbow trout"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_omega3_fish';
  
  -- Fermented - meer gefermenteerde producten
  PERFORM upsert_ingredient_category_item(ic.id, 'fermented vegetables', 'gefermenteerde groenten', '["gefermenteerde groenten", "fermented vegetables"]'::jsonb, 6)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_fermented';
  
  -- Limited: Legumes - meer peulvruchten
  PERFORM upsert_ingredient_category_item(ic.id, 'black beans', 'zwarte bonen', '["zwarte bonen", "black beans"]'::jsonb, 6)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'kidney beans', 'nierbonen', '["nierbonen", "kidney beans", "red kidney beans"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'white beans', 'witte bonen', '["witte bonen", "white beans", "cannellini beans"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'lima beans', 'limabonen', '["limabonen", "lima beans", "butter beans"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'black-eyed peas', 'oogbonen', '["oogbonen", "black-eyed peas", "cowpeas"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes';
  
  -- Limited: Non-Gluten Grains - meer granen
  PERFORM upsert_ingredient_category_item(ic.id, 'millet', 'gierst', '["gierst", "millet"]'::jsonb, 7)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'amaranth', 'amarant', '["amarant", "amaranth"]'::jsonb, 8)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'teff', 'teff', '["teff"]'::jsonb, 9)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains';
  
  PERFORM upsert_ingredient_category_item(ic.id, 'sorghum', 'sorghum', '["sorghum"]'::jsonb, 10)
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains';
  
  RAISE NOTICE 'Meer ingredienten toegevoegd aan categorieën';
  
END $$;

COMMIT;
