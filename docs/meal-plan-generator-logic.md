# Logica van de meal-plan generator

Overzicht van hoe een weekmenu wordt gegenereerd: van aanvraag tot opgeslagen plan.

---

## 1. Entree: `createPlanForUser`

De flow start in **MealPlansService.createPlanForUser(userId, input)**.

**Input:** `dateFrom`, `days`, optioneel `calorieTarget`.

**Stappen:**

1. **Validatie** – Input wordt gevalideerd met `createMealPlanInputSchema`.
2. **Profile laden** – `ProfileService.loadDietProfileForUser(userId)`:
   - Gezinsdieet uit **user_preferences** (diet_type_id, max_prep, servings_default, variety, meal preferences),
   - Allergieën/dislikes = **vereniging van alle familieleden**,
   - Fallback: default familielid of user_diet_profiles (legacy).
3. **Taal** – `getUserLanguage(userId)` uit user_preferences.
4. **Calorie-override** – Als `input.calorieTarget` is meegegeven, overschrijft die de profile target.
5. **Slot-stijlen** – Uit **user_preferences**: ontbijt/lunch/diner-stijl, weekend-diner, weekenddagen. Worden in het profile en in `slotPreferences` gestopt voor de prompt.
6. **Request bouwen** – `MealPlanRequest`: dateRange, slots (breakfast/lunch/dinner), profile, slotPreferences, optioneel therapeuticTargets (default familielid).
7. **Therapeutische targets** – Als de user een actief therapeutisch protocol heeft (default familielid): `buildTherapeuticTargetsSnapshot()` → doelen (o.a. groente-grammen, supplementen) in het request.
8. **Idempotentie** – Bestaand plan met dezelfde user, date_from, days, diet_key? → direct dat plan-id terug, geen nieuwe generatie.
9. **Quota & concurrency** – Rate limit en “geen dubbele run” check.
10. **Regels afleiden** – `deriveDietRuleSet(profile)`: dieetregels uit het profile (nooit uit de request zelf).

Daarna volgt de **generatie** (zie hieronder), daarna **enrichment**, **schalen**, **opslaan**.

---

## 2. Generatie: drie paden

Er zijn drie manieren om het plan te vullen (in volgorde van voorkeur):

### A. Hergebruik uit meal history

**`tryReuseMealsFromHistory(userId, request, dietKey, historyService)`**

- **Doel:** Minder API-aanroepen; bestaande, goed beoordeelde maaltijden hergebruiken.
- **Voorwaarde:** Minimaal **50%** van alle slots (dagen × 3) moet uit de history kunnen worden gevuld.
- **Per slot:** Zoekt in `meal_history` naar maaltijden voor dat slot, dieet, met rating ≥ 3 en combined_score ≥ 60, niet te vaak hergebruikt, bij voorkeur niet in de laatste 7 dagen. Optioneel gefilterd op meal preferences.
- **Resultaat:** Als er genoeg geschikte maaltijden zijn → plan wordt opgebouwd uit deze maaltijden (alleen datums aangepast). Geen AI, geen template.
- **Anders:** `canReuse: false` → volgende stap (prefill + agent of template).

### B. Template-generator (geen vrije AI)

**Actief als:** `USE_TEMPLATE_MEAL_GENERATOR === 'true'`.

- **Config** – `loadMealPlanGeneratorConfig(supabase, dietKey)`: templates, slots, pool items (eiwit/groente/vet/smaak), generator settings (max_ingredients, repeat caps, veg scoring), name patterns.
- **Pools** – Recept-/ingrediëntenpool uit config wordt gemerged met het candidate pool uit dieet + uitsluitingen; daarna gefilterd op allergies/dislikes en optioneel guardrails hard-block terms.
- **Generatie** – `generateTemplatePlan(request, config, templatePools)`: voor elke dag/slot wordt een maaltijd gegenereerd uit **templates** (vaste structuur: eiwit, veg1, veg2, vet, smaak) en de pools. Geen vrije tekst van Gemini; wel deterministische/variatie-logica (geen herhaling binnen 7 dagen, caps voor eiwit/template-herhaling).
- **Guardrails (optioneel)** – Als `ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER === 'true'`: plan wordt gecontroleerd; bij overtreding één retry met andere seed.
- **Sanity check** – `validateMealPlanSanity(plan)`; bij problemen max één retry met andere seed.
- **Prefill** – Daarna kan nog `applyPrefilledAndAttachProvenance` worden gedraaid (prefilled kandidaten uit DB inzetten waar van toepassing).

### C. Gemini (vrije AI)

**Actief als:** `USE_TEMPLATE_MEAL_GENERATOR !== 'true'`.

- **Candidate pool** – Zelfde recept-/ingrediëntenpool, gesanitized (allergieën/dislikes uitgebreid, pool uitgefilterd).
- **Prompt** – `buildMealPlanPrompt(...)`: request, rules, candidates, taal, guardrails constraint-tekst, shake/smoothie-richtlijnen. Optioneel force-deficit hint na guardrails-overtreding.
- **Schema** – Flattened JSON-schema voor Gemini (max nesting depth).
- **Aanroep** – `gemini.generateJson(...)` met temperature 0.4 (retry 0.3).
- **Validatie** – Response wordt geparsed en gevalideerd tegen dieetregels en schema.
- **Guardrails** – Bij `ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER`: controle op het plan; bij GUARDRAILS_VIOLATION (incl. force-deficits) max één retry met deficit-hint in de prompt.
- **Prefill** – Als `options.prefilledBySlot` is meegegeven: ~80% van de slots wordt uit die kandidaten gevuld, de rest door de AI. Prefill komt van **loadPrefilledBySlot** (zie hieronder).

