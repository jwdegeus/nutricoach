# Meal Plan Generator v3 — Rebuild Plan (compliance-first)

**Doel:** Ontwerp voor herbouw van de meal plan generator met compliance eerst; hergebruik bestaande bouwblokken, sluit gaps, introduceer v3-pipeline.

**Referenties:**

- [meal-planner-how-it-works.md](./meal-planner-how-it-works.md) — huidige flow, failure modes
- [weekmenu-v2-inventarisatie.md](./weekmenu-v2-inventarisatie.md) — bouwblokken, guardrails, draft

---

## 1) Herbruikbare bouwblokken (bestanden + rol)

### Guardrails vNext (loader / evaluator / adapters)

| Bestand / pad                                          | Rol                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/lib/guardrails-vnext/index.ts`                    | API: `evaluateGuardrails`, `compileConstraintsForAI`, `loadGuardrailsRuleset`, `loadRulesetWithDietLogic`        |
| `src/lib/guardrails-vnext/ruleset-loader.ts`           | Laadt ruleset uit DB (diet_category_constraints, ingredient_category_items, recipe_adaptation_rules, heuristics) |
| `src/lib/guardrails-vnext/evaluator.ts`                | Pure evaluator: targets → GuardDecision (allow/block/warn), sortRules                                            |
| `src/lib/guardrails-vnext/adapters/meal-planner.ts`    | `mapMealPlanToGuardrailsTargets`, `getMealPlanIngredientsPerDay` — plan → evaluator-input                        |
| `src/lib/guardrails-vnext/adapters/plan-chat.ts`       | Plan+edit → targets (draft/apply flow)                                                                           |
| `src/lib/guardrails-vnext/adapters/meal-to-targets.ts` | Single meal → targets (recepten/plan)                                                                            |
| `src/lib/guardrails-vnext/types.ts`                    | GuardRule, GuardrailsRuleset, GuardDecision, EvaluationContext, MatchTarget, etc.                                |

### Jobs / cron / runs / inbox

| Bestand / pad                              | Rol                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `src/app/api/cron/meal-plan-jobs/route.ts` | Cron: claim due jobs, trigger generatie                                                          |
| `src/app/(app)/meal-plans/jobs/`           | UI + actions: job schedule, run-due, `mealPlanJobs.actions.ts`, `mealPlanJobSchedule.actions.ts` |
| `meal_plan_generation_jobs` (DB)           | status, scheduled_for, locked_at, request_snapshot, meal_plan_id                                 |
| `meal_plan_runs` (DB)                      | Observability: run_type, status, duration_ms, error_code per plan                                |
| `src/app/(app)/runs/`                      | RunsTable, listRunsAction                                                                        |
| `src/app/(app)/inbox/`                     | InboxNotifications actions + InboxListClient — notificaties o.a. na job                          |

### Meal history / custom_meals / favorites

| Bestand / pad                                  | Rol                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `src/lib/meal-history/mealHistory.service.ts`  | Kandidaten voor prefill (user, diet_key, slot); scoring                    |
| `src/lib/custom-meals/customMeals.service.ts`  | Custom meals + recipe_ingredients voor ingredientRefs bij prefill          |
| `user_preferences.favorite_meal_ids`           | Favorieten; gebruikt in `loadPrefilledBySlot` / request                    |
| `mealPlans.service.ts` → `loadPrefilledBySlot` | Bouwt prefilledBySlot uit meal_history + custom_meals (+ household filter) |

### Preferences (slot style, weekend override, household, servings)

| Bestand / pad                                                                                      | Rol                                                                          |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `user_preferences`: `preferred_breakfast_style`, `preferred_lunch_style`, `preferred_dinner_style` | Slot style (meal-planner prompt + validatie MEAL_PREFERENCE_MISS)            |
| `user_preferences`: `preferred_weekend_dinner_style`, `weekend_days`                               | Weekend override (getSlotStylePromptLabels / messages)                       |
| `household_avoid_rules` + `user_preferences.household_id`                                          | Huishoudregels; apply-draft guardrails; prefill-filter (hard block)          |
| `households` + servings_policy / household_size                                                    | Servings scaling; `HouseholdServingsClient`, `household-servings.actions.ts` |
| `src/lib/messages.server.ts`                                                                       | getSlotStylePromptLabels(language) voor prompt                               |

### Draft / review / apply flow

| Bestand / pad                                                                | Rol                                                                                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `meal_plans.status`, `draft_plan_snapshot`, `draft_created_at`, `applied_at` | DB: draft vs applied; apply kopieert draft → plan_snapshot                                                     |
| `src/app/(app)/meal-plans/[planId]/actions/planReview.actions.ts`            | startMealPlanReviewAction, applyMealPlanDraftAction, cancelMealPlanReviewAction, updateMealPlanDraftSlotAction |
| Guardrails op apply                                                          | loadGuardrailsRuleset + household_avoid_rules → evaluateGuardrails(draft) → fail-closed bij blocked            |
| `MealPlanDraftBannerClient`                                                  | UI: draft-status, apply/cancel                                                                                 |

---

## 2) Gaps die rebuild oplost (met “waarom”)

- **Prefilled bypass**  
  Prefilled meals worden na `applyPrefilledAndAttachProvenance` niet opnieuw geëvalueerd; ~80% slots komen uit DB. Bij gewijzigd profiel (allergie/dieet) of verkeerd opgeslagen maaltijd kunnen verboden ingrediënten in plan blijven. **Waarom:** compliance moet gelden voor 100% van de slots, niet alleen voor AI-gegenereerde.

- **LLM-hallucinaties (rijst/melk/rauw vlees)**  
  AI kan ingrediënten kiezen of benoemen die niet in de pool zitten of verboden zijn; validatie repareert met retry maar faalt soms; naam/tags/categorie moeten consistent worden toegepast. **Waarom:** één bron van waarheid (constraints + pool) vóór LLM vermindert hallucinaties.

- **Enrichment introduceert onveilige instructies**  
  Enrichment voegt geen ingrediënten toe maar genereert wel instructies; “rauw kipfilet in blender” etc. komt uit de enrichment-AI. **Waarom:** instructies moeten onder step-guardrails vallen en post-scan op onveilige patronen.

- **Excludes alleen op naam**  
  Candidate pool filtert op `excludeTerms` met substring op productnaam; NEVO-items zonder allergie-term in de naam komen toch in de pool. **Waarom:** exclude moet ook op categorie/tags/canonical_id kunnen (guardrails/ingredient_categories).

---

## 3) Nieuwe v3-pipeline (5 fases)

1. **Constraints compile**  
   Profile + guardrails + household → één compiled constraint-set (dieet, allergieën, verboden categorieën, slot/step-regels). Gebruik bestaande `compileConstraintsForAI` + DietRuleSet + household_avoid_rules. Output: machine- en prompt-vriendelijke constraints voor pool + assembler + LLM.

2. **Candidate pool + filtering (guardrails per meal)**  
   Pool bouwen blijft NEVO-gebaseerd, maar filteren niet alleen op excludeTerms-naam: ook guardrails/ingredient_categories toepassen (verboden categorieën, canonical_id). Optioneel: per-slot of per-meal-type filter (bijv. shake/smoothie: geen rauw ei). Output: compliant pool per categorie/slot.

3. **Deterministische assembler**  
   Zoveel mogelijk slots vullen zonder LLM: prefilled (meal_history + custom_meals + favorites) + household/servings/preferences. Alleen prefilled die voldoen aan compiled constraints + guardrails per meal toelaten. Variëteit: geenzelfde meal twee dagen achter elkaar, slot-style. Lege slots blijven voor fase 4. Output: plan-skeleton met gevulde en lege slots.

4. **LLM gap filler (per slot) + guardrails gate**  
   Alleen voor lege slots: kleine, per-slot (of per-dag) LLM-calls met strikte prompt: alleen ingrediënten uit (gefilterde) pool, constraints in prompt, max N ingrediënten. Na elke slot (of batch): guardrails evaluatie op dat meal; bij block: retry of fallback (bijv. ander slot/recept). Geen full-plan LLM meer; minder hallucinatie-oppervlak.

5. **Enrichment safety + post-scan**  
   Enrichment blijft titels/instructies/tijden toevoegen. Nieuw: (a) expliciete veiligheidsregels in enrichment-prompt (geen rauw vlees in blender, geen rauwe eieren in smoothie, kip/vlees altijd verhitten); (b) step-guardrails op gegenereerde instructies; (c) post-scan op onveilige patronen (regex/blocklist); bij violation: instructie herschrijven of weglaten.

---

## 4) Migratie- / databehoeften (alleen bullets)

- Optioneel: **meal_tags / canonical ingredients** — als we exclude/filter op canonical_id willen (naast naam/tags); vereist mapping NEVO → canonical_id of meal_tags in DB.
- Optioneel: **step guardrails target coverage** — uitbreiden ruleset/loader zodat step-regels (bijv. “rauw in blender”) in guardrails zitten; mogelijk recipe_adaptation_rules of nieuwe step-regeltabel.
- Bestaande tabellen volstaan voor v3 (meal_plans, runs, jobs, guardrails, user_preferences, household_avoid_rules, meal_history, custom_meals); geen verplichte nieuwe tabellen voor fase 1–5.

---

## 5) Implementatieplan in 3 slices (A/B/C)

### Slice A — Constraints + pool compliance

- **Scope:** Constraints compile (profile + guardrails + household) als één stap; candidate pool filteren met guardrails (verboden categorieën/canonical) naast excludeTerms op naam.
- **Acceptatiecriteria:**
  - Gecompileerde constraints (tekst + structuur) beschikbaar voor pool + prompt.
  - Pool bevat geen ingrediënten die door guardrails block worden (getest met bestaande rulesets).
  - Geen code in huidige “full-plan LLM”-pad verwijderd; alleen nieuwe stappen vóór LLM.

### Slice B — Deterministische assembler + LLM gap filler

- **Scope:** Assembler: prefilled (meal_history, custom_meals, favorites) + constraints + guardrails per meal; vul alle slots die kunnen zonder LLM; rest “gap”. LLM alleen voor gap-slots, per-slot of per-dag, met guardrails gate na elke slot/batch.
- **Acceptatiecriteria:**
  - Plan met alleen prefilled (waar mogelijk) voldoet 100% aan guardrails.
  - Gap-slots worden gevuld met kleine LLM-calls; elk (batch) resultaat gaat door guardrails; bij block retry of fallback.
  - Prefilled bypass opgeheven: alle slots (prefilled + LLM) zijn geëvalueerd tegen dezelfde constraints.

### Slice C — Enrichment safety + post-scan

- **Scope:** Enrichment-prompt uitbreiden met expliciete veiligheidsregels; step-guardrails (of step-post-scan) op gegenereerde instructies; post-scan op onveilige patronen; bij violation instructie aanpassen of weglaten.
- **Acceptatiecriteria:**
  - Enrichment-prompt bevat vaste veiligheidsregels (rauw vlees/ei in blender, verhitting).
  - Gegenereerde instructies worden gecontroleerd op blocklist/patronen; bij hit wordt instructie gecorrigeerd of niet opgeslagen.
  - Geen nieuwe ingrediënten in enrichment (bestaande validatie blijft).

---

_Document: meal-planner-v3-rebuild-plan — compliance-first; NL, steno._
