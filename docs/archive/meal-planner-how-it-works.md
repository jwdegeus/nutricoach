# Meal Planner: hoe het werkt (analyse)

Dit document beschrijft de **end-to-end flow** van de meal planner en waar dietregels, allergieën en veiligheid worden toegepast. Bedoeld voor debugging en verbetering wanneer er ongewenste ingrediënten of onveilige combinaties in het plan verschijnen.

Zie ook: [meal-planner-agent.md](./meal-planner-agent.md) voor API-referentie en configuratie.

---

## 1. Overzicht van de flow

```
UI (regenerate / create)
    ↓
MealPlansService (createPlanForUser / regeneratePlanForUser)
    ↓
Profile laden (DietProfile) → Request bouwen (MealPlanRequest)
    ↓
[Optioneel] tryReuseMealsFromHistory → of →
    ↓
loadPrefilledBySlot (meal_history + custom_meals, per slot)
    ↓
MealPlannerAgentService.generateMealPlan(request, language, { prefilledBySlot })
    ↓
  ├─ deriveDietRuleSet(profile)     → DietRuleSet (verboden/vereist)
  ├─ getCandidatePool(dietKey, allergies + dislikes)
  ├─ getConstraintsText(dietId)     → guardrails prompttekst
  ├─ buildMealPlanPrompt(...)      → prompt met pool + regels
  ├─ Gemini generateJson (attempt 1)
  ├─ parseAndValidate (JSON + schema + validateHardConstraints)
  ├─ [indien invalid] repair prompt → Gemini (attempt 2) → parseAndValidate
  ├─ [indien ENFORCE_VNEXT] enforceVNextMealPlannerGuardrails
  └─ applyPrefilledAndAttachProvenance(plan, request, options)  ← prefilled overschrijft slots
    ↓
MealPlannerEnrichmentService.enrichPlan(plan)  → titels, instructies
    ↓
Plan + enrichment opslaan (plan_snapshot, enrichment_snapshot)
```

Belangrijk: **Validatie draait op het door Gemini gegenereerde plan. Daarna worden prefilled meals in ~80% van de slots geplaatst; die prefilled meals worden niet opnieuw gevalideerd.**

---

## 2. Waar regels vandaan komen

| Bron                            | Gebruik                                                                                                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DietProfile** (onboarding/DB) | `dietKey`, `allergies`, `dislikes`, `calorieTarget`, `prepPreferences`, meal preferences (slot styles), etc.                                                                                                                                             |
| **deriveDietRuleSet(profile)**  | Zet profile om in `DietRuleSet`: `ingredientConstraints` (forbidden items + categories), `requiredCategories`, `perMealConstraints`. Voor Wahls Paleo o.a. `categories: ['grains','dairy','legumes','processed_sugar']` + allergies als forbidden items. |
| **Guardrails (vNext)**          | `loadGuardrailsRuleset` + `compileConstraintsForAI` → tekstblok "DIET CONSTRAINTS" in de prompt. Komt uit DB (diet_types, constraint_categories, rules).                                                                                                 |
| **Config**                      | `config/meal-planner.json` + `getMealPlannerConfig()`: o.a. `targetReuseRatio`, `prefillFetchLimitMax`, `forbiddenPatternsInShakeSmoothie`.                                                                                                              |
| **Messages**                    | `getShakeSmoothieGuidance(language)`, slot labels: uit `messages/nl.json`, `messages/en.json`.                                                                                                                                                           |

---

## 3. Candidate pool (beschikbare ingrediënten)

**Functie:** `buildCandidatePool(dietKey, excludeTerms)` in `mealPlannerAgent.tools.ts`.

