# Nulmeting Weekmenu Generator — Inventarisatie + UI-audit

**Doel:** Complete nulmeting van de Weekmenu/Generator flow (UI + data + actions) als basis voor opruimen en correct herbouwen.

**Scope:** Alleen inventarisatie + documentatie. Geen UI refactor, geen styling/functional changes, geen DB/policy wijzigingen.

---

## 1) Entry points

| Route                                  | Bestand                                               | Rol                                                                                                                                                                                                                            |
| -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Weekmenu's (lijst)**                 | `src/app/(app)/meal-plans/page.tsx`                   | Server: auth, `listMealPlansAction(50)`, error state inline; render `MealPlansTable` + link "Nieuw weekmenu".                                                                                                                  |
| **Weekmenu detail (Generator-pagina)** | `src/app/(app)/meal-plans/[planId]/page.tsx`          | Server: auth, `loadMealPlanAction(planId)`, notFound bij !ok; extra queries (cron job, diet type, NEVO-namen). Render: heading "Weekmenu", metadata-badges, `MealPlanSummary`, `MealPlanActionsClient`, `MealPlanPageWrapper`. |
| **Nieuw weekmenu**                     | `src/app/(app)/meal-plans/new/page.tsx`               | Server: auth; render `CreateMealPlanForm` (create → redirect naar `/meal-plans/[planId]`).                                                                                                                                     |
| **Weekmenu Jobs**                      | `src/app/(app)/meal-plans/jobs/page.tsx`              | Lijst geplande/uitgevoerde jobs; niet de primaire "Generator" UX.                                                                                                                                                              |
| **Chat (per plan)**                    | `src/app/(app)/meal-plans/[planId]/chat/page.tsx`     | Nested route; chat voor aanpassingen.                                                                                                                                                                                          |
| **Shopping (per plan)**                | `src/app/(app)/meal-plans/[planId]/shopping/page.tsx` | Boodschappen; buiten scope Generator-UI.                                                                                                                                                                                       |

**Primaire Generator-pagina:** `meal-plans/[planId]/page.tsx` (Weekmenu detail).

---

## 2) UI-component tree (Weekmenu detail)

```
[planId]/page.tsx (Server)
├── MealPlanDraftBannerClient (als status === 'draft')
├── div (heading + metadata)
│   ├── Heading "Weekmenu"
│   ├── Text "Plan ID: …"
│   ├── MealPlanProvenance
│   ├── Badges: Hergebruikt / Nieuw / Reuse % (provenance)
│   ├── Badges: Huishouden / Porties: geschaald|recept (servings)
│   ├── Badges: Weekend Diner + dagen (slotPrefs)
│   └── Badges: Guardrails / Constraints: ja|nee / hash / v:
├── grid 2 kolommen
│   ├── MealPlanSummary → "Plan Overzicht" card
│   └── MealPlanActionsClient → "Acties" card
└── MealPlanPageWrapper
    ├── [bij guardrails violation] GuardrailsViolationEmptyState
    └── [anders] MealPlanPageClient
        └── MealPlanCards
            ├── Heading "Maaltijden"
            └── per day: day header + QuickEditBar, grid van MealCard
                └── MealCard: slot, titel, tijd, summary, macros, MealRating, Wissel/Verwijder
                    ├── MealDetailDialog (klik op card)
                    └── Swap-dialog (draft: vervang maaltijd form)
```

**Bestandsnamen (relevante componenten):**

