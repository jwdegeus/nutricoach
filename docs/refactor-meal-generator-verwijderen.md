# Refactorplan: meal-generator en AI volledig verwijderen

**Context:** De meal-generator werkt niet. Dit plan verwijdert **echt alles**: template generator, Generator v2, én de volledige AI meal planner. Na opruimen kun je opnieuw opbouwen vanaf een schone basis.

---

> **Status: VOLTOOID** (februari 2026) — Alle fases 1–8 zijn uitgevoerd. Meal plans blijft view-only; create/regenerate retourneren `FEATURE_DISABLED`.

---

## Scope: wat gaat eruit?

| Categorie                | Onderdelen                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Template generator**   | Templates, pools, slots, generator-config admin, `templateFallbackGenerator`, `mealPlanGeneratorConfigLoader`, `generatorTuningAdvisor` |
| **Generator v2**         | `/admin/generator-v2`, `meal_plan_generator_settings_v2`, `mealPlanGeneratorDbConfig`                                                   |
| **AI meal planner**      | `MealPlannerAgentService` (generateMealPlan, generateMealPlanDay), Gemini prompts, schema, validate, repair                             |
| **Enrichment**           | `MealPlannerEnrichmentService` (AI meal-verrijking)                                                                                     |
| **Plan chat**            | `PlanChatService` (AI chat voor plans)                                                                                                  |
| **Plan edit (AI-delen)** | `planEdit.apply` (regenerate day, replace meal via AI, enrichment)                                                                      |
| **Guardrails**           | `enforceMealPlannerGuardrails`, guardrails meal-planner adapter                                                                         |
| **Jobs & API**           | `meal_plan_generation_jobs`, cron route, `/api/v1/meal-plans/generate`                                                                  |
| **UI**                   | Generator beheer, Generator v2, GeneratorInzichtPanel, Create plan form, Regenerate knoppen, Jobs UI, Plan chat                         |
| **Overig**               | `candidatePoolSanitizer`, `mealPlannerAgent.tools`, `config/meal-planner.json`, `mealPlans.config`                                      |

---

## Wat blijft (beschouwbaar voor latere rebuild)

| Component                                    | Reden                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `meal_plans` tabel + `meal_plan_runs`        | Bestaande plans blijven viewable; runs-history                                         |
| `meal_plan_runs`                             | Historische log van runs                                                               |
| Meal plan detail-pagina (view-only)          | Tonen van bestaande plans                                                              |
| Shopping list (`MealPlannerShoppingService`) | Bouwt lijst uit plan_snapshot; geen AI. Kan blijven voor view-only of later hergebruik |
| `planReview` (draft apply/cancel)            | Handmatig draft flow; hangt af van guardrails adapter                                  |
| Diet types, `MealPlanResponse` types         | Types blijven; gebruikt door overige modules                                           |
| `getCanonicalIngredientIdsByNevoCodes`       | Utility; verplaatsen naar bv. `ingredients` of `nevo`                                  |

---

## Fase 1: API, cron en jobs uitschakelen

1. **API route verwijderen**
   - Verwijder: `src/app/api/v1/meal-plans/generate/route.ts`
   - Verwijder parent map indien leeg: `src/app/api/v1/meal-plans/`

2. **Cron route**
   - Verwijder of stub: `src/app/api/cron/meal-plan-jobs/route.ts` (geen jobs meer)

3. **generateMealPlan action**
   - Verwijder: `src/app/(app)/menus/actions/generateMealPlan.action.ts`
   - Controleer of `menus` map nog iets anders bevat; zo niet, map verwijderen

---

## Fase 2: Meal plan creation & regeneration stuben of verwijderen

4. **mealPlans.service.ts**
   - `createPlanForUser`: verwijderen of vervangen door stub die `AppError('FEATURE_DISABLED', 'Meal plan generatie is tijdelijk uitgeschakeld.')` gooit
   - `regeneratePlanForUser`: idem
   - Verwijder alle imports van `MealPlannerAgentService`, `loadMealPlanGeneratorDbConfig`, `mealPlanVarietyScorecard`, etc.

5. **mealPlans.actions.ts**
   - `createMealPlanAction`: aanpassen naar stub/error of verwijderen
   - `regenerateMealPlanAction`: idem

