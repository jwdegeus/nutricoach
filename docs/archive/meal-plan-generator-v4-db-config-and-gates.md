# Meal-plan generator v4: DB-config en gates

Centraal overzicht van hoe de meal-plan generator beslist en faalt: flow, DB-config tabellen, harde gates, retry en errorcontract. Voor developers en admins die het systeem willen tunen of uitbreiden.

**Belangrijk:** Alle thresholds en doelen komen uit de database (geen hardcoded waarden in runtime). Alleen globale defaults staan in de migratie-seed.

---

## 1. Overzicht flow

```
createPlanForUser (mealPlans.service.ts)
  → Profiel, taal, slot-preferences, (opt) therapeutische doelen
  → Idempotentie / quota
  → loadMealPlanGeneratorDbConfig(supabase, dietKey)   ← DB-config eenmalig
  → [Attempt 1 of 2]
      → tryReuseMealsFromHistory (min_history_reuse_ratio, recency_window_days)
          → voldoende slots uit history? → plan uit history
      → anders: loadPrefilledBySlot + generateMealPlan (template of Gemini)
          → post-processing: Culinary → DB coverage → AI budget → Sanity
      → therapeutic summary, enrichPlan, scaleMealPlanToHousehold
      → buildMealPlanVarietyScorecard + throwIfVarietyTargetsNotMet   ← Variety-gate
      → persist, meal history, run status
  → Bij MEAL_PLAN_VARIETY_TARGETS_NOT_MET: retry (attempt 2, zonder history, met variety in prompt)
```

- **History:** Hergebruik uit meal_history indien genoeg slots voldoen (ratio + recency uit DB).
- **Template vs Gemini:** Bepaald door `USE_TEMPLATE_MEAL_GENERATOR`; beide paden gebruiken dezelfde DB-config voor caps en regels.
- **Post-processing:** Na generatie volgen de gates in vaste volgorde (zie sectie 3).

---

## 2. DB-config tabellen

Waarden zijn **DB-managed**; één actieve rij per `diet_key` (of `diet_key IS NULL` = globaal default). RLS: authenticated mag actieve rijen lezen, alleen admin mag schrijven.

| Tabel                             | Doel                                                     |
| --------------------------------- | -------------------------------------------------------- |
| `meal_plan_generator_settings_v2` | Thresholds: reuse, prefill, recency, AI-cap, DB-coverage |
| `meal_plan_variety_targets_v1`    | Variatiedoelen: groente/fruit/proteïne/herhaling         |
| `meal_plan_culinary_rules_v1`     | Culinaire coherentie: block/warn per slot_type           |

### 2.1 meal_plan_generator_settings_v2

| Kolom                           | Type        | Semantiek                                                | Default (seed) |
| ------------------------------- | ----------- | -------------------------------------------------------- | -------------- |
| diet_key                        | TEXT NULL   | Dieet-specifiek of NULL = globaal                        | NULL           |
| min_history_reuse_ratio         | NUMERIC 0–1 | Min. fractie slots uit history om reuse te accepteren    | 0.2            |
| target_prefill_ratio            | NUMERIC 0–1 | Doel fractie slots uit prefill (intern gebruik)          | 0.7            |
| recency_window_days             | INT ≥ 0     | Recency voor history (0 = geen recency-filter)           | 90             |
| max_ai_generated_slots_per_week | INT ≥ 0     | Max. AI-gegenereerde slots per plan (cap over hele plan) | 14             |
| min_db_recipe_coverage_ratio    | NUMERIC 0–1 | Min. fractie slots met provenance uit DB-recept          | 0.5            |
| is_active                       | BOOLEAN     | Alleen actieve rij wordt geladen                         | true           |

- Unieke index: maximaal één actieve rij per `diet_key` (inclusief NULL).

### 2.2 meal_plan_variety_targets_v1

| Kolom                              | Type        | Semantiek                                     | Default (seed) |
| ---------------------------------- | ----------- | --------------------------------------------- | -------------- |
| diet_key                           | TEXT NULL   | Dieet-specifiek of NULL = globaal             | NULL           |
| unique_veg_min                     | INT ≥ 0     | Min. unieke groentesoorten in plan            | 5              |
| unique_fruit_min                   | INT ≥ 0     | Min. unieke fruitsoorten                      | 3              |
| protein_rotation_min_categories    | INT ≥ 0     | Min. eiwitcategorieën in rotatie              | 3              |
| max_repeat_same_recipe_within_days | INT ≥ 0     | Zelfde recept niet vaker binnen N dagen       | 7              |
| favorites_repeat_boost             | NUMERIC ≥ 0 | Multiplier voor favorieten-herhaling (intern) | 1.0            |
| is_active                          | BOOLEAN     | Alleen actieve rij                            | true           |