- **Zoeken:** Per categorie (proteins, vegetables, fruits, fats, carbs, dairy_liquids) wordt NEVO gezocht op zoektermen. Resultaten worden gefilterd met `excludeTerms` (naam bevat geen exclude-term).
- **excludeTerms:** `profile.allergies` + `profile.dislikes` + `request.excludeIngredients`. Filter is **substring op productnaam** (bijv. "melk" in naam → eruit als "melk" in excludeTerms).
- **Diet-specifiek:**
  - **carbs:** Leeg voor `keto` en `wahls_paleo_plus` (geen rijst, pasta, brood in pool).
  - **dairy_liquids:** Voor `wahls_paleo_plus` alleen niet-zuivel: amandelmelk, kokosmelk, eiwitpoeder. Voor andere diëten: melk, yoghurt, kwark, amandelmelk, sojamelk, eiwitpoeder.
- **Caching:** Pool wordt ~10 min gecached op `dietKey:excludeTerms`.

**Gap:** Exclude is alleen op naam. Als een NEVO-product geen allergie-term in de naam heeft (bijv. "Drink rijst-..." zonder "gluten"), komt het toch in de pool. Validatie moet die er alsnog uit vissen (zie sectie 5).

---

## 4. Prompt (wat de AI ziet)

**Functie:** `buildMealPlanPrompt` in `mealPlannerAgent.prompts.ts`.

De prompt bevat o.a.:

- Periode, slots, calorie/prep constraints.
- **ALLERGIES (HARD):** Lijst uit `profile.allergies` + "Do not use any ingredient that contains or matches these terms."
- **DISLIKES (SOFT):** Lijst uit `profile.dislikes`.
- **DIET RULES & CONSTRAINTS:** Samenvatting uit `rules` + optioneel **DIET CONSTRAINTS (MUST FOLLOW)** uit guardrails (`guardrailsConstraintsText`).
- **AVAILABLE INGREDIENTS (CANDIDATE POOL):** Geformatteerde lijst met nevoCode, name, tags. "You MUST choose ingredients ONLY from this list."
- **VARIETY (HARD):** Geenzelfde maaltijd op twee opeenvolgende dagen voor dezelfde slot.
- **Shake/smoothie:** Geen rauw kippenei in shake/smoothie (tekst uit messages).
- **LUNCH (SOFT):** Lunch bij voorkeur een echte maaltijd, niet alleen groentesmoothie.

De AI kan alleen nevoCodes uit de pool gebruiken; andere codes zouden later bij validatie falen (INVALID_NEVO_CODE). Maar: de **pool kan nog verboden ingrediënten bevatten** als de zoektermen of exclude-logica ze niet raken, of als de AI creatief is met wat “bevat of matcht” allergenen.

---

## 5. Validatie (hard constraints)

**Functie:** `validateHardConstraints({ plan, rules, request })` in `mealPlannerAgent.validate.ts`.

Wordt uitgevoerd op het **geparste plan** (na JSON parse en Zod schema), **vóór** prefilled meals worden toegepast.

Per meal, voor **ingredients** (legacy) en **ingredientRefs**:

1. **ALLERGEN_PRESENT**  
   `isAllergen(displayName/name, tags, profile.allergies)`.  
   Gebruikt een vaste mapping van allergie → ingrediënttermen (Nederlands + Engels), bijv. Eieren → ei, eiwit, kippenei; Lactose → melk, yoghurt, kwark, …  
   Korte termen (zoals "ei") worden alleen op **woordgrens** gematcht (niet "verrijkt" of "bereid").

2. **DISLIKED_INGREDIENT**  
   Substring-match van name/displayName en tags tegen `profile.dislikes`.

3. **FORBIDDEN_INGREDIENT (dieet)**  
   `isForbiddenIngredient(name, tags, rules)`:
   - Forbidden **items** (o.a. allergies uit rules): substring op naam.
   - Forbidden **categories** (grains, dairy, legumes, …):
     - via **tags** (bijv. NEVO `food_group_nl`);
     - via **naam** met `getIngredientCategories(ingredientName)` (ingredient-categorizer met NL/EN termen).