6. **mealPlanJobs.actions.ts**
   - Hele bestand afhankelijk van `createPlanForUser`; jobs zijn zinloos zonder generatie
   - Stub alle job-actions (claim, complete, start, list) om direct te returnen of fout te geven
   - Of: verwijder job-gerelateerde actions; laat alleen lege/list stubs als de UI tijdelijk blijft

7. **mealPlanJobSchedule.actions.ts**
   - Stub of verwijder; geen scheduling meer

---

## Fase 3: Admin UI — generator-config en generator-v2

8. **Admin dashboard**
   - Verwijder kaart "Generator beheer" (href `/admin/generator-config`)
   - Verwijder kaart "Generator v2 (diagnostiek)" (href `/admin/generator-v2`)
   - Admin page: verwijder `generatorStats`-queries en alle referenties

9. **Generator-config**
   - Verwijder map: `src/app/(app)/admin/generator-config/` (page, actions, components)

10. **Generator-v2**
    - Verwijder map: `src/app/(app)/admin/generator-v2/`

---

## Fase 4: Meal plans app UI — create, regenerate, jobs, chat

11. **Create meal plan**
    - `src/app/(app)/meal-plans/new/page.tsx` en `CreateMealPlanForm.tsx`: verwijderen of vervangen door "Coming soon" placeholder

12. **Regenerate**
    - `MealPlanActions.tsx` / `MealPlanActionsClient.tsx`: verwijder regenerate-knoppen of disable met melding
    - `MealPlanPageWrapper.tsx`: idem

13. **Jobs**
    - Verwijder of stub: `meal-plans/jobs/` (page, run-due, JobsTableClient, actions)
    - Navigatie: verwijder link naar jobs indien in sidebar

14. **Plan chat**
    - Verwijder: `meal-plans/[planId]/chat/` (page, PlanChatClient, actions)
    - Verwijder chat-link uit plan detail

15. **GeneratorInzichtPanel**
    - Verwijder: `GeneratorInzichtPanel.tsx` en alle gebruik (plan detail page)
    - Verwijder import en render uit `meal-plans/[planId]/page.tsx`

16. **QuickEditBar / plan edit**
    - QuickEditBar en plan edit actions roepen `applyPlanEdit` aan; die gebruikt AI
    - Opties: QuickEditBar volledig verwijderen, of alleen niet-AI edits toestaan (complex)
    - Voor volledige opruiming: QuickEditBar verwijderen of volledig uitschakelen
    - `planEdit.actions.ts`: stub of verwijder
    - `planEdit.apply.ts`: verwijderen (gebruikt MealPlannerAgentService, MealPlannerEnrichmentService)

---

## Fase 5: Agent & lib — volledige meal-planner

17. **Meal planner agent map**
    - Verwijder map: `src/lib/agents/meal-planner/` (gehele map)
    - Bevat o.a.: mealPlannerAgent.service, prompts, schema, validate, repair, tools; planEdit, planChat; enrichment; shopping; enforceMealPlannerGuardrails; mealPlannerDbHealth; mealPlannerDebugLogger; culinaryCoherenceValidator

18. **meal-plans lib**
    - Verwijder: `templateFallbackGenerator.ts`, `mealPlanGeneratorConfigLoader.ts`, `generatorTuningAdvisor.ts`, `candidatePoolSanitizer.ts`
    - Verwijder: `mealPlans.config.ts` (of stub voor eventuele resterende refs)
    - Verwijder: `meal-plan-generator` config map: `src/lib/meal-planner/config/` (mealPlanGeneratorDbConfig.ts)

19. **Guardrails adapter**
    - Verwijder: `src/lib/guardrails-vnext/adapters/meal-planner.ts` (én `.test.ts`)
    - `planReview.actions.ts` gebruikt `mapMealPlanToGuardrailsTargets` — die valt weg
    - Aanpassing nodig: `planReview.actions.ts` — of guardrails-check uitschakelen, of een minimale inline transform schrijven (alleen voor draft validation)
    - **Keuze:** planReview draft-flow tijdelijk uitschakelen (startReview, applyDraft, cancelReview tonen "niet beschikbaar") of guardrails-adapter als enkelvoudige util behouden voor validatie

20. **Config**
    - Verwijder: `config/meal-planner.json`

---

## Fase 6: Afhankelijkheden repareren