- `[planId]/page.tsx` — page (server)
- `MealPlanSummary.tsx` — Plan Overzicht (client)
- `MealPlanActionsClient.tsx` — wrapper voor Acties (client, anti-hydration)
- `MealPlanActions.tsx` — Acties-paneel (client)
- `MealPlanPageWrapper.tsx` — guardrails state + MealPlanPageClient (client)
- `MealPlanPageClient.tsx` — thin wrapper → MealPlanCards (client)
- `MealPlanCards.tsx` — dagen + MealCard grid (client)
- `MealCard.tsx` — één maaltijd + Wissel/Verwijder + dialogs (client)
- `QuickEditBar.tsx` — Tussendoortje / Regenereren per dag (client)
- `MealRating.tsx` — sterren 1–5 (client)
- `MealDetailDialog.tsx` — detail + "Toevoegen aan recepten" (client)
- `MealPlanDraftBannerClient.tsx` — draft: Pas toe / Annuleren (client)
- `MealPlanProvenance.tsx` — "Aangemaakt door: Cron job" + link (server)
- `GuardrailsViolationEmptyState.tsx` — lege staat bij guardrails violation (client)

---

## 3) Data contract

**Server action voor laden:** `loadMealPlanAction(planId)` in `meal-plans/actions/mealPlans.actions.ts`. Roept `MealPlansService.loadPlanForUser(userId, planId)`.

**Service:** `src/lib/meal-plans/mealPlans.service.ts` gebruikt expliciete kolommen (geen `SELECT *`):

- **Detail:** `MEAL_PLAN_DETAIL_COLUMNS` =  
  `id,user_id,diet_key,date_from,days,request_snapshot,rules_snapshot,plan_snapshot,enrichment_snapshot,status,draft_plan_snapshot,draft_created_at,applied_at,created_at,updated_at`
- **Lijst:** `MEAL_PLAN_LIST_COLUMNS` = zelfde set (compatibel met `MealPlanRecord`).

**Return type:** `MealPlanRecord` (`mealPlans.types.ts`): o.a. `id`, `userId`, `dietKey`, `dateFrom`, `days`, `requestSnapshot`, `rulesSnapshot`, `planSnapshot`, `enrichmentSnapshot`, `status`, `draftPlanSnapshot`, `draftCreatedAt`, `appliedAt`, `createdAt`, `updatedAt`. Snapshot-velden zijn getypt (MealPlanRequest, MealPlanResponse, MealPlanEnrichmentResponse).

**Extra data op de pagina:**  
Pagina doet zelf nog: `meal_plan_generation_jobs` (select `id`) voor provenance; `user_diet_profiles` + `diet_types` voor dieetnaam; `getNevoFoodByCode` per NEVO-code uit `planSnapshot` → `nevoFoodNamesByCode` (Record) naar client.

---

## 4) Guardrails / Constraints: ja / hash / v:1

**Herkomst:**  
Guardrails-metadata komt uit het **plan snapshot**, niet uit een aparte loader op de pagina. Bij generatie/regeneratie schrijft `MealPlansService` (via agent) in het plan-JSON `metadata.guardrails`: `constraintsInPrompt`, `contentHash`, `version`. Die worden ook naar `meal_plan_runs` weggeschreven voor observability.

**In de UI:**  
In `[planId]/page.tsx` wordt `currentSnapshot` gebruikt (draft heeft voorrang als `status === 'draft'`). Uit `currentSnapshot.metadata.guardrails`:

- `constraintsInPrompt` → badge "Constraints: ja" of "nee"
- `contentHash` → "hash: …" (eerste 8 tekens)
- `version` → "v: …" (eerste 12 tekens)

**Evaluator:**  
Guardrails worden geëvalueerd o.a. in:

- `planReview.actions.ts`: `startMealPlanReviewAction`, `applyMealPlanDraftAction`, `updateMealPlanDraftSlotAction` — roepen `loadGuardrailsRuleset` + `evaluateGuardrails` + `mapMealPlanToGuardrailsTargets`.
- Agent: `mealPlannerAgent.service.ts` (enforceVNextMealPlannerGuardrails).

Bij violation: acties returnen `GUARDRAILS_VIOLATION` met `details` (reasonCodes, contentHash, rulesetVersion, optioneel forceDeficits). `MealPlanActions` geeft dit door via callback → `MealPlanActionsClient` dispatcht custom events → `MealPlanPageWrapper` toont `GuardrailsViolationEmptyState` in plaats van de meal cards.

