# Stappenplan: Ingrediëntenbronnen unificeren + AI Magician uitbreiden

**Datum:** 11 februari 2026  
**Aanleiding:** Fragmentatie van ingrediëntenbronnen (NEVO, custom, FNDDS, canonical) veroorzaakt ellende. Weekmenu-prefill gebruikt alleen NEVO uit recipe_ingredients. Auto-koppelen moet alle bronnen ondersteunen.

---

## 1. Huidige situatie (analyse)

### 1.1 Tabellen en hun rol

| Tabel                                                             | Kolommen voor ingrediënt-identiteit                             | Bronnen             | Gebruikt door                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| **recipe_ingredients**                                            | `nevo_food_id` (integer)                                        | Alleen NEVO         | loadPrefilledBySlot (fallback), recipe import finalize        |
| **meal_data.ingredientRefs** (JSONB in custom_meals/meal_history) | `nevoCode`, `customFoodId`, `fdcId`, `displayName`, `quantityG` | NEVO, custom, FNDDS | loadPrefilledBySlot (primaire bron), UI, meal plans, shopping |
| **recipe_ingredient_matches**                                     | `source`, `nevo_code`, `custom_food_id`, `fdc_id`               | NEVO, custom, FNDDS | Auto-match bij opslaan recept; lookup voor ingredientRefs     |
| **canonical_ingredients**                                         | `id`, `name`, `slug`                                            | –                   | Niet geïntegreerd                                             |
| **ingredient_external_refs**                                      | `ref_type` (nevo/fdc/custom/ai), `ref_value`                    | Alle 4              | Koppelt canonical ↔ externe IDs; niet in recept-flow          |
| **ingredient_overview_v1** / **get_ingredient_overview_v1()**     | `ingredient_uid` (nevo:..., ai:..., custom:..., fndds:...)      | NEVO, custom, FNDDS | Admin, duplicate detection                                    |
| **canonical_ingredient_catalog_v1**                               | `ingredient_id`, `ref_type`, `ref_value`                        | Alle via canonical  | Niet in gebruik                                               |

### 1.2 Waar het misgaat

1. **recipe_ingredients is NEVO-only**
   - Geen `custom_food_id` of `fdc_id` kolom
   - 845 rijen, 0 met `nevo_food_id` gevuld → fallback in loadPrefilledBySlot werkt nooit

2. **Twee opslagpaden naast elkaar**
   - **meal_data.ingredientRefs**: ondersteunt NEVO, custom, FNDDS; gebruikt door prefill (primaire bron)
   - **recipe_ingredients**: alleen NEVO; gebruikt als fallback wanneer meal_data.ingredientRefs leeg is (geïmporteerde recepten)

3. **canonical_ingredients is niet aangesloten**
   - Bedoeld als “één identiteit, meerdere refs”
   - Geen koppeling met recipe_ingredients, meal_data, of prefill

4. **Zoeken en matchen**
   - `searchIngredientCandidatesAction` zoekt in NEVO, custom, FNDDS → geeft `IngredientCandidate` met nevoCode/customFoodId/fdcId
   - Match wordt opgeslagen in `recipe_ingredient_matches` + `meal_data.ingredientRefs`
   - `recipe_ingredients.nevo_food_id` wordt alleen gevuld bij NEVO-match (via updateRecipeRefIngredientAction / sync) en bij import-finalize

5. **loadPrefilledBySlot**
   - Primaire bron: `meal_data.ingredientRefs` (ondersteunt alle drie)
   - Fallback: `recipe_ingredients` met `nevo_food_id` – **alleen NEVO**
   - Recepten met alleen custom/FNDDS in meal_data werken; recepten met alleen recipe_ingredients (geen meal_data refs) werken alleen als nevo_food_id gevuld is

### 1.3 Code-locaties

| Doel                                                  | Bestand                                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prefill laden, fallback recipe_ingredients            | `src/lib/meal-plans/mealPlans.service.ts` – loadPrefilledBySlot, RECIPE_INGREDIENTS_NEVO_COLUMNS                                                 |
| MealIngredientRef type                                | `src/lib/diets/diet.types.ts` – nevoCode, canonicalIngredientId                                                                                  |
| Zoeken ingrediënten (NEVO/custom/FNDDS)               | `src/app/(app)/recipes/[recipeId]/actions/ingredient-matching.actions.ts` – searchIngredientCandidatesAction                                     |
| Opslaan match (meal_data + recipe_ingredient_matches) | `ingredient-matching.actions.ts` – updateRecipeIngredientMatchAction, saveIngredientMatchAction                                                  |
| Sync recipe_ingredients bij ref-update                | `src/app/(app)/recipes/actions/meals.actions.ts` – updateRecipeRefIngredientAction                                                               |
| Canonical types                                       | `src/lib/ingredients/canonicalIngredients.types.ts`                                                                                              |
| Ingredient overview (unified view)                    | `get_ingredient_overview_v1()`, ingredient_overview.actions.ts                                                                                   |
| AI Magician                                           | `src/app/(app)/recipes/[recipeId]/components/RecipeAIMagician.tsx` – past recept aan op dieet, raakt ingrediënten niet direct aan voor koppeling |