21. **Imports fixen**
    - Overal waar `@/src/lib/agents/meal-planner` werd geïmporteerd: verwijderen of vervangen
    - `meal-plans/[planId]/shopping/page.tsx`: gebruikt `MealPlannerShoppingService`
      - **Optie A:** Shopping page verwijderen (geen generatie = misschien geen nieuwe plans)
      - **Optie B:** `MealPlannerShoppingService` uit agent-map halen en als losse util in bv. `meal-plans/shopping.service.ts` zetten (geen AI, alleen berekening)
    - `admin/ingredients/nevo/[id]/page.tsx`: gebruikt `getCanonicalIngredientIdsByNevoCodes` — verplaatsen naar `src/lib/ingredients/` of `nevo/`
    - `addMealToRecipes.actions.ts`: gebruikt `EnrichedMeal` type — type verplaatsen naar `meal-plans` of diets
    - `MealPlanCards.tsx`: gebruikt `MealPlanEnrichmentResponse` — zonder enrichment: toon alleen basis meal data
    - `planReview.actions.ts`: `mapMealPlanToGuardrailsTargets` — zie punt 19

22. **Gemini client**
    - `GEMINI_MODEL_PLAN` in `gemini.client.ts`: kan blijven (ongebruikt) of verwijderen

23. **skim-milk-block.test.ts**
    - Gebruikt `mapMealPlanToGuardrailsTargets` uit meal-planner adapter. Bij verwijderen adapter: test verwijderen of herschrijven met inline meal-plan → targets transform.

24. **Messages**
    - `getShakeSmoothieGuidance`, `getSlotStylePromptLabels` in `messages.server.ts`: alleen voor planner; kunnen weg of lege stub

25. **Inbox notificaties**
    - `meal_plan_generation_failed` in `InboxListClient.tsx`: behouden voor oude notificaties; of filter uit UI als type niet meer voorkomt

26. **Store product links**
    - `storeProductLinks.actions.ts`: check of die meal-planner imports heeft; zonodig aanpassen

---

## Fase 7: Database-migratie

27. **Nieuwe migratie: drop generator- en job-tabellen**

    ```sql
    -- Template generator (v1)
    DROP TABLE IF EXISTS meal_plan_template_slots CASCADE;
    DROP TABLE IF EXISTS meal_plan_templates CASCADE;
    DROP TABLE IF EXISTS meal_plan_pool_items CASCADE;
    DROP TABLE IF EXISTS meal_plan_generator_settings CASCADE;

    -- Generator v2 + variety + culinary
    DROP TABLE IF EXISTS meal_plan_culinary_rules_v1 CASCADE;
    DROP TABLE IF EXISTS meal_plan_variety_targets_v1 CASCADE;
    DROP TABLE IF EXISTS meal_plan_generator_settings_v2 CASCADE;

    -- Jobs (generatie-jobs)
    DROP TABLE IF EXISTS meal_plan_generation_jobs CASCADE;
    ```

    **Let op:** `meal_plans` en `meal_plan_runs` blijven bestaan. Alleen generator-config en jobs verdwijnen.

---

## Fase 8: Documentatie & scripts

28. **Documentatie**
    - Verwijder of archiveer: `docs/meal-plan-generator-v4-db-config-and-gates.md`, `docs/generator-inzicht-transparantie.md`, `docs/meal-planner-how-it-works.md`, `docs/meal-planner-agent.md`, `docs/meal-plan-generator-logic.md`, `docs/meal-generator-wow-handleiding.md`, `docs/guard-rails-as-is.md` (meal-plan delen), `docs/meal-planner-weekmenu-nulmeting.md`, `docs/meal-planner-v3-rebuild-plan.md`, `docs/weekmenu-v2-inventarisatie.md`
    - Of: verplaats naar `docs/archive/` en voeg README toe dat ze historisch zijn

29. **Scripts**
    - Verwijder of archiveer: `scripts/meal-planner-log-report.ts`, `scripts/meal-planner-debug-bundle.ts` (indien aanwezig)

30. **Environment**
    - Verwijder uit `.env.example` / docs: `USE_TEMPLATE_MEAL_GENERATOR`, `MEAL_PLANNER_DB_FIRST`, `ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER`

---

## Bestandenoverzicht (verwijderen)