---

## 3. Prefill-kandidaten (wanneer niet volledig hergebruik)

**`loadPrefilledBySlot(userId, request, dietKey, supabase)`**

- **Doel:** Per slot (breakfast, lunch, dinner) een set kandidaten uit de DB leveren die de AI (of template-flow) kan gebruiken om ~80% van de slots in te vullen.
- **Bronnen:**
  - **meal_history** – Eerdere maaltijden voor deze user/diet/slot, gesorteerd op combined_score, user_rating, last_used_at.
  - **custom_meals** – Eigen maaltijden van de user.
- **Filtering:**
  - **Favorieten** – user_preferences.favorite_meal_ids: kandidaten worden zo nodig voorgetrokken.
  - **Household avoid (hard)** – user_preferences.household_id → household_avoid_rules (strictness='hard'). Maaltijden die tegen deze regels ingaan worden uitgesloten.
  - **Allergieën/dislikes** – request.profile.allergies en dislikes: maaltijden met die ingrediënten vallen af.
- **Limiet** – Per slot een maximum aantal kandidaten (afhankelijk van targetReuseRatio en aantal dagen); zie `mealPlans.config` (targetReuseRatio 0.8, prefillFetchLimitMax 20).

---

## 4. Na de generatie (in createPlanForUser)

1. **Therapeutische supplementen-samenvatting** – Als de user een actief therapeutisch profiel heeft: `buildTherapeuticSupplementsSummary()` → in plan.metadata.
2. **Enrichment** – `MealPlannerEnrichmentService.enrichPlan(plan, ...)`: o.a. vertaling, extra metadata. Bij fout: plan blijft staan, zonder enrichment.
3. **Schalen naar huishoudgrootte** – user_preferences.household_id → **households** (household_size, servings_policy). Als policy = `scale_to_household` en size ≥ 2: `scaleMealPlanToHousehold(plan, householdSize, policy)`.
4. **Opslaan** – Insert in **meal_plans** (user_id, diet_key, date_from, days, request_snapshot, rules_snapshot, plan_snapshot, enrichment_snapshot).
5. **Meal history bijwerken** – `extractAndStoreMeals()` voor hergebruik bij een volgende keer.
6. **Run status** – meal_plan_runs op success/error bijwerken.

---

## 5. Overzicht gegevensbronnen

| Wat                                                    | Bron                                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Dieet, max prep, porties, variatie, maaltijdvoorkeuren | user_preferences (gezin)                                                                                    |
| Allergieën/dislikes in plan                            | Vereniging van alle family_member_preferences                                                               |
| Slot-stijlen (ontbijt/lunch/diner/weekend)             | user_preferences                                                                                            |
| Therapeutische doelen                                  | Default familielid → family_member_therapeutic_profiles + health                                            |
| Taal                                                   | user_preferences.language                                                                                   |
| Favoriete maaltijden                                   | user_preferences.favorite_meal_ids                                                                          |
| Harde uitsluitingen (prefill + apply draft)            | household_avoid_rules (via user_preferences.household_id)                                                   |
| Huishoudgrootte / schaalbeleid                         | households (via user_preferences.household_id)                                                              |
| Templates, pools, generator settings                   | meal_plan_templates, meal_plan_template_slots, generator_config, meal_plan_generator_settings (op diet_key) |
| Recept-/ingrediëntenpool                               | Dieet + candidate pool (recepten/ingrediënten die voldoen aan dieetregels)                                  |

---

## 6. Configuratie (env / config)

- **USE_TEMPLATE_MEAL_GENERATOR** – `true` = template-generator, anders Gemini.
- **ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER** – `true` = guardrails afdwingen (en eventueel retry).
- **config/meal-planner.json** (of MEAL*PLANNER*\* env):
  - **targetReuseRatio** – Doel fractie slots uit prefill/history (standaard 0.8).
  - **prefillFetchLimitMax** – Max aantal prefill-kandidaten per slot (standaard 20).

---

## 7. Kort schema

```
createPlanForUser
  → Profile + taal + slot prefs + (opt) therapeutic
  → Idempotentie? → bestaand plan
  → tryReuseMealsFromHistory
      → ≥50% slots uit history? → plan uit history
  → anders: loadPrefilledBySlot (meal_history + custom_meals, gefilterd op avoid/allergies)
  → USE_TEMPLATE_MEAL_GENERATOR?
      → ja: generateTemplatePlan (templates + pools) (+ guardrails/sanity retry)
      → nee: agent.generateMealPlan (Gemini + prefilledBySlot)
  → therapeutic summary in metadata
  → enrichPlan (opt)
  → scaleMealPlanToHousehold (als policy + size)
  → persist + meal history update
```

Dit is de logica van je meal-plan generator zoals die in de code staat.