### 2.3 meal_plan_culinary_rules_v1

| Kolom       | Type                                              | Semantiek                                                              |
| ----------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| rule_code   | TEXT UNIQUE                                       | Unieke code (bijv. smoothie_no_egg)                                    |
| slot_type   | breakfast \| lunch \| dinner \| snack \| smoothie | Waar de regel geldt                                                    |
| match_mode  | term \| regex                                     | Zoekmodus op maaltijdnaam/omschrijving                                 |
| match_value | TEXT                                              | Term of regex                                                          |
| action      | block \| warn                                     | block = gooi plan af (MEAL_PLAN_CULINARY_VIOLATION), warn = log alleen |
| reason_code | TEXT                                              | Reden voor logging/diagnostics                                         |
| priority    | INT ≥ 0                                           | Hoger = eerder toegepast (DESC)                                        |
| is_active   | BOOLEAN                                           | Alleen actieve regels                                                  |

- Seed: o.a. smoothie geen ei, geen bakken/frituren in smoothie.

**Code:** Migratie: `supabase/migrations/20260209090000_meal_plan_generator_db_config.sql`. Loader: `src/lib/meal-planner/config/mealPlanGeneratorDbConfig.ts` → `loadMealPlanGeneratorDbConfig(supabase, dietKey?)`.

---

## 3. Gates (harde regels), volgorde

Na het vullen van het plan (template of Gemini) worden deze controles in onderstaande volgorde uitgevoerd. Bij falen: `AppError` met de genoemde code; geen persist.

| #   | Gate                   | Errorcode                         | Waar                                                                                            |
| --- | ---------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | **Culinary coherence** | MEAL_PLAN_CULINARY_VIOLATION      | Regels met `action = 'block'`; term/regex + slot_type (smoothie afgeleid waar van toepassing).  |
| 2   | **AI-budget cap**      | MEAL_PLAN_AI_BUDGET_EXCEEDED      | Aantal slots met AI-provenance ≤ maxAiSlotsForPlan (min van DB-setting en totalSlots).          |
| 3   | **DB-coverage ratio**  | MEAL_PLAN_DB_COVERAGE_TOO_LOW     | (Slots met reusedRecipe) / totalSlots ≥ minDbRecipeCoverageRatio.                               |
| 4   | **Sanity check**       | MEAL_PLAN_SANITY_FAILED           | Alleen template-pad: validatie tegen basisregels.                                               |
| 5   | **Variety targets**    | MEAL_PLAN_VARIETY_TARGETS_NOT_MET | Scorecard (uniqueVeg, uniqueFruit, proteinRotatie, maxRepeat) vs. varietyTargets; vóór persist. |

- **Culinary:** `src/lib/agents/meal-planner/validators/culinaryCoherenceValidator.ts` → `validateCulinaryCoherence(plan, culinaryRules)`.
- **AI / DB / Sanity:** `src/lib/agents/meal-planner/mealPlannerAgent.service.ts` (throwIfAiBudgetExceeded, throwIfDbCoverageTooLow, throwIfSanityFailed).
- **Variety:** `src/lib/meal-planner/metrics/mealPlanVarietyScorecard.ts` → `buildMealPlanVarietyScorecard`, `throwIfVarietyTargetsNotMet`; aangeroepen in `mealPlans.service.ts` vóór insert.

---

## 4. Retry bij variety-fail

- **Trigger:** Alleen bij `MEAL_PLAN_VARIETY_TARGETS_NOT_MET` tijdens attempt 1.
- **Gedrag:** Geen tweede run van history-reuse; direct generatie met dezelfde caps, en **varietyTargetsForPrompt** meegegeven zodat de prompt expliciete variatie-eisen bevat (“VARIETY HARD REQUIREMENTS”).
- **Logging:** `attempt: 2`, `retryReason: 'variety_targets_not_met'` (o.a. voor diagnostics); niet als gebruikerszichtbare tekst.
- **Code:** `mealPlans.service.ts` – loop `for (let attempt = 1; attempt <= 2; attempt++)`, catch op variety → `continue retryLoop`.

---

## 5. Errorcontract

Fouten van `createPlanForUser` worden via één helper naar een vast contract omgezet (geen PII in diagnostics).

### 5.1 Response-vorm (na mapping)