---

## 5) Acties — waar zitten handlers, optimistic/refresh

| Actie                                 | Handler                                                                                              | Optimistic / refresh                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Start review**                      | `MealPlanActions.handleStartReview` → `startMealPlanReviewAction`                                    | Geen optimistic; bij ok: `router.refresh()`.                                                                             |
| **Pas draft toe**                     | `MealPlanActions.handleApplyDraft` → `applyMealPlanDraftAction`                                      | Geen optimistic; bij ok: `router.refresh()`.                                                                             |
| **Regenereren volledig plan**         | `MealPlanActions.handleRegenerateFull` → `regenerateMealPlanAction`                                  | Geen optimistic; bij ok: `router.refresh()` + `router.push(…/shopping)`.                                                 |
| **Regenereren dag**                   | `MealPlanActions.handleRegenerateDay` → `regenerateMealPlanAction({ planId, onlyDate })`             | Listbox "Selecteer datum" + knop; bij ok: `router.refresh()`.                                                            |
| **Verwijderen (plan)**                | `MealPlanActions.handleDelete` → `deleteMealPlanAction`                                              | ConfirmDialog; bij ok: custom event `meal-plan-changed`, `router.push('/meal-plans')`, `router.refresh()`.               |
| **Wissel (niet-draft)**               | `MealCard.handleSwap` → `applyDirectPlanEditAction` met `REPLACE_MEAL`                               | Geen optimistic; edit draait async (run); comment zegt "status indicator will handle it" — geen directe refresh in card. |
| **Wissel (draft)**                    | `MealCard`: open swap-dialog → `updateMealPlanDraftSlotAction`                                       | Bij ok: `setShowSwapDialog(false)`, `router.refresh()`.                                                                  |
| **Verwijder (per meal)**              | `MealCard.handleRemove` (dubbelklik: eerst Bevestig) → `applyDirectPlanEditAction` met `REMOVE_MEAL` | Geen optimistic; async run; geen refresh in card.                                                                        |
| **Tussendoortje / Regenereren (dag)** | `QuickEditBar` → `applyDirectPlanEditAction` (`ADD_SNACK`, `REGENERATE_DAY`)                         | Geen optimistic; async run.                                                                                              |

**Conclusie:** Geen echte optimistic updates; na plan-level acties wordt `router.refresh()` gebruikt. Per-meal Wissel/Verwijder en QuickEditBar vertrouwen op "status indicator" / achtergrond-run; er is geen duidelijke globale "running edits" indicator op de pagina die de gebruiker vertelt dat hij moet verversen.

---

## 6) States — wat bestaat, wat ontbreekt

**Bestaat:**

- **Loading (deel):** `MealPlanActionsClient` toont skeleton (pulse placeholders) tot `mounted === true` (anti-hydration).
- **Error (acties):** `MealPlanActions` toont inline error block (rood) bij fout van Start review / Pas toe / Regenereren / Verwijderen; guardrails violation → "Draft schendt dieetregels" + message.
- **Error (meal card):** `MealCard` toont `error` onder Wissel/Verwijder; swap-dialog toont `swapError` / guardrails.
- **Empty (guardrails):** Bij guardrails violation toont `MealPlanPageWrapper` alleen `GuardrailsViolationEmptyState` (geen meal cards).
- **Draft:** Banner via `MealPlanDraftBannerClient`; Acties-paneel toont "Pas draft toe" i.p.v. "Start review".
- **MealRating:** Eigen loading (skeleton sterren), submitten state, error onder sterren.

**Ontbreekt / zwak:**

