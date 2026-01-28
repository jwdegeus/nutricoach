-- Migration: Reset Wahls Paleo Guard Rails Rules
-- Created: 2026-01-31
-- Description: Deactiveert bestaande Wahls Paleo regels en creëert nieuwe ruleset conform Wahls Protocol "Wahls Paleo (Level 2)"
-- Idempotent: Kan meerdere keren worden uitgevoerd zonder side effects

-- ============================================================================
-- Transaction: Alles binnen één transactie voor atomiciteit
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_diet_type_id UUID;
  v_category_id UUID;
  v_deactivated_constraints INTEGER := 0;
  v_deactivated_rules INTEGER := 0;
  v_deactivated_heuristics INTEGER := 0;
  v_inserted_categories INTEGER := 0;
  v_inserted_items INTEGER := 0;
  v_inserted_constraints INTEGER := 0;
  v_inserted_recipe_rules INTEGER := 0;
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
  -- Step 2: Deactiveer alle bestaande Wahls Paleo regels (soft delete)
  -- ============================================================================
  
  -- Deactiveer diet_category_constraints
  UPDATE public.diet_category_constraints
  SET is_active = false, updated_at = NOW()
  WHERE diet_type_id = v_diet_type_id
    AND is_active = true;
  
  GET DIAGNOSTICS v_deactivated_constraints = ROW_COUNT;
  RAISE NOTICE 'Gedeactiveerde diet_category_constraints: %', v_deactivated_constraints;
  
  -- Deactiveer recipe_adaptation_rules
  UPDATE public.recipe_adaptation_rules
  SET is_active = false, updated_at = NOW()
  WHERE diet_type_id = v_diet_type_id
    AND is_active = true;
  
  GET DIAGNOSTICS v_deactivated_rules = ROW_COUNT;
  RAISE NOTICE 'Gedeactiveerde recipe_adaptation_rules: %', v_deactivated_rules;
  
  -- Deactiveer recipe_adaptation_heuristics
  UPDATE public.recipe_adaptation_heuristics
  SET is_active = false, updated_at = NOW()
  WHERE diet_type_id = v_diet_type_id
    AND is_active = true;
  
  GET DIAGNOSTICS v_deactivated_heuristics = ROW_COUNT;
  RAISE NOTICE 'Gedeactiveerde recipe_adaptation_heuristics: %', v_deactivated_heuristics;
  
  -- ============================================================================
  -- Step 3: Upsert ingredient_categories (Wahls Paleo specifieke categorieën)
  -- ============================================================================
  -- Note: ingredient_categories zijn global (niet diet-scoped), dus we gebruiken
  -- unieke codes met wahls_ prefix om conflicten te vermijden
  
  -- Required categories
  INSERT INTO public.ingredient_categories (code, name_nl, name_en, description, category_type, display_order)
  VALUES
    ('wahls_leafy_greens', 'Wahls Bladgroenten', 'Wahls Leafy Greens', 'Bladgroenten voor Wahls Paleo: spinazie, boerenkool, sla, snijbiet, etc. (min 3 cups/dag)', 'required', 1),
    ('wahls_sulfur_rich', 'Wahls Zwavelrijke Groenten', 'Wahls Sulfur-Rich Vegetables', 'Zwavelrijke groenten: broccoli, bloemkool, kool, spruitjes, ui, knoflook (min 3 cups/dag)', 'required', 2),
    ('wahls_colored', 'Wahls Gekleurde Groenten', 'Wahls Colored Vegetables', 'Gekleurde groenten: wortel, biet, paprika, zoete aardappel, pompoen (min 3 cups/dag)', 'required', 3),
    ('wahls_sea_vegetables', 'Wahls Zeewier', 'Wahls Sea Vegetables', 'Zeewier en kelp: nori, kelp, wakame, kombu, dulse (min 1 portie/dag)', 'required', 4),
    ('wahls_organ_meat', 'Wahls Orgaanvlees', 'Wahls Organ Meat', 'Orgaanvlees: lever, hart, nier, tong (min 12 oz/week of 2x/week)', 'required', 5),
    ('wahls_omega3_fish', 'Wahls Omega-3 Vis', 'Wahls Omega-3 Fish', 'Omega-3 rijke vis: sardines, zalm, makreel, haring, ansjovis (min 16 oz/week)', 'required', 6),
    ('wahls_fermented', 'Wahls Gefermenteerd', 'Wahls Fermented Foods', 'Gefermenteerd voedsel: zuurkool, kimchi, kefir (coconut), kombucha (optioneel) (min 1 portie/dag)', 'required', 7)
  ON CONFLICT (code) DO UPDATE
  SET 
    name_nl = EXCLUDED.name_nl,
    name_en = EXCLUDED.name_en,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = NOW();
  
  GET DIAGNOSTICS v_inserted_categories = ROW_COUNT;
  RAISE NOTICE 'Upserted ingredient_categories: %', v_inserted_categories;
  
  -- Forbidden categories (hard block)
  INSERT INTO public.ingredient_categories (code, name_nl, name_en, description, category_type, display_order)
  VALUES
    ('wahls_forbidden_gluten', 'Wahls Verboden: Gluten', 'Wahls Forbidden: Gluten', 'Glutenhoudende granen en producten: tarwe, spelt, rogge, gerst, pasta, brood', 'forbidden', 10),
    ('wahls_forbidden_dairy', 'Wahls Verboden: Zuivel', 'Wahls Forbidden: Dairy', 'Zuivelproducten: melk, kaas, yoghurt, boter, room', 'forbidden', 11),
    ('wahls_forbidden_soy', 'Wahls Verboden: Soja', 'Wahls Forbidden: Soy', 'Sojaproducten: soja, tofu, tempeh, edamame, sojasaus, miso', 'forbidden', 12),
    ('wahls_forbidden_added_sugar', 'Wahls Verboden: Toegevoegde Suiker', 'Wahls Forbidden: Added Sugar', 'Toegevoegde suikers: suiker, honing, siroop, agave, fructose, glucose', 'forbidden', 13),
    ('wahls_forbidden_ultra_processed', 'Wahls Verboden: Ultrabewerkt', 'Wahls Forbidden: Ultra-Processed', 'Ultrabewerkte producten: chips, frisdrank, snoep, koek, cake, energy drinks', 'forbidden', 14)
  ON CONFLICT (code) DO UPDATE
  SET 
    name_nl = EXCLUDED.name_nl,
    name_en = EXCLUDED.name_en,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = NOW();
  
  -- Limited categories (soft warning)
  INSERT INTO public.ingredient_categories (code, name_nl, name_en, description, category_type, display_order)
  VALUES
    ('wahls_limited_legumes', 'Wahls Beperkt: Peulvruchten', 'Wahls Limited: Legumes', 'Peulvruchten: linzen, bonen, kikkererwten, erwten, pinda (max 2x/week - SOFT WARNING)', 'forbidden', 20),
    ('wahls_limited_non_gluten_grains', 'Wahls Beperkt: Non-Gluten Granen', 'Wahls Limited: Non-Gluten Grains', 'Non-gluten granen en zetmeel: rijst, quinoa, boekweit, mais, haver, aardappel (max 2x/week - SOFT WARNING)', 'forbidden', 21)
  ON CONFLICT (code) DO UPDATE
  SET 
    name_nl = EXCLUDED.name_nl,
    name_en = EXCLUDED.name_en,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = NOW();
  
  -- ============================================================================
  -- Step 4: Insert ingredient_category_items (curated sets)
  -- ============================================================================
  
  -- Forbidden: Gluten
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'wheat',
    'tarwe',
    '["tarwe", "tarwebloem", "tarwemeel", "bloem", "meel", "wheat flour"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'pasta',
    'pasta',
    '["spaghetti", "penne", "fusilli", "macaroni", "orzo", "risoni", "noedels", "tagliatelle", "fettuccine", "linguine", "ravioli", "lasagne", "gnocchi"]'::jsonb,
    -- Note: couscous verwijderd - wordt apart toegevoegd als item
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'bread',
    'brood',
    '["brood", "bread", "stokbrood", "baguette", "ciabatta", "focaccia"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'spelt',
    'spelt',
    '["spelt", "speltmeel", "spelt flour"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'rye',
    'rogge',
    '["rogge", "rye", "roggebloem", "rye flour"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'barley',
    'gerst',
    '["gerst", "barley", "gerstemeel", "barley flour"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'seitan',
    'seitan',
    '["seitan", "wheat gluten"]'::jsonb,
    7
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'couscous',
    'couscous',
    '["couscous"]'::jsonb,
    8
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Dairy
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'milk',
    'melk',
    '["melk", "milk", "koemelk", "volle melk", "halfvolle melk", "magere melk", "whole milk", "skim milk"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'cheese',
    'kaas',
    '["kaas", "cheese", "cheddar", "gouda", "mozzarella", "feta", "brie"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'yoghurt',
    'yoghurt',
    '["yoghurt", "yogurt", "greek yogurt", "griekse yoghurt"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'butter',
    'boter',
    '["boter", "butter", "roomboter"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'cream',
    'room',
    '["room", "cream", "slagroom", "whipping cream", "heavy cream"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'whey',
    'wei',
    '["wei", "whey", "whey protein"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'casein',
    'caseïne',
    '["caseïne", "casein", "casein protein"]'::jsonb,
    7
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Soy
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'soy',
    'soja',
    '["soja", "soy", "soybean", "sojaboon"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'tofu',
    'tofu',
    '["tofu", "bean curd"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'tempeh',
    'tempeh',
    '["tempeh"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'edamame',
    'edamame',
    '["edamame", "sojabonen"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'soy sauce',
    'sojasaus',
    '["sojasaus", "soy sauce", "tamari"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'miso',
    'miso',
    '["miso", "miso paste"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_soy'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Added Sugar
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'sugar',
    'suiker',
    '["suiker", "sugar", "witte suiker", "white sugar", "rietsuiker", "cane sugar", "brown sugar", "bruine suiker"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'honey',
    'honing',
    '["honing", "honey"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'syrup',
    'siroop',
    '["siroop", "syrup", "maple syrup", "ahornsiroop", "agave", "agave syrup", "agavesiroop"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'fructose',
    'fructose',
    '["fructose", "fructosesiroop", "high fructose corn syrup", "hfcs"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'glucose',
    'glucose',
    '["glucose", "glucosesiroop", "dextrose"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_added_sugar'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Forbidden: Ultra-Processed
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'chips',
    'chips',
    '["chips", "potato chips", "crisps"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'soda',
    'frisdrank',
    '["frisdrank", "soda", "cola", "fanta", "sprite", "soft drink"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'candy',
    'snoep',
    '["snoep", "candy", "sweets", "chocolate", "chocolade"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'cookie',
    'koek',
    '["koek", "cookie", "biscuit", "biscuits"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'cake',
    'cake',
    '["cake", "taart", "pie"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'energy drink',
    'energy drink',
    '["energy drink", "red bull", "monster"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_ultra_processed'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Sea Vegetables
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'nori',
    'nori',
    '["nori", "nori sheets"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'kelp',
    'kelp',
    '["kelp", "kelp powder"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'kombu',
    'kombu',
    '["kombu"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'wakame',
    'wakame',
    '["wakame"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'dulse',
    'dulse',
    '["dulse"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'spirulina',
    'spirulina',
    '["spirulina", "spirulina powder"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'chlorella',
    'chlorella',
    '["chlorella", "chlorella powder"]'::jsonb,
    7
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Leafy Greens
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'spinach',
    'spinazie',
    '["spinazie", "spinach"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'kale',
    'boerenkool',
    '["boerenkool", "kale", "curly kale"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'lettuce',
    'sla',
    '["sla", "lettuce", "romaine", "romaine sla", "iceberg", "iceberg sla"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'chard',
    'snijbiet',
    '["snijbiet", "chard", "swiss chard", "zwitserse snijbiet"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'arugula',
    'rucola',
    '["rucola", "arugula", "rocket"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'bok choy',
    'paksoi',
    '["paksoi", "bok choy", "chinese cabbage"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_leafy_greens'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Note: collard greens verwijderd - duplicaat van kale/boerenkool
  
  -- Sulfur Rich Vegetables
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'broccoli',
    'broccoli',
    '["broccoli"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'cauliflower',
    'bloemkool',
    '["bloemkool", "cauliflower"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'cabbage',
    'kool',
    '["kool", "cabbage", "white cabbage", "witte kool", "red cabbage", "rode kool"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'brussels sprouts',
    'spruitjes',
    '["spruitjes", "brussels sprouts", "brussel sprouts"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'onion',
    'ui',
    '["ui", "onion", "yellow onion", "gele ui", "red onion", "rode ui"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'garlic',
    'knoflook',
    '["knoflook", "garlic"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'leek',
    'prei',
    '["prei", "leek"]'::jsonb,
    7
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Colored Vegetables
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'carrot',
    'wortel',
    '["wortel", "carrot", "carrots", "wortelen"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'beet',
    'biet',
    '["biet", "beet", "beets", "bieten", "beetroot"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'bell pepper',
    'paprika',
    '["paprika", "bell pepper", "peppers", "red pepper", "rode paprika", "yellow pepper", "gele paprika"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'sweet potato',
    'zoete aardappel',
    '["zoete aardappel", "sweet potato", "sweet potatoes"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'pumpkin',
    'pompoen',
    '["pompoen", "pumpkin", "butternut squash", "butternut pompoen"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_colored'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Note: squash verwijderd - merge met pumpkin (pompoen)
  -- Update pumpkin synonyms om squash varianten te includeren
  UPDATE public.ingredient_category_items
  SET synonyms = '["pompoen", "pumpkin", "butternut squash", "butternut pompoen", "squash", "zucchini", "courgette", "yellow squash", "gele pompoen"]'::jsonb
  WHERE category_id IN (SELECT id FROM public.ingredient_categories WHERE code = 'wahls_colored')
    AND term = 'pumpkin';
  
  -- Organ Meat
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'liver',
    'lever',
    '["lever", "liver", "chicken liver", "kiplever", "beef liver", "runderlever"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_organ_meat'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'heart',
    'hart',
    '["hart", "heart", "chicken heart", "kiphart", "beef heart", "runderhart"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_organ_meat'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'kidney',
    'nier',
    '["nier", "kidney", "chicken kidney", "kipnier"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_organ_meat'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'tongue',
    'tong',
    '["tong", "tongue", "beef tongue", "runderstong"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_organ_meat'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'tripe',
    'pens',
    '["pens", "tripe"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_organ_meat'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Omega-3 Fish
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'sardines',
    'sardientjes',
    '["sardientjes", "sardines", "sardine"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'salmon',
    'zalm',
    '["zalm", "salmon", "atlantic salmon", "atlantische zalm", "wild salmon", "wilde zalm"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'mackerel',
    'makreel',
    '["makreel", "mackerel"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'herring',
    'haring',
    '["haring", "herring"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'anchovies',
    'ansjovis',
    '["ansjovis", "anchovies", "anchovy"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_omega3_fish'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Fermented
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'sauerkraut',
    'zuurkool',
    '["zuurkool", "sauerkraut"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_fermented'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'kimchi',
    'kimchi',
    '["kimchi"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_fermented'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'kefir',
    'kefir',
    '["kefir", "coconut kefir", "kokosnoot kefir"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_fermented'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'kombucha',
    'kombucha',
    '["kombucha"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_fermented'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'pickles',
    'augurken',
    '["augurken", "pickles", "fermented pickles"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_fermented'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Limited: Legumes (soft warning)
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'lentils',
    'linzen',
    '["linzen", "lentils", "red lentils", "rode linzen", "green lentils", "groene linzen"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'beans',
    'bonen',
    '["bonen", "beans", "black beans", "zwarte bonen", "kidney beans", "nierbonen", "white beans", "witte bonen"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'chickpeas',
    'kikkererwten',
    '["kikkererwten", "chickpeas", "garbanzo beans"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'peas',
    'erwten',
    '["erwten", "peas", "green peas", "groene erwten", "split peas", "spliterwten"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'peanut',
    'pinda',
    '["pinda", "peanut", "peanuts", "pindas"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_legumes'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  -- Limited: Non-Gluten Grains (soft warning)
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'rice',
    'rijst',
    '["rijst", "rice", "white rice", "witte rijst", "brown rice", "bruine rijst"]'::jsonb,
    1
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'quinoa',
    'quinoa',
    '["quinoa"]'::jsonb,
    2
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'buckwheat',
    'boekweit',
    '["boekweit", "buckwheat"]'::jsonb,
    3
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'corn',
    'mais',
    '["mais", "corn", "maize", "cornmeal", "maismeel"]'::jsonb,
    4
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'oats',
    'haver',
    '["haver", "oats", "oatmeal", "havermout"]'::jsonb,
    5
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  
  INSERT INTO public.ingredient_category_items (category_id, term, term_nl, synonyms, display_order)
  SELECT 
    ic.id,
    'potato',
    'aardappel',
    '["aardappel", "potato", "potatoes", "aardappelen"]'::jsonb,
    6
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_non_gluten_grains'
  ON CONFLICT (category_id, term) DO UPDATE
  SET synonyms = EXCLUDED.synonyms, is_active = true, updated_at = NOW();
  -- Note: sweet potato verwijderd uit synonyms - staat al in colored categorie
  
  GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
  RAISE NOTICE 'Inserted/updated ingredient_category_items: %', v_inserted_items;
  
  -- ============================================================================
  -- Step 5: Insert diet_category_constraints (targets en verboden)
  -- ============================================================================
  
  -- ============================================================================
  -- Step 5: diet_category_constraints (targets en verboden)
  -- ============================================================================
  -- Constraint-agnostic upsert: UPDATE + INSERT WHERE NOT EXISTS
  -- (works with UNIQUE(diet_type_id, category_id) or UNIQUE(diet_type_id, category_id, rule_action))

  -- Required: Leafy Greens (min 3 cups/day)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'required', rule_action = 'allow', strictness = 'hard',
      min_per_day = 3, min_per_week = NULL, priority = 90, rule_priority = 90,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_leafy_greens' AND dcc.rule_action = 'allow';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'required', 'allow', 'hard', 3, NULL, 90, 90, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_leafy_greens'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'allow');

  -- Required: Sulfur Rich (min 3 cups/day)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'required', rule_action = 'allow', strictness = 'hard',
      min_per_day = 3, min_per_week = NULL, priority = 90, rule_priority = 90,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_sulfur_rich' AND dcc.rule_action = 'allow';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'required', 'allow', 'hard', 3, NULL, 90, 90, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sulfur_rich'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'allow');

  -- Required: Colored (min 3 cups/day)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'required', rule_action = 'allow', strictness = 'hard',
      min_per_day = 3, min_per_week = NULL, priority = 90, rule_priority = 90,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_colored' AND dcc.rule_action = 'allow';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'required', 'allow', 'hard', 3, NULL, 90, 90, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_colored'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'allow');

  -- Required: Sea Vegetables (min 1 serving/day)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'required', rule_action = 'allow', strictness = 'hard',
      min_per_day = 1, min_per_week = NULL, priority = 90, rule_priority = 90,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_sea_vegetables' AND dcc.rule_action = 'allow';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'required', 'allow', 'hard', 1, NULL, 90, 90, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_sea_vegetables'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'allow');

  -- Required: Organ Meat (min 12 oz/week or 2x/week)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'required', rule_action = 'allow', strictness = 'hard',
      min_per_day = NULL, min_per_week = 2, priority = 90, rule_priority = 90,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_organ_meat' AND dcc.rule_action = 'allow';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'required', 'allow', 'hard', NULL, 2, 90, 90, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_organ_meat'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'allow');

  -- Required: Omega-3 Fish (min 16 oz/week)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'required', rule_action = 'allow', strictness = 'hard',
      min_per_day = NULL, min_per_week = 1, priority = 90, rule_priority = 90,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_omega3_fish' AND dcc.rule_action = 'allow';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'required', 'allow', 'hard', NULL, 1, 90, 90, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_omega3_fish'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'allow');

  -- Required: Fermented (min 1 serving/day)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'required', rule_action = 'allow', strictness = 'hard',
      min_per_day = 1, min_per_week = NULL, priority = 80, rule_priority = 80,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_fermented' AND dcc.rule_action = 'allow';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'required', 'allow', 'hard', 1, NULL, 80, 80, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_fermented'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'allow');

  -- Forbidden: Gluten (hard block)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'forbidden', rule_action = 'block', strictness = 'hard',
      min_per_day = NULL, min_per_week = NULL, priority = 100, rule_priority = 100,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_forbidden_gluten' AND dcc.rule_action = 'block';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'forbidden', 'block', 'hard', NULL, NULL, 100, 100, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_gluten'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'block');

  -- Forbidden: Dairy (hard block)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'forbidden', rule_action = 'block', strictness = 'hard',
      min_per_day = NULL, min_per_week = NULL, priority = 100, rule_priority = 100,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_forbidden_dairy' AND dcc.rule_action = 'block';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'forbidden', 'block', 'hard', NULL, NULL, 100, 100, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_dairy'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'block');

  -- Forbidden: Soy (hard block)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'forbidden', rule_action = 'block', strictness = 'hard',
      min_per_day = NULL, min_per_week = NULL, priority = 100, rule_priority = 100,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_forbidden_soy' AND dcc.rule_action = 'block';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'forbidden', 'block', 'hard', NULL, NULL, 100, 100, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_soy'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'block');

  -- Forbidden: Added Sugar (hard block)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'forbidden', rule_action = 'block', strictness = 'hard',
      min_per_day = NULL, min_per_week = NULL, priority = 100, rule_priority = 100,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_forbidden_added_sugar' AND dcc.rule_action = 'block';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'forbidden', 'block', 'hard', NULL, NULL, 100, 100, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_added_sugar'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'block');

  -- Forbidden: Ultra-Processed (hard block)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'forbidden', rule_action = 'block', strictness = 'hard',
      min_per_day = NULL, min_per_week = NULL, priority = 100, rule_priority = 100,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_forbidden_ultra_processed' AND dcc.rule_action = 'block';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'forbidden', 'block', 'hard', NULL, NULL, 100, 100, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_forbidden_ultra_processed'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'block');

  -- Limited: Legumes (soft warning)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'forbidden', rule_action = 'block', strictness = 'soft',
      min_per_day = NULL, min_per_week = NULL, priority = 60, rule_priority = 60,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_limited_legumes' AND dcc.rule_action = 'block';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'forbidden', 'block', 'soft', NULL, NULL, 60, 60, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_legumes'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'block');

  -- Limited: Non-Gluten Grains (soft warning)
  UPDATE public.diet_category_constraints dcc
  SET constraint_type = 'forbidden', rule_action = 'block', strictness = 'soft',
      min_per_day = NULL, min_per_week = NULL, priority = 60, rule_priority = 60,
      is_active = true, updated_at = NOW()
  FROM public.ingredient_categories ic
  WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND ic.code = 'wahls_limited_non_gluten_grains' AND dcc.rule_action = 'block';
  INSERT INTO public.diet_category_constraints (diet_type_id, category_id, constraint_type, rule_action, strictness, min_per_day, min_per_week, priority, rule_priority, is_active)
  SELECT v_diet_type_id, ic.id, 'forbidden', 'block', 'soft', NULL, NULL, 60, 60, true
  FROM public.ingredient_categories ic
  WHERE ic.code = 'wahls_limited_non_gluten_grains'
    AND NOT EXISTS (SELECT 1 FROM public.diet_category_constraints dcc WHERE dcc.diet_type_id = v_diet_type_id AND dcc.category_id = ic.id AND dcc.rule_action = 'block');

  GET DIAGNOSTICS v_inserted_constraints = ROW_COUNT;
  RAISE NOTICE 'Inserted/updated diet_category_constraints: %', v_inserted_constraints;
  
  -- ============================================================================
  -- Step 6: Insert recipe_adaptation_rules (voor extra guard rails)
  -- ============================================================================
  -- Deze regels worden gebruikt door RecipeAdaptationService als fallback/extra layer
  
  -- Gluten
  INSERT INTO public.recipe_adaptation_rules (
    diet_type_id, term, synonyms, rule_code, rule_label, substitution_suggestions, priority, is_active
  )
  VALUES (
    v_diet_type_id,
    'gluten',
    '["wheat", "spelt", "rye", "barley", "pasta", "bread", "brood", "seitan"]'::jsonb,
    'FORBIDDEN_GLUTEN',
    'Gluten verboden (Wahls Paleo)',
    '["glutenvrije pasta", "courgette noodles", "spaghetti squash"]'::jsonb,
    100,
    true
  )
  ON CONFLICT (diet_type_id, term) DO UPDATE
  SET 
    synonyms = EXCLUDED.synonyms,
    rule_code = EXCLUDED.rule_code,
    rule_label = EXCLUDED.rule_label,
    substitution_suggestions = EXCLUDED.substitution_suggestions,
    priority = EXCLUDED.priority,
    is_active = true,
    updated_at = NOW();
  
  -- Dairy
  INSERT INTO public.recipe_adaptation_rules (
    diet_type_id, term, synonyms, rule_code, rule_label, substitution_suggestions, priority, is_active
  )
  VALUES (
    v_diet_type_id,
    'dairy',
    '["milk", "melk", "cheese", "kaas", "yoghurt", "butter", "boter", "cream", "room"]'::jsonb,
    'FORBIDDEN_DAIRY',
    'Zuivel verboden (Wahls Paleo)',
    '["coconut milk", "kokosmelk", "almond milk", "amandelmelk", "coconut oil", "kokosolie"]'::jsonb,
    100,
    true
  )
  ON CONFLICT (diet_type_id, term) DO UPDATE
  SET 
    synonyms = EXCLUDED.synonyms,
    rule_code = EXCLUDED.rule_code,
    rule_label = EXCLUDED.rule_label,
    substitution_suggestions = EXCLUDED.substitution_suggestions,
    priority = EXCLUDED.priority,
    is_active = true,
    updated_at = NOW();
  
  -- Soy
  INSERT INTO public.recipe_adaptation_rules (
    diet_type_id, term, synonyms, rule_code, rule_label, substitution_suggestions, priority, is_active
  )
  VALUES (
    v_diet_type_id,
    'soy',
    '["soja", "tofu", "tempeh", "edamame", "soy sauce", "sojasaus", "miso"]'::jsonb,
    'FORBIDDEN_SOY',
    'Soja verboden (Wahls Paleo)',
    '["coconut aminos", "tamari (glutenvrij, maar nog steeds soja - vermijden)", "sea salt"]'::jsonb,
    100,
    true
  )
  ON CONFLICT (diet_type_id, term) DO UPDATE
  SET 
    synonyms = EXCLUDED.synonyms,
    rule_code = EXCLUDED.rule_code,
    rule_label = EXCLUDED.rule_label,
    substitution_suggestions = EXCLUDED.substitution_suggestions,
    priority = EXCLUDED.priority,
    is_active = true,
    updated_at = NOW();
  
  GET DIAGNOSTICS v_inserted_recipe_rules = ROW_COUNT;
  RAISE NOTICE 'Inserted/updated recipe_adaptation_rules: %', v_inserted_recipe_rules;
  
  -- ============================================================================
  -- Summary
  -- ============================================================================
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Wahls Paleo Rules Reset Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Deactivated:';
  RAISE NOTICE '  - Constraints: %', v_deactivated_constraints;
  RAISE NOTICE '  - Recipe Rules: %', v_deactivated_rules;
  RAISE NOTICE '  - Heuristics: %', v_deactivated_heuristics;
  RAISE NOTICE 'Inserted/Updated:';
  RAISE NOTICE '  - Categories: %', v_inserted_categories;
  RAISE NOTICE '  - Category Items: %', v_inserted_items;
  RAISE NOTICE '  - Constraints: %', v_inserted_constraints;
  RAISE NOTICE '  - Recipe Rules: %', v_inserted_recipe_rules;
  RAISE NOTICE '========================================';
  