| Veld            | Type                      | Beschrijving                                                                                                               |
| --------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| code            | AppErrorCode \| 'UNKNOWN' | Foutcode.                                                                                                                  |
| userMessageNl   | string                    | Korte NL-gebruikerstekst.                                                                                                  |
| userActionHints | string[]                  | Max. 3 concrete vervolgstappen.                                                                                            |
| diagnostics?    | Record<string, unknown>   | Optioneel; alleen safe keys (counts, ratios, rule_code, slot_type, attempt, retryReason). Nooit cause/stack/maaltijdnamen. |

- **Onbekende fout:** `code: 'UNKNOWN'`, generieke NL-boodschap + hints.

### 5.2 Meal-plan specifieke codes + boodschap/hints (kort)

| Code                              | userMessageNl (kern)                       | userActionHints (richting)                                         |
| --------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| MEAL_PLAN_VARIETY_TARGETS_NOT_MET | Menu voldoet niet aan variatiedoelen.      | Meer recepten; variatie in beheer; opnieuw proberen.               |
| MEAL_PLAN_CULINARY_VIOLATION      | Culinaire mismatch (bijv. smoothie).       | Opnieuw; culinaire regels in beheer.                               |
| MEAL_PLAN_DB_COVERAGE_TOO_LOW     | Te weinig recepten uit eigen database.     | Meer recepten; ratio in beheer verlagen.                           |
| MEAL_PLAN_AI_BUDGET_EXCEEDED      | Te veel AI-gegenereerde maaltijden.        | Meer recepten; max AI-slots (beheer).                              |
| MEAL_PLAN_INSUFFICIENT_CANDIDATES | Niet genoeg recepten om plan te vullen.    | Meer recepten; generatorinstellingen (beheer).                     |
| MEAL_PLAN_CONFIG_INVALID          | Generatorconfiguratie ongeldig/ontbreekt.  | Beheerinstellingen controleren (templates, pools, variatiedoelen). |
| MEAL_PLAN_SANITY_FAILED           | Menu voldoet niet aan kwaliteitscontroles. | Opnieuw; voorkeuren/dieet controleren.                             |

- **Diagnostics:** Alleen numerieke waarden, ratios, rule_codes, slot_type, attempt/retryReason; nooit `cause` of gebruikersinhoud. In de UI alleen voor admins (of toekomstige debug-flag); zie sectie 6.

**Code:** `src/lib/meal-plans/mealPlanErrorPresenter.ts` → `presentMealPlanError(error)`. Gebruikt in `src/app/(app)/meal-plans/actions/mealPlans.actions.ts` (createMealPlanAction catch). UI: `src/app/(app)/meal-plans/new/components/CreateMealPlanForm.tsx` – callout met message/hints, optioneel `<details>` voor diagnostics (admin).

---

## 6. Tuning playbook

Korte richtlijnen: “Als je vaak X ziet, pas dan Y aan.”

- **MEAL_PLAN_VARIETY_TARGETS_NOT_MET** → Verlaag in `meal_plan_variety_targets_v1` o.a. `unique_veg_min` / `unique_fruit_min` / `protein_rotation_min_categories`, of verhoog `max_repeat_same_recipe_within_days`; of zorg voor meer (gevarieerde) recepten in de pool.
- **MEAL_PLAN_CULINARY_VIOLATION** → Pas in `meal_plan_culinary_rules_v1` regels aan (match_value, slot_type) of zet `action` op `warn` om alleen te loggen.
- **MEAL_PLAN_DB_COVERAGE_TOO_LOW** → Verlaag `min_db_recipe_coverage_ratio` in `meal_plan_generator_settings_v2`, of vergroot de receptenpool/prefill.
- **MEAL_PLAN_AI_BUDGET_EXCEEDED** → Verhoog `max_ai_generated_slots_per_week` in settings_v2, of vergroot prefill/hergebruik zodat minder AI-slots nodig zijn.
- **MEAL_PLAN_INSUFFICIENT_CANDIDATES** → Meer recepten toevoegen; of target_prefill_ratio/min_history_reuse_ratio aanpassen (loader gebruikt deze waarden).
- **MEAL_PLAN_CONFIG_INVALID** → Zorg voor minimaal één actieve globale default voor settings_v2 en variety_targets_v1; controleer RLS en dat loader de juiste kolommen opvraagt.

---

## 6.1 Indicatie: minimaal aantal recepten/maaltijden per slot (ontbijt, lunch, diner)