- **Pagina-loading:** Geen `loading.tsx` voor `meal-plans` of `meal-plans/[planId]`; bij trage `loadMealPlanAction` geen fallback UI.
- **Lege plan:** Geen expliciete "Geen maaltijden" state als `plan.days` leeg of alle dagen 0 meals.
- **Success feedback:** Na "Pas draft toe" / "Start review" / Regenereren alleen full refresh; geen toast (projectregel is wel: gebruik `useToast()` voor success/error).
- **Running edits:** Geen zichtbare indicator dat een Wissel/Verwijder/Regenereren-dag nog loopt; gebruiker weet niet of hij moet verversen.

---

## 7) UI-problemen (concreet)

- **Metadata-badges (boven aan pagina):** Veel badges naast elkaar: Hergebruikt, Nieuw, Reuse %, Huishouden, Porties: geschaald/recept, Weekend, Guardrails, Constraints: ja/nee, hash, v:. Dit voelt als ruis en onduidelijke hiërarchie; "Constraints: ja" en "hash/v" zijn vooral technisch.
- **Card layout/typografie:** Plan Overzicht en Acties zijn twee grote witte cards (shadow-xs, ring); veel tekst (o.a. uitleg onder knoppen). Plan Overzicht toont ook "Enrichment beschikbaar" / "Enrichment nog niet beschikbaar" — kan visueel rustiger.
- **Ratings/sterren:** `MealRating` op elke MealCard; geen duidelijke uitleg wat de sterren betekenen (hergebruik? smaak?); neemt ruimte in.
- **Acties-paneel:** Datum voor "Regenereren dag" is een Listbox met lange datumstrings (weekday + long month); knop ernaast heeft alleen icoon (Calendar) — geen label "Regenereren dag". Affordance onduidelijk.
- **Meal cards:** Wissel en Verwijder naast elkaar; Verwijder vereist twee klikken (Verwijder → Bevestig). In draft: eerste knop heet "Swap" (EN), tweede "Verwijder" — inconsistentie (rest UI NL).
- **Porties:** Pagina toont "Porties: geschaald" of "Porties: recept" in metadata; in `MealDetailDialog` staat "Porties" en "Voedingswaarden (geschat)" — geen eenduidige "Porties: geschat" op de kaart zelf; wel geschatte macros op card.
- **Hardcoded palette:** `MealPlanSummary` en `MealPlanActions` gebruiken o.a. `bg-white`, `ring-zinc-950/5`; niet overal semantic tokens (bg-background, border-border, etc.).

---

## 8) Conclusie — Keep / Remove / Refactor / Missing

**Keep**

- Expliciete kolommen voor meal_plans (geen `SELECT *`) in service en actions.
- Scheiding Server (page, loadMealPlanAction) vs Client (Acties, Cards, Guardrails state).
- Guardrails violation flow (actie retour → custom events → GuardrailsViolationEmptyState).
- Plan Overzicht-informatie (periode, dagen, dieet, totaal maaltijden, macros, enrichment status).
- Acties: Start review, Pas draft toe, Regenereren volledig/dag, Verwijderen, Wissel/Verwijder per meal, QuickEditBar (Tussendoortje, Regenereren dag).
- MealDetailDialog en swap-dialog (draft) voor maaltijd-detail en vervangen.
- MealPlanDraftBannerClient voor draft-status.
- RLS-first en minimale kolommen in relevante actions.

**Remove**

- Overmatige metadata-badges boven aan (of drastisch terugbrengen): hash, v:, eventueel "Reuse %" en dubbele Guardrails/Constraints als ze geen duidelijke gebruikerswaarde hebben.
- Redundante uitlegtekst onder knoppen waar een tooltip of korte label volstaat.
- "Swap" (EN) op MealCard in draft — vervangen door "Wissel" voor consistentie.

**Refactor**