| Bestand/Map                                                              | Actie                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `src/app/api/v1/meal-plans/`                                             | Verwijderen                                                 |
| `src/app/api/cron/meal-plan-jobs/route.ts`                               | Verwijderen of stub                                         |
| `src/app/(app)/menus/actions/generateMealPlan.action.ts`                 | Verwijderen                                                 |
| `src/app/(app)/menus/`                                                   | Verwijderen indien leeg                                     |
| `src/app/(app)/admin/generator-config/`                                  | Verwijderen                                                 |
| `src/app/(app)/admin/generator-v2/`                                      | Verwijderen                                                 |
| `src/app/(app)/meal-plans/new/`                                          | Verwijderen of stub                                         |
| `src/app/(app)/meal-plans/jobs/`                                         | Verwijderen of stub                                         |
| `src/app/(app)/meal-plans/[planId]/chat/`                                | Verwijderen                                                 |
| `src/app/(app)/meal-plans/[planId]/components/GeneratorInzichtPanel.tsx` | Verwijderen                                                 |
| `src/lib/agents/meal-planner/`                                           | Hele map verwijderen                                        |
| `src/lib/meal-plans/templateFallbackGenerator.ts`                        | Verwijderen                                                 |
| `src/lib/meal-plans/mealPlanGeneratorConfigLoader.ts`                    | Verwijderen                                                 |
| `src/lib/meal-plans/generatorTuningAdvisor.ts`                           | Verwijderen                                                 |
| `src/lib/meal-plans/candidatePoolSanitizer.ts`                           | Verwijderen                                                 |
| `src/lib/meal-plans/mealPlans.config.ts`                                 | Verwijderen of stub                                         |
| `src/lib/meal-planner/config/mealPlanGeneratorDbConfig.ts`               | Verwijderen                                                 |
| `src/lib/guardrails-vnext/adapters/meal-planner.ts`                      | Verwijderen                                                 |
| `src/lib/guardrails-vnext/adapters/meal-planner.test.ts`                 | Verwijderen                                                 |
| `config/meal-planner.json`                                               | Verwijderen                                                 |
| `src/lib/meal-plans/guardrailsExcludeTerms.ts`                           | Verwijderen (alleen voor generator)                         |
| `src/lib/meal-plans/mealPlanSanityValidator.ts`                          | Verwijderen (alleen voor generator)                         |
| `src/lib/meal-plans/mealPlanSanityValidator.test.ts`                     | Verwijderen                                                 |
| `src/lib/guardrails-vnext/skim-milk-block.test.ts`                       | Verwijderen of herschrijven (gebruikt meal-planner adapter) |

---

## Shopping & schedule — speciale aandacht

**ShoppingListView** importeert `ShoppingListResponse`, `MealPlanCoverage` uit `@/src/lib/agents/meal-planner`. Bij verwijderen van die map breekt shopping.

- **Optie A:** `MealPlannerShoppingService` + `mealPlannerShopping.types.ts` + `mealPlannerShopping.schemas.ts` verplaatsen naar `src/lib/meal-plans/shopping.service.ts` (en bijbehorende types). Geen AI; puur berekening uit plan_snapshot.

**meal-plan-schedule-preferences** roept `scheduleNextMealPlanJobAction` aan. Als jobs verdwijnen:

- Stub `scheduleNextMealPlanJobAction` om direct te returnen (of no-op)
- Of: schedule-prefs UI uitschakelen/verbergen voor "volgende weekmenu inplannen"

---

## Bestandenoverzicht (aanpassen)