---

## 2. Opties voor aanpak

### Optie A: Quick fix – alleen NEVO vullen (oude aanpak)

- AI Magician / bulk-job vult `recipe_ingredients.nevo_food_id` via NEVO-lookup
- **Pro:** Kleine wijziging, prefill-fallback gaat werken
- **Con:** Blijft NEVO-centrisch; custom/FNDDS in recipe_ingredients blijven buiten beeld

### Optie B: meal_data.ingredientRefs vullen (geen recipe_ingredients aanpassen)

- AI Magician genereert voor elk recept `meal_data.ingredientRefs` (nevoCode/customFoodId/fdcId)
- loadPrefilledBySlot gebruikt al meal_data als primaire bron
- **Pro:** Geen schema-wijziging; ondersteunt alle bronnen
- **Con:** recipe_ingredients en recipe_ingredient_matches blijven los; dubbele waarheid

### Optie C: Unificatie via canonical_ingredients (lange termijn)

- canonical_ingredients wordt de ene identiteit
- recipe_ingredients krijgt `canonical_ingredient_id` (naast of in plaats van nevo_food_id)
- meal_data.ingredientRefs gebruikt `canonicalIngredientId` als primair
- Alle consumers (prefill, shopping, etc.) resolven via canonical
- **Pro:** Echte unificatie, alle bronnen gelijkwaardig
- **Con:** Grote refactor, migraties, alle consumers moeten aangepast worden

### Optie D: Hybride – meal_data + recipe_ingredient_matches (pragmatisch)

- Geen schema-wijziging aan recipe_ingredients
- AI Magician / bulk-job: per recept, per ingrediënt zoeken via searchIngredientCandidatesAction (of equivalent), beste match kiezen, opslaan in:
  - `recipe_ingredient_matches` (normalized_text → source + nevo_code/custom_food_id/fdc_id)
  - `meal_data.ingredientRefs` (nevoCode/customFoodId/fdcId + quantityG)
- loadPrefilledBySlot blijft meal_data gebruiken; fallback recipe_ingredients alleen voor NEVO
- **Pro:** Ondersteunt alle bronnen, minimale code-change, hergebruikt bestaande matching-infra
- **Con:** recipe_ingredients blijft NEVO-only; dubbele waarheid blijft voor geïmporteerde recepten

---

## 3. Aanbevolen stappenplan (fasegewijs)

### Fase 1: AI Magician uitbreiden – auto-koppelen ingrediënten (Optie D)

**Doel:** Zoveel mogelijk recepten krijgen geldige ingredientRefs (NEVO, custom of FNDDS) in meal_data, zodat prefill werkt.

| Stap | Beschrijving                                                          | Bestanden                                                                  | Afhankelijkheden                                            |
| ---- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1.1  | Nieuwe actie: `autoLinkRecipeIngredientsAction(recipeId)`             | `ingredient-matching.actions.ts` of nieuw bestand                          | searchIngredientCandidatesAction, saveIngredientMatchAction |
| 1.2  | Voor elk ingrediënt zonder ref: zoeken in NEVO + custom + FNDDS       | Zelfde zoeklogica als IngredientRowWithNutrition                           | –                                                           |
| 1.3  | AI of regelgebaseerd kiezen van beste match (fuzzy + AI fallback)     | Optioneel: Gemini voor twijfelgevallen                                     | –                                                           |
| 1.4  | Opslaan in recipe_ingredient_matches + meal_data.ingredientRefs       | saveIngredientMatchAction, updateRecipeIngredientMatchAction of equivalent | –                                                           |
| 1.5  | UI: knop “Koppel ingrediënten” in RecipeAIMagician of op receptpagina | RecipeAIMagician.tsx of MealDetail.tsx                                     | 1.1–1.4                                                     |
| 1.6  | Optioneel: bulk-job voor alle recepten van een user                   | mealPlanJobs of admin actions                                              | 1.1                                                         |

**Resultaat:** Meer recepten met ingredientRefs; weekmenu-prefill werkt beter zonder NEVO te benadrukken.

---

### Fase 2: loadPrefilledBySlot – fallback uitbreiden (indien gewenst)

**Doel:** Ook recipe_ingredients gebruiken wanneer meal_data.ingredientRefs leeg is, maar dan ook custom/FNDDS.