- Metadata-sectie: één compact blok (bijv. "Opties" of "Details") met duidelijke hiërarchie; technische guardrails (hash, v) verplaatsen naar dev/debug of weglaten.
- Acties-paneel: datum-picker duidelijker labelen ("Regenereren dag" bij de knop); overweeg kortere datumweergave in listbox.
- Meal cards: eenduidige primary/secondary voor Wissel vs Verwijder; overweeg Verwijder als danger/secondary.
- Plan Overzicht + Acties: semantic tokens (bg-background, border-border, text-muted-foreground) i.p.v. hardcoded white/zinc.
- Na succesvolle acties: `showToast({ type: 'success', title: … })` i.p.v. alleen refresh (conform projectregel).
- MealRating: of duidelijke label/uitleg toevoegen, of verplaatsen naar detail/minder prominent.

**Missing (voor gewenste UI)**

- `loading.tsx` voor `meal-plans` en `meal-plans/[planId]`.
- Expliciete empty state als plan geen maaltijden heeft.
- Globale "Bezig met aanpassen…" / running-edits indicator na Wissel/Verwijder/Regenereren-dag (of duidelijke instructie om te verversen).
- Success toasts na Start review, Pas draft toe, Regenereren, Verwijderen.
- Optioneel: betere error boundary of foutweergave als `loadMealPlanAction` faalt (nu notFound of redirect).

---

## 9) Recipe-first generator (toekomst) – Inventarisatie

**Doel:** Nulmeting voor een toekomstige recipe-first weekmenu-generator (recepten eerst, template/Gemini alleen als fallback). Alleen inventarisatie + contract-typen; geen nieuwe tabellen, geen gedragswijziging.

### 9.1 Bronnen voor “recepten”

| Bron                 | Tabel(s)             | Rol                                                                                                                                                                                            |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User recipes**     | `custom_meals`       | Recepten van de gebruiker (foto/import/meal_plan). `id` = recipe_id; `meal_slot`, `meal_data` (JSONB), `total_minutes`, `servings`, `diet_key` (nullable), `consumption_count`, `source_type`. |
| **Historical meals** | `meal_history`       | Maaltijden uit eerdere weekmenu’s; hergebruik. `meal_id`, `meal_name`, `meal_slot`, `diet_key`, `meal_data`, `user_rating`, `combined_score`, `last_used_at`.                                  |
| **Ingrediënten**     | `recipe_ingredients` | Koppeling aan `custom_meals.id`; `nevo_food_id`, `quantity`, `unit`, `name`. Gebruikt om `meal_data.ingredientRefs` aan te vullen als die leeg zijn (geïmporteerde recepten).                  |

Er is **geen aparte `recipes`-tabel**; “recept” = een rij in `custom_meals` of een opgeslagen maaltijd in `meal_history`. Receptenlijst in de app komt uit `custom_meals` (o.a. `meal-list.actions.ts`); prefill voor de generator gebruikt zowel `meal_history` als `custom_meals` (`mealPlans.service.ts` → `loadPrefilledBySlot`).

### 9.2 Koppeling recept ↔ slot

- **`meal_slot`** op zowel `custom_meals` als `meal_history`: `'breakfast' | 'lunch' | 'dinner' | 'snack'`; op `custom_meals` ook `'other'` (migratie recipe_classification).
- Geen aparte “category” of “tags” voor slot in de generator; slot komt direct uit `meal_slot`. Tags bestaan wel: `recipe_tags` + `recipe_tag_links` (many-to-many met `custom_meals`) voor gebruikerslabels (bijv. “vegetarisch”, “snel”), niet voor slot.

### 9.3 Velden beschikbaar voor ranking/selectie

| Veld            | custom_meals                                            | meal_history                                    | Opmerking                                                                                                          |
| --------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Prep time       | `total_minutes`                                         | —                                               | Optioneel; gebruikt in receptenlijst (filter maxTotalMinutes).                                                     |
| Macros          | In `meal_data.estimatedMacros` of `meal_data.nutrition` | In `meal_data`                                  | Template-generator berekent zelf uit NEVO; niet altijd aanwezig op recept.                                         |
| Rating          | Via `meal_history` (meal_id = custom_meals.id)          | `user_rating` (1–5)                             | Geen rating-kolom op custom_meals.                                                                                 |
| Usage / recency | `consumption_count`, `updated_at`                       | `usage_count`, `last_used_at`, `combined_score` | Prefill sorteert op combined_score, user_rating, last_used_at (history) en consumption_count, updated_at (custom). |
| Created         | `created_at`                                            | `created_at`                                    | Aanwezig maar niet leidend in huidige prefill.                                                                     |