4. **Rauw ei in shake/smoothie**  
   `isForbiddenInShakeSmoothie(displayName)` met patronen uit config (`forbiddenPatternsInShakeSmoothie`).

5. **INVALID_NEVO_CODE**  
   Alle nevoCodes worden tegen de NEVO-database gecheckt.

6. **MISSING_REQUIRED_CATEGORY**  
   Vereiste categorieën uit rules (bijv. Wahls: organ_meats, seaweed_kelp) moeten per dag in de maaltijden zitten.

7. **MEAL_PREFERENCE_MISS**  
   Als er meal preferences zijn (slot styles), moet elke meal matchen met ten minste één preference voor die slot.

Bij validatiefouten: repair-prompt met deze issues, daarna maximaal één repair-poging met lagere temperature.

---

## 6. Prefilled meals (invullen uit DB)

**Functie:** `applyPrefilledAndAttachProvenance(plan, request, options)` in `mealPlannerAgent.service.ts`, **na** validatie.

- **Bron:** `loadPrefilledBySlot` in `mealPlans.service.ts` haalt kandidaten uit `meal_history` (op user, diet_key, slot) en `custom_meals` (met ingredientRefs uit recipe_ingredients indien nodig).
- **Doel:** ~80% van de slots vullen met bestaande maaltijden (targetReuseRatio).
- **Selectie:** Random subset van (dayIndex, slotIndex), met de beperking: geenzelfde meal id twee keer op één dag, geenzelfde meal op opeenvolgende dagen voor dezelfde slot.
- **Toepassing:** Geselecteerde slots worden **overschreven** met prefilled meals (inclusief hun ingredientRefs).

**Gap:** Prefilled meals worden **niet** opnieuw gecontroleerd op allergenen, dieetverboden of onveilige combinaties. Als een gebruiker eerder een maaltijd met rijst of melk heeft opgeslagen, of als het profiel (allergieën/dieet) is gewijzigd, kunnen die ingrediënten alsnog in het plan terechtkomen. Dit is een bewuste plek om in de toekomst validatie of filtering toe te voegen.

---

## 7. Enrichment (titels, instructies)

**Functie:** `MealPlannerEnrichmentService.enrichPlan(plan, options, language)`.

- Leest bestaande `ingredientRefs` uit het plan.
- Haalt NEVO-namen op, bouwt prompt per meal.
- Gemini genereert titel, instructiestappen, prep/cook time.
- Validatie: alleen nevoCodes die al in de meal zitten mogen in `ingredientNevoCodesUsed` staan; geen nieuwe ingrediënten.

Enrichment **voegt geen ingrediënten toe** en **verwijdert** ze niet; het voegt alleen tekst toe. Fouten zoals "rauw kipfilet in blender" komen uit de **enrichment-AI** die instructies verzint bij de gegeven ingrediënten. De oorzaak (onveilige combinatie) zit in het **plan** (die ingrediënten in die slot/meal type) of in de **enrichment-prompt** die geen strikte veiligheidsregels meekrijgt.

---

## 8. Waar het mis kan gaan (failure modes)