| Stap | Beschrijving                                                               | Bestanden                             | Opmerking                                      |
| ---- | -------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| 2.1  | recipe_ingredients: kolommen `custom_food_id`, `fdc_id` toevoegen          | Migratie                              | Backward compatible; nevo_food_id blijft       |
| 2.2  | loadPrefilledBySlot: fallback uit recipe_ingredients ook voor custom/fndds | mealPlans.service.ts                  | Ref builder: nevoCode OF customFoodId OF fdcId |
| 2.3  | Sync bij update: recipe_ingredients vullen bij custom/fndds match          | meals.actions.ts, ingredient-matching | Alleen als stap 2.1 gedaan wordt               |

**Alternatief:** Geen recipe_ingredients uitbreiden; Fase 1 vult meal_data, dan is fallback minder belangrijk.

---

### Fase 3: Unificatie via canonical (lange termijn)

**Doel:** Eén ingrediëntenidentiteit; alle consumers via canonical.

| Stap | Beschrijving                                                                                   | Bestanden                      |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| 3.1  | Backfill canonical_ingredients + ingredient_external_refs uit nevo_foods, custom_foods, fndds  | Admin job / migratie           |
| 3.2  | recipe_ingredients: `canonical_ingredient_id` toevoegen                                        | Migratie                       |
| 3.3  | MealIngredientRef: canonicalIngredientId als primair; nevoCode/customFoodId/fdcId als fallback | diet.types.ts, alle consumers  |
| 3.4  | loadPrefilledBySlot: refs resolven via canonical                                               | mealPlans.service.ts           |
| 3.5  | searchIngredientCandidatesAction: retourneer canonical id + refs                               | ingredient-matching.actions.ts |
| 3.6  | Migreren van alle bestaande refs naar canonical                                                | Data-migratie                  |

---

## 4. Lijst: wat moet er gebeuren per component

| Component                        | Huidig                                                | Fase 1                         | Fase 2                    | Fase 3                          |
| -------------------------------- | ----------------------------------------------------- | ------------------------------ | ------------------------- | ------------------------------- |
| recipe_ingredients               | Alleen nevo_food_id                                   | Ongewijzigd                    | + custom_food_id, fdc_id  | + canonical_ingredient_id       |
| meal_data.ingredientRefs         | nevoCode, customFoodId, fdcId                         | Gelijk; wordt gevuld door AI   | Gelijk                    | canonicalIngredientId primair   |
| recipe_ingredient_matches        | source, nevo_code, custom_food_id, fdc_id             | Gelijk; wordt gevuld door AI   | Gelijk                    | Optioneel canonical_id          |
| loadPrefilledBySlot              | meal_data primair, recipe_ingredients fallback (NEVO) | Gelijk (meer meal_data gevuld) | Fallback ook custom/fndds | Resolutie via canonical         |
| searchIngredientCandidatesAction | NEVO, custom, FNDDS                                   | Gelijk                         | Gelijk                    | Retourneer canonical            |
| AI Magician                      | Alleen dieet-aanpassing                               | + “Koppel ingrediënten”        | –                         | –                               |
| MealIngredientRef type           | nevoCode, canonicalIngredientId?                      | Gelijk                         | Gelijk                    | canonicalIngredientId verplicht |
| ingredient_overview              | Unified view                                          | Gelijk                         | Gelijk                    | Via canonical catalog           |

---

## 5. Beslispunten

1. **Fase 1 vs. Fase 2:** Is uitbreiden van recipe_ingredients (custom/fndds kolommen) gewenst, of is vullen van meal_data voldoende?
2. **AI vs. regelgebaseerd:** Moet auto-koppelen puur fuzzy/regelgebaseerd of ook AI (Gemini) gebruiken voor twijfelgevallen?
3. **Bulk vs. on-demand:** Alleen knop per recept, of ook bulk-job voor alle recepten?
4. **Canonical:** Fase 3 nu plannen of uitstellen?

---

## 6. Volgorde voor implementatie (Fase 1 – aanbevolen start)

1. **Analyseren** – Welke recepten hebben lege ingredientRefs en waar zitten de recipe_ingredients? (Query uit eerdere analyse.)
2. **autoLinkRecipeIngredientsAction** – Server action die voor één recept alle ingrediënten matcht en meal_data.ingredientRefs + recipe_ingredient_matches vult. ✅ **Geïmplementeerd** (`ingredient-matching.actions.ts`)
3. **UI** – Knop “Koppel ingrediënten” bij recept (naast Classificeren en AI Magician). ✅ **Geïmplementeerd** (`MealDetail.tsx`)
4. **Testen** – Voor en na: aantal recepten met ingredientRefs; weekmenu-prefill.
5. **Bulk** (optioneel) – Job of admin-pagina om alle recepten van een user te verwerken.

---

_Document: ingredient-sources-unificatie-stappenplan.md_