### 9.4 Ingredient refs-structuur en coverage

- **Contract:** `MealIngredientRef` in `@/src/lib/diets` (diet.types.ts): `nevoCode`, `quantityG`, `displayName?`, `tags?`. Maaltijden in het plan hebben `ingredientRefs: MealIngredientRef[]`.
- **Opslag:** In `meal_data` (JSONB) als `meal_data.ingredientRefs`. Voor custom_meals zonder refs wordt aangevuld uit `recipe_ingredients`: selectie `recipe_id, nevo_food_id, quantity, unit, name` (RECIPE_INGREDIENTS_NEVO_COLUMNS in mealPlans.service.ts); `nevo_food_id` kan null zijn (niet alle ingrediënten hebben NEVO-mapping).
- **Coverage:** Geïmporteerde recepten hebben vaak lege `meal_data.ingredientRefs` tot ze gematcht zijn; dan vullen we uit `recipe_ingredients`. Geen expliciete “minCoverageScore” of dekkingsgraad in de huidige code.

### 9.5 Diet compliance vandaag

- **meal_history:** Gefilterd op `diet_key` in `loadPrefilledBySlot` (zelfde dieet als request).
- **custom_meals:** Geen filter op `diet_key` bij prefill (alleen `user_id`, `meal_slot`); `diet_key` op custom_meals is nullable.
- **Hard blocks:** `household_avoid_rules` (strictness = 'hard'): `match_mode` + `match_value` (nevo_code of term); gebruikt in `isMealBlockedByHouseholdRules` (NEVO + term in naam).
- **Profiel:** `request.profile.allergies` en `dislikes` in `isMealBlockedByAllergiesOrDislikes` (naam/ingrediënten).
- **Guardrails:** `loadHardBlockTermsForDiet` (guardrails-vnext) levert termen voor template-pool filtering; `enforceMealPlannerGuardrails` valideert het volledige plan (na generatie). Geen aparte “recipe-level compliance”-check voor custom_meals in de prefill.

### 9.6 Gaten voor recipe-first

1. **Geen eenduidige “recipe”-entiteit:** Recepten zitten in custom_meals en meal_history; meal_id in history kan naar custom_meals of naar een gegenereerde maaltijd-ID verwijzen. Een recipe-first query moet beide bronnen kunnen bevragen met een uniform contract.
2. **meal_slot “other”:** custom_meals kan `meal_slot = 'other'` hebben; voor plan-slots (breakfast/lunch/dinner/snack) moet beslist worden of “other” bij alle slots mag of bij geen.
3. **diet_key op custom_meals:** Optioneel; er is geen afdwinging “dit recept voldoet aan dieet X”. Compliance is nu vooral: history op diet_key, custom_meals ongefilterd, en ex-post guardrails op het plan.
4. **ingredientRefs niet overal:** Veel custom_meals hebben lege refs tot recipe_ingredients/NEVO-matching is gedaan. Recipe-first heeft behoefte aan “requireIngredientRefs” en eventueel minCoverageScore om alleen recepten met voldoende NEVO-dekking te gebruiken.
5. **Rating alleen via meal_history:** Voor “recepten” die alleen in custom_meals staan bestaat geen rating tenzij ze ooit in een plan hebben gestaan en in meal_history zijn opgeslagen.
6. **Expliciete kolommen:** Overal waar queries staan (mealPlans.service, meal-list.actions, etc.) worden expliciete kolommen gebruikt (geen SELECT \*). Een recipe-first query moet hetzelfde doen, bijv. voor custom_meals: `id, name, meal_slot, diet_key, meal_data, total_minutes, servings, consumption_count, updated_at` en voor meal_history: `id, meal_id, meal_name, meal_slot, diet_key, meal_data, user_rating, combined_score, last_used_at`.