De DB-coverage gate vereist dat een minimum percentage van de slots uit je eigen database komt (prefill: **meal_history** + **custom_meals**, per slot). Onderstaande aantallen zijn een **richtlijn**; in de praktijk kunnen allergieën, household avoid-rules en validatie ervoor zorgen dat niet alle kandidaten gebruikt worden. Zorg dus voor een kleine marge.

| Planlengte | Totaal slots | Min. uit DB (ratio 0,5) | Indicatie min. per slot (ontbijt / lunch / diner) |
| ---------- | ------------ | ----------------------- | ------------------------------------------------- |
| 2 dagen    | 6            | 3                       | **2** per soort (6 totaal)                        |
| 3 dagen    | 9            | 5                       | **2–3** per soort (6–9 totaal)                    |
| 7 dagen    | 21           | 11                      | **4** per soort (12 totaal)                       |

- **Per soort** = per slot: ontbijt, lunch, diner. Maaltijden in meal_history of custom_meals moeten het juiste `meal_slot` hebben.
- **meal_history** wordt gevuld door eerder gegenereerde weekmenu’s (en beoordelingen); **custom_meals** zijn door jou aangemaakte recepten/maaltijden. Beide tellen mee voor prefill.
- Als je vaak **MEAL_PLAN_DB_COVERAGE_TOO_LOW** ziet: voeg per slot meer recepten/maaltijden toe, of verlaag tijdelijk `min_db_recipe_coverage_ratio` in beheer (zie sectie 2.1).

---

## 7. Backwards compatibility

- **Template-pad:** Ongewijzigd waar geen DB-config wordt gebruikt; caps en culinaire/variety-gates zijn alleen actief wanneer de service/agent de opties uit de loader meegeeft.
- **Gemini-pad:** Zelfde DB-config (maxAiSlotsForPlan, minDbRecipeCoverageRatio, culinaryRules, varietyTargetsForPrompt bij retry); geen wijziging in prompt-structuur behalve de optionele variety “hard requirements”-tekst bij attempt 2.
- **Caps:** AI-budget en DB-coverage worden alleen gecontroleerd als de opties aan `generateMealPlan` worden meegegeven; bestaande aanroepers zonder deze opties gedragen zich als voorheen (geen extra throw).

---

## 8. Code-verwijzingen (paden)

| Onderdeel                           | Pad                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Migratie DB-config                  | `supabase/migrations/20260209090000_meal_plan_generator_db_config.sql` |
| Loader                              | `src/lib/meal-planner/config/mealPlanGeneratorDbConfig.ts`             |
| Culinaire validator                 | `src/lib/agents/meal-planner/validators/culinaryCoherenceValidator.ts` |
| Variety scorecard + enforcement     | `src/lib/meal-planner/metrics/mealPlanVarietyScorecard.ts`             |
| Agent (gates: AI, DB, sanity)       | `src/lib/agents/meal-planner/mealPlannerAgent.service.ts`              |
| Service (flow, retry, variety-gate) | `src/lib/meal-plans/mealPlans.service.ts`                              |
| Error presenter                     | `src/lib/meal-plans/mealPlanErrorPresenter.ts`                         |
| Action (create + error mapping)     | `src/app/(app)/meal-plans/actions/mealPlans.actions.ts`                |
| UI callout (hints + diagnostics)    | `src/app/(app)/meal-plans/new/components/CreateMealPlanForm.tsx`       |

---

## 9. Prompt- en contractnotities

- **Candidate pool = ingrediënten:** In de Gemini-prompt wordt alleen een **ingrediëntenpool** (NEVO-codes) aangeboden. De agent componeert maaltijden uit die ingrediënten. “Recepten eerst uit mijn database” wordt gerealiseerd via **prefill** (loadPrefilledBySlot) en **history reuse** (tryReuseMealsFromHistory); prefill wordt server-side toegepast (applyPrefilledAndAttachProvenance), niet in de prompt. Recipe-level candidates in de prompt zouden een latere uitbreiding zijn.
- **Variatie:** De **bron van waarheid** voor variatie is de server-side scorecard (buildMealPlanVarietyScorecard + throwIfVarietyTargetsNotMet). De prompt bevat variatie-richtlijnen (o.a. “avoid repeating same/similar meal name on consecutive days”); die zijn sturend, geen vervanging van de scorecard.
- **Bereidingsinstructies:** Het huidige prompt/schema-contract vraagt geen **steps/instructions** per maaltijd. Als productie-eis is “minimaal bereidingsinstructies”, dan is een aparte keuze nodig: schema uitbreiden met steps + prompt aanpassen (+ evt. enrichment), of instructies alleen via enrichment laten toevoegen.

Geen secrets of PII in dit document.