| Bestand                                                                    | Wijziging                                                                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/app/(app)/admin/components/AdminDashboardClient.tsx`                  | Beide generator-kaarten verwijderen                                               |
| `src/app/(app)/admin/page.tsx`                                             | generatorStats + generator-v2 stats verwijderen                                   |
| `src/lib/meal-plans/mealPlans.service.ts`                                  | createPlanForUser, regeneratePlanForUser stuben of verwijderen; imports opschonen |
| `src/app/(app)/meal-plans/actions/mealPlans.actions.ts`                    | create, regenerate stuben                                                         |
| `src/app/(app)/meal-plans/jobs/actions/mealPlanJobs.actions.ts`            | Stuben of verwijderen                                                             |
| `src/app/(app)/meal-plans/jobs/actions/mealPlanJobSchedule.actions.ts`     | Stuben of verwijderen                                                             |
| `src/app/(app)/meal-plans/[planId]/page.tsx`                               | GeneratorInzichtPanel verwijderen; eventueel chat-link                            |
| `src/app/(app)/meal-plans/[planId]/components/MealPlanActions*.tsx`        | Regenerate uitschakelen                                                           |
| `src/app/(app)/meal-plans/[planId]/actions/planEdit.actions.ts`            | Verwijderen of stub                                                               |
| `src/app/(app)/meal-plans/[planId]/actions/planReview.actions.ts`          | Guardrails-afhankelijkheid aanpassen                                              |
| `src/app/(app)/meal-plans/[planId]/shopping/page.tsx`                      | MealPlannerShoppingService: verplaatsen of shopping tijdelijk uitschakelen        |
| `src/app/(app)/meal-plans/shopping/components/ShoppingListView.tsx`        | Import van meal-planner aanpassen                                                 |
| `src/app/(app)/admin/ingredients/nevo/[id]/page.tsx`                       | getCanonicalIngredientIdsByNevoCodes verplaatsen                                  |
| `src/app/(app)/meal-plans/[planId]/components/MealPlanCards.tsx`           | MealPlanEnrichmentResponse: zonder enrichment, alleen basis data                  |
| `src/app/(app)/meal-plans/[planId]/actions/addMealToRecipes.actions.ts`    | EnrichedMeal type verplaatsen                                                     |
| `src/lib/messages.server.ts`                                               | mealPlanner messages optioneel verwijderen                                        |
| `src/lib/ai/gemini/gemini.client.ts`                                       | GEMINI_MODEL_PLAN optioneel verwijderen                                           |
| `src/app/(app)/settings/actions/meal-plan-schedule-preferences.actions.ts` | `scheduleNextMealPlanJobAction` stubben of schedule UI uitschakelen               |
| `src/lib/nav.ts`                                                           | Links naar new, jobs aanpassen (meal-plans, shopping blijven)                     |
| `src/app/(app)/settings/settings-form.tsx`                                 | Schedule-sectie verbergen of stubben                                              |
| `src/app/(app)/familie/edit/page.tsx`                                      | Meal-plan schedule prefs — check of nog nodig                                     |

---

## Wat expliciet behouden (geen AI/generatie)

- `MealPlanEditabilityService` — gebruikt door mealPlanCalendar; geen generatie
- `meal_plans` tabel, `meal_plan_runs`
- Meal plan list, detail (view), shopping (na verplaatsen shopping service)
- `storeProductLinks.actions`, `shopping-cart.actions`, `mealRating.actions`, `mealPlanCalendar.actions`
- `mealPlanErrorPresenter` — voor bestaande error-codes in metadata; kan vereenvoudigd

---

## Volgorde van uitvoering

1. **Fase 1–2:** API, cron, jobs, create/regenerate stuben — geen actieve generatie meer
2. **Fase 3:** Admin generator UI verwijderen
3. **Fase 4:** Meal plans UI aanpassen (create, jobs, chat, GeneratorInzichtPanel)
4. **Fase 5:** Agent + lib verwijderen
5. **Fase 6:** Import- en afhankelijkheidsreparatie
6. **Fase 7:** Database-migratie
7. **Fase 8:** Documentatie en scripts

---

## Risico’s en aandachtspunten

1. **Bestaande meal plans** — blijven in DB; view-only werking moet overeind blijven
2. **Shopping list** — `MealPlannerShoppingService` is puur berekening; overweeg te verplaatsen i.p.v. verwijderen
3. **planReview (draft flow)** — als die blijft, moet `mapMealPlanToGuardrailsTargets` ergens behouden of vervangen worden
4. **Types (MealPlanResponse, etc.)** — in `diets`; blijven nodig voor bestaande plannen
5. **Notification type** — `meal_plan_generation_failed` kan in oude inbox-items zitten; type niet uit DB verwijderen

---

## Schatting

- **Code:** 40+ bestanden verwijderen of aanpassen
- **Migratie:** 1 nieuw bestand
- **Documentatie:** 8+ docs archiveren of verwijderen
- **Doorlooptijd:** 4–8 uur afhankelijk van afhankelijkheden en tests