### 9.7 Aanbevelingen (zonder implementatie)

- **Contract:** Types `RecipeCandidate`, `RecipeCandidateQuery`, `RecipeCandidateResult` zijn vastgelegd in `src/lib/meal-plans/mealPlans.types.ts` als contract voor de toekomstige recipe-first selectie.
- **Inprikpunten:**
  - **mealPlans.service.ts:** Nieuwe methode (bijv. `loadRecipeCandidatesForSlots`) die op basis van `RecipeCandidateQuery` uit custom_meals + meal_history candidates per slot teruggeeft, met expliciete kolommen en bestaande filters (household rules, allergies/dislikes, excludeTerms).
  - **mealPlannerAgent.service.ts:** Bovenstrooms: eerst recipe-first pad proberen (candidates ophalen, plaatsen per slot); alleen bij te weinig candidates of op expliciete fallback template/Gemini aanroepen. Geen gedragswijziging in bestaande template- of Gemini-paden.
- **Compliance:** Duidelijk maken of custom_meals op diet_key gefilterd moet worden voor recipe-first, en of een expliciete “compliant”-vlag (bijv. na guardrails-check op receptniveau) gewenst is.
- **Slot “other”:** Beleid vastleggen: uitsluiten voor slot-specifieke vulling of mappen naar een default-slot.

### 9.8 Samenvatting (NL)

- **Waar zitten recepten:** In `custom_meals` (eigen recepten) en `meal_history` (hergebruik uit plannen). Geen aparte recipes-tabel. Ingrediënten voor custom_meals zonder refs komen uit `recipe_ingredients` (nevo_food_id, quantity, unit, name).
- **Compliance:** History wordt op `diet_key` gefilterd; custom_meals niet. Hard blocks via `household_avoid_rules` (nevo_code/term) en profiel allergies/dislikes. Guardrails op planniveau (na generatie); geen receptniveau-compliance voor custom_meals.
- **Slot/ranking:** `meal_slot` op beide tabellen (breakfast/lunch/dinner/snack; custom_meals ook `other`). Ranking: history op combined_score, user_rating, last_used_at; custom_meals op consumption_count, updated_at. Prep time = custom_meals.total_minutes; rating voor custom_meals alleen via meal_history (meal_id = id).
- **Gaten:** Geen uniforme “recipe”-entiteit; ingredientRefs vaak leeg bij geïmporteerde recepten; diet_key op custom_meals optioneel; slot “other” onduidelijk voor plan-vulling.
- **Inprikken recipe-first:** In **mealPlans.service.ts** een nieuwe loader die op basis van `RecipeCandidateQuery` candidates uit custom_meals + meal_history haalt (expliciete kolommen, bestaande filters). In **mealPlannerAgent.service.ts** eerst dit recipe-first pad (candidates plaatsen), bij te weinig resultaat of expliciete fallback → bestaand template/Gemini-pad. Bestaand generator-gedrag blijft ongewijzigd.

### 9.9 Therapeutic coverage en deficits

- **Deficits → Suggestions:** De therapeutic coverage estimator vult bij deficits optioneel `deficits.suggestions` (concrete acties: add_side, add_snack, etc.). De UI (TherapeuticSummaryCard) toont deze suggesties onder Deficits; max 3, met severity-badge, titel en optioneel richtlijn (bijv. grams). Geen message-parsing: alles code-driven vanuit `alert.code`.

---

_Document: nulmeting Weekmenu Generator. Sectie 9 + types in mealPlans.types.ts toegevoegd voor recipe-first contract._