END $$;

-- ============================================================================
-- Verification Queries (commented out - uncomment for dry-run verification)
-- ============================================================================

/*
-- Count active constraints per table for Wahls Paleo
SELECT 
  'diet_category_constraints' as table_name,
  COUNT(*) as active_count
FROM public.diet_category_constraints dcc
JOIN public.diet_types dt ON dt.id = dcc.diet_type_id
WHERE dt.name = 'Wahls Paleo' AND dcc.is_active = true

UNION ALL

SELECT 
  'recipe_adaptation_rules' as table_name,
  COUNT(*) as active_count
FROM public.recipe_adaptation_rules rar
JOIN public.diet_types dt ON dt.id = rar.diet_type_id
WHERE dt.name = 'Wahls Paleo' AND rar.is_active = true

UNION ALL

SELECT 
  'recipe_adaptation_heuristics' as table_name,
  COUNT(*) as active_count
FROM public.recipe_adaptation_heuristics rah
JOIN public.diet_types dt ON dt.id = rah.diet_type_id
WHERE dt.name = 'Wahls Paleo' AND rah.is_active = true;

-- Show all active constraints with categories
SELECT 
  ic.code as category_code,
  ic.name_nl as category_name,
  dcc.constraint_type,
  dcc.rule_action,
  dcc.strictness,
  dcc.min_per_day,
  dcc.min_per_week,
  dcc.rule_priority
FROM public.diet_category_constraints dcc
JOIN public.ingredient_categories ic ON ic.id = dcc.category_id
JOIN public.diet_types dt ON dt.id = dcc.diet_type_id
WHERE dt.name = 'Wahls Paleo' AND dcc.is_active = true
ORDER BY dcc.rule_priority DESC, ic.code;
*/

COMMIT;
