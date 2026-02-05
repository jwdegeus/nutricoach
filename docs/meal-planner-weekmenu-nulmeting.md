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

_Document: nulmeting Weekmenu Generator. Geen code gewijzigd behalve dit doc._
