-- Migration: Improve Wahls Paleo Ingredient Categories
-- Created: 2026-01-31
-- Description: Ruimt duplicaten op en vult ingredientgroepen met meer passende ingredienten
-- Idempotent: Kan meerdere keren worden uitgevoerd zonder side effects

BEGIN;

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
  
  -- Verwijder "couscous" uit gluten (couscous is geen gluten, het is gemaakt van griesmeel maar kan glutenvrij zijn)
  -- Couscous hoort niet in forbidden_gluten, maar we laten het voor nu staan omdat het vaak wel gluten bevat
  
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
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'kamut', 'kamut', '["kamut", "khorasan wheat"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'farro', 'farro', '["farro", "emmer"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'bulgur', 'bulgur', '["bulgur", "bulghur"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Couscous wordt apart toegevoegd (staat niet in pasta synonyms)
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'couscous', 'couscous', '["couscous"]'::jsonb, 11
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  -- Note: Couscous bevat meestal wel gluten (gemaakt van durum tarwe), dus hoort in forbidden_gluten
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'crackers', 'crackers', '["crackers", "biscuits", "koekjes"]'::jsonb, 12
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Dairy - meer zuivelproducten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'sour cream', 'zure room', '["zure room", "sour cream", "crème fraîche"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'cottage cheese', 'hüttenkäse', '["hüttenkäse", "cottage cheese", "kwark"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'cream cheese', 'roomkaas', '["roomkaas", "cream cheese", "philadelphia"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'ice cream', 'ijs', '["ijs", "ice cream", "roomijs"]'::jsonb, 11
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Soy - meer sojaproducten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'soy milk', 'sojamelk', '["sojamelk", "soy milk", "soya milk"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'natto', 'natto', '["natto"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'soy protein', 'soja eiwit', '["soja eiwit", "soy protein", "soy protein isolate"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Added Sugar - meer suikers
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'maple syrup', 'ahornsiroop', '["ahornsiroop", "maple syrup"]'::jsonb, 6
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'molasses', 'melasse', '["melasse", "molasses", "blackstrap molasses"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'stevia', 'stevia', '["stevia", "stevia extract"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Ultra-Processed - meer bewerkte producten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'instant noodles', 'instant noedels', '["instant noedels", "instant noodles", "ramen"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'processed meat', 'bewerkt vlees', '["bewerkt vlees", "processed meat", "worst", "sausage", "ham", "bacon"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Sea Vegetables - meer zeewieren
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'hijiki', 'hijiki', '["hijiki", "hiziki"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'arame', 'arame', '["arame"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'sea lettuce', 'zeesla', '["zeesla", "sea lettuce", "ulva"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Leafy Greens - meer bladgroenten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'watercress', 'waterkers', '["waterkers", "watercress"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'mustard greens', 'mosterdblad', '["mosterdblad", "mustard greens"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'turnip greens', 'raapstelen', '["raapstelen", "turnip greens"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'dandelion greens', 'paardenbloem', '["paardenbloem", "dandelion greens"]'::jsonb, 11
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'endive', 'andijvie', '["andijvie", "endive", "escarole"]'::jsonb, 12
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Sulfur Rich - meer zwavelrijke groenten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'radish', 'radijs', '["radijs", "radish", "daikon", "witte radijs"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'turnip', 'knolraap', '["knolraap", "turnip", "white turnip"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'rutabaga', 'koolraap', '["koolraap", "rutabaga", "swede"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'kohlrabi', 'koolrabi', '["koolrabi", "kohlrabi"]'::jsonb, 11
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'shallot', 'sjalot', '["sjalot", "shallot", "eschalot"]'::jsonb, 12
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Colored Vegetables - meer gekleurde groenten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'tomato', 'tomaat', '["tomaat", "tomato", "tomatoes", "tomaten", "cherry tomato", "cherrytomaat"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'eggplant', 'aubergine', '["aubergine", "eggplant"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'purple cabbage', 'rode kool', '["rode kool", "purple cabbage", "red cabbage"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'red onion', 'rode ui', '["rode ui", "red onion"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Organ Meat - meer orgaanvlees
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'brain', 'hersenen', '["hersenen", "brain", "calf brain"]'::jsonb, 6
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_organ_meat'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'sweetbreads', 'zwezerik', '["zwezerik", "sweetbreads", "thymus"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_organ_meat'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Omega-3 Fish - meer vette vis
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'tuna', 'tonijn', '["tonijn", "tuna", "bluefin tuna", "yellowfin tuna"]'::jsonb, 6
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'trout', 'forel', '["forel", "trout", "rainbow trout"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'mackerel', 'makreel', '["makreel", "mackerel"]'::jsonb, 3
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Fermented - meer gefermenteerde producten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'kefir', 'kefir', '["kefir", "coconut kefir", "kokosnoot kefir"]'::jsonb, 3
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_fermented'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'fermented vegetables', 'gefermenteerde groenten', '["gefermenteerde groenten", "fermented vegetables"]'::jsonb, 6
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_fermented'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Limited: Legumes - meer peulvruchten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'black beans', 'zwarte bonen', '["zwarte bonen", "black beans"]'::jsonb, 6
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'kidney beans', 'nierbonen', '["nierbonen", "kidney beans", "red kidney beans"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'white beans', 'witte bonen', '["witte bonen", "white beans", "cannellini beans"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'lima beans', 'limabonen', '["limabonen", "lima beans", "butter beans"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'black-eyed peas', 'oogbonen', '["oogbonen", "black-eyed peas", "cowpeas"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Limited: Non-Gluten Grains - meer granen
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'millet', 'gierst', '["gierst", "millet"]'::jsonb, 7
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'amaranth', 'amarant', '["amarant", "amaranth"]'::jsonb, 8
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'teff', 'teff', '["teff"]'::jsonb, 9
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT ic.id, 'sorghum', 'sorghum', '["sorghum"]'::jsonb, 10
  FROM public.ingredient_categories ic WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  RAISE NOTICE 'Meer ingredienten toegevoegd aan categorieën';
  
END $$;

COMMIT;