| Probleem                                        | Mogelijke oorzaak                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verboden ingrediënt (bijv. rijst, melk) in plan | 1) Candidate pool bevatte het nog (exclude/zoektermen). 2) Prefilled meal uit DB bevatte het (geen validatie na apply). 3) AI gebruikte een andere nevoCode dan bedoeld; validatie kijkt op naam/tags/categorie.                                                                                     |
| Allergeen in plan (bijv. ei, lactose)           | Zelfde als boven. Plus: allergie-expansie mist een term (bijv. productnaam zonder "melk" maar wel zuivel). Korte term "ei" wordt alleen op woordgrens gematcht om false positives (verrijkt, bereid) te voorkomen.                                                                                   |
| Rauw ei in shake                                | 1) Pool bevatte eiwit/kippenei voor shake. 2) Prompt/shake-guidance niet strikt genoeg. 3) Validator `forbiddenPatternsInShakeSmoothie` dekt niet alle NEVO-benamingen.                                                                                                                              |
| Rauw kip / onveilige instructie                 | Ingrediënten (bijv. kipfilet) zitten in de meal; enrichment genereert daar instructies bij. Als "rauw in blender" wordt gegenereerd, is dat een enrichment-probleem; de combinatie (shake + kip) hoort in plan-generatie of pool niet te voorkomen.                                                  |
| Zelfde maaltijd twee dagen achter elkaar        | Prefilled: `applyPrefilledMeals` probeert geenzelfde meal op opeenvolgende dagen voor dezelfde slot. AI: prompt zegt "Do NOT use the same meal on two consecutive days for the same slot". Beide kunnen falen (random prefill-selectie, AI negeert).                                                 |
| Nachtschades (bijv. aardappel) bij allergie     | Pool filtert niet op categorie "nachtschades"; alleen excludeTerms op naam. Validator gebruikt ingredient-categorizer (aardappel → nachtschades) en allergie-expansie (nachtschades → tomaat, paprika, aardappel, …). Als het nog voorkomt: AI koos toch die nevoCode of prefilled meal bevatte het. |

---

## 9. Aanbevolen vervolgstappen

1. **Prefilled valideren**  
   Na `applyPrefilledAndAttachProvenance` optioneel een tweede validatieronde op het volledige plan (inclusief prefilled meals), of prefilled kandidaten filteren op `validateHardConstraints`-logica voordat ze in `prefilledBySlot` gaan.

2. **Candidate pool strikter**  
   Voor Wahls/Keto: geen zoektermen voor granen/zuivel; eventueel na zoeken nog filteren op `getIngredientCategories` en verboden categorieën uit rules.

3. **Enrichment veiligheid**  
   In enrichment-prompt expliciet: geen rauw vlees/kip in blender; geen rauwe eieren in smoothies; kip/vlees altijd verhitten. Eventueel post-check op gegenereerde instructies op onveilige patronen.

4. **Guardrails vNext**  
   Met `ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER=true` wordt het plan na validatie nog geëvalueerd door guardrails; bij FORCE-deficit kan één retry met deficit-hint. Zorgen dat diet/allergy rules in de vNext-ruleset en in de geëvalueerde content (ingredientRefs + displayNames) zitten.

5. **Observability**  
   Bij mislukte generatie: logs met requestId, dietKey, of validatie-issues (zonder PII) helpen om te zien of het falen in parse, schema, hard constraints of guardrails zit.

---

## 10. Relevante bestanden

| Onderdeel                     | Bestand                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| Request → Plan flow           | `src/lib/meal-plans/mealPlans.service.ts`                            |
| Agent generate + repair       | `src/lib/agents/meal-planner/mealPlannerAgent.service.ts`            |
| Candidate pool                | `src/lib/agents/meal-planner/mealPlannerAgent.tools.ts`              |
| Prompt                        | `src/lib/agents/meal-planner/mealPlannerAgent.prompts.ts`            |
| Validatie (hard constraints)  | `src/lib/agents/meal-planner/mealPlannerAgent.validate.ts`           |
| Dieetregels (Wahls, keto, …)  | `src/lib/diets/diet-rules.ts`                                        |
| Ingrediëntcategorieën (NL/EN) | `src/lib/diet-validation/ingredient-categorizer.ts`                  |
| Guardrails (vNext)            | `src/lib/guardrails-vnext/index.ts`, ruleset-loader                  |
| Enrichment                    | `src/lib/agents/meal-planner/mealPlannerEnrichment.service.ts`       |
| Prefilled laden               | `src/lib/meal-plans/mealPlans.service.ts` (loadPrefilledBySlot)      |
| Config                        | `config/meal-planner.json`, `src/lib/meal-plans/mealPlans.config.ts` |
