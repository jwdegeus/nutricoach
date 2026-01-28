# Diet Logic – Aanpak resterende punten

Dit document beschrijft hoe je de twee nog openstaande punten rond Diet Logic / Wahls-firewall kunt aanpakken.

---

## 1. Substitutie bij FORCE-deficits (“intelligente substitutie”)

**Doel:** Als een dag het FORCE-quotum niet haalt (bv. te weinig uit `wahls_leafy_greens`), moet de app de gebruiker of de AI helpen met recepten/maaltijden die juist die ontbrekende categorieën aanvullen.

### Huidige situatie

- `evaluateDietLogic` retourneert bij FORCE-falen o.a. `phaseResults[].forceDeficits`:  
  `{ categoryCode, categoryNameNl, minPerDay?, minPerWeek? }[]`
- De meal-planner blokkeert nu alleen en gooit `GUARDRAILS_VIOLATION` met `dietResult.summary`. De **concrete ontbrekende categorieën** worden niet doorgegeven.

### Aanpak (in volgorde van implementatie)

#### Stap 1: Deficit-informatie meegiven bij blokkeren

- **Plek:** `mealPlannerAgent.service.ts` → `enforceVNextMealPlannerGuardrails`.
- Bij `firstFail >= 0`: haal uit `dayResults[firstFail]` het phaseResult van fase 2 (FORCE) en lees `forceDeficits` uit.
- Geef die mee in de `AppError`-payload, bv.:

  ```ts
  throw new AppError('GUARDRAILS_VIOLATION', message, {
    outcome: 'blocked',
    reasonCodes,
    contentHash: guardrails.contentHash,
    rulesetVersion: guardrails.version,
    // Nieuw:
    forceDeficits?: Array<{ categoryCode: string; categoryNameNl: string; minPerDay?: number; minPerWeek?: number }>;
  });
  ```

- Zorg dat het type van `AppError` (of de GUARDRAILS_VIOLATION-extensie) zo’n optioneel `forceDeficits`-veld ondersteunt.

#### Stap 2a: UI – “Voeg dit toe”-feedback (licht)

- **Plek:** Waar je GUARDRAILS_VIOLATION toont (empty state, modal, chat-reply).
- Als `forceDeficits` aanwezig is: toon een korte zin als “Voeg iets toe uit: [Bladgroenten], [Gekleurde groenten]” en eventueel een knop “Zoek recepten” die filtert op die categorieën (als die zoekflow er al is).

#### Stap 2b: Meal-planner retry met deficit-hint (zwaarder)

- **Plek:** `MealPlannerAgentService.generateMealPlan` (of de laag die het plan laat genereren).
- Als `enforceVNextMealPlannerGuardrails` gooit met `forceDeficits`:
  - **Ofwel:** niet direct throwen, maar één retry doen met een aangepaste prompt:
    - System- of user-extra: “Zorg dat vandaag ook voldoende uit deze groepen komt: [categoryNameNl van forceDeficits]. Streef minPerDay / minPerWeek na.”
  - **Ofwel:** een aparte “repair”-loop (zoals bestaande repair bij validatiefouten) die alleen bij FORCE-falen een tweede generatie doet met die hint.
- Vereist: prompt-API die zo’n extra constraint meekrijgt, en heldere productie-afspraak (“max 1 retry”, “alleen bij FORCE”).

#### Stap 3: Recepten voor ontbrekende categorieën (productiefeature)

- **Plek:** Recepten-zoekfunctie of candidate pool (meal-planner).
- Gegeven een `categoryCode` (of `categoryNameNl`): filter recepten/ingrediënten die bij die ingredientgroep horen (bijv. via `ingredient_category_items` / bestaande tags).
- Dit kan een nieuw endpoint of parameter zijn, bv. “recepten die helpen voor forceDeficits”.
- Optioneel: in de meal-planner-candidate-pool al “prioriseer recepten die termen uit [forceDeficits.categoryCode] bevatten” toepassen zodra je forceDeficits hebt.

### Aanbevolen volgorde

1. **Stap 1** (deficit in error payload) – kleine, zuivere wijziging.
2. **Stap 2a** (UI “voeg toe: X, Y”) – direct bruikbare feedback.
3. **Stap 3** (zoek/filter op categorie) – als de rest van zoek/recepten dat toelaat.
4. **Stap 2b** (retry met hint) – alleen als je expliciet “auto-repair bij FORCE” wilt.

---

## 2. Plan-chat: Diet Logic per dag

**Doel:** Bij het toepassen van een plan-edit (plan-chat) ook FORCE-quotum per **dag** evalueren, net als bij het genereren van een heel plan.

### Huidige situatie

- Plan-chat gebruikt `mapPlanEditToGuardrailsTargets(edit, planSnapshot)` → één platte lijst ingrediënten (plan + edit-constraints zoals `avoidIngredients`).
- Daarop wordt één keer `evaluateDietLogic(dietLogic, { ingredients })` gedraaid. Er is geen “per dag”-aggregatie.
- `PlanEdit` beschrijft **intent** (action, date, mealSlot, constraints, notes), niet het concrete “nieuwe plan” na toepassing. Het echte plan na edit ontstaat pas in `applyPlanEdit`.

### Uitdaging

FORCE per dag evalueren betekent: per dag de **geëffectueerde** ingrediënten kennen. Die heb je pas na “toepassen van de edit”. Dus je wilt feitelijk: “resulting plan” per dag → `evaluateDietLogic` per dag.

### Optie A: Dry-run apply → per-dag evaluatie (proper)

- **Idee:** Voordat je de edit echt opslaat, doe een “dry-run” apply die het **resulterende plan** oplevert in het geheugen, zonder te persisten.
- **Plek:** `planEdit.apply.ts` of een naastliggende helper.
  - Nieuwe functie, bv. `applyPlanEditDryRun(plan, edit): MealPlanResponse`, die dezelfde merge-logica gebruikt als `applyPlanEdit` maar alleen het nieuwe plan teruggeeft (geen DB-writes).
- **Plan-chat:** Voor de guardrails-check:
  1. `resultingPlan = await applyPlanEditDryRun(planSnapshot, edit)` (of in-memory als die sync kan).
  2. `ingredientsPerDay = getMealPlanIngredientsPerDay(resultingPlan)`.
  3. Per dag `evaluateDietLogic(dietLogic, { ingredients: dayIngredients })`.
  4. Bij eerste falende dag: blokkeren met boodschap + daglabel (zoals in de meal-planner).
- **Voor-** en **nadelen:**
  - Pro: Zelfde semantiek als bij plan-generatie; FORCE/LIMIT echt per dag.
  - Con: Dry-run moet de volledige apply-logica volgen (incl. eventuele AI-calls voor REPLACE_MEAL/REGENERATE_DAY). Als `applyPlanEdit` nu al external calls doet om een nieuwe maaltijd te genereren, moet die in dry-run ook (of je accepteert dat dry-run “geschat” is op basis van bestaand plan + constraints).

### Optie B: Plan-chat blijft batch, documenteer (licht)

- Geen code-aanpassing voor per-dag evaluatie.
- **Documenteer** dat bij plan-chat FORCE-quotum over de **gecombineerde** set (plan + edit-ingrediënten) gaat, niet per dag. Volgende volledige plan-generatie of “maak nieuw plan” doet wél per-dag FORCE.
- **Optioneel:** In de foutmelding expliciet maken: “Bij wijzigingen worden dag-quota niet apart gecontroleerd; bij een nieuw plan wel.”

### Aanbeveling

- **Korte termijn:** Optie B – weinig werk, duidelijke begrenzing.
- **Middellange termijn:** Optie A als je plan-chat “gelijk wilt trekken” met plan-generatie en je apply-logica dry-runbaar kunt maken (of een snelle “geschatte resulting plan”-variant hebt die geen extra AI-aanroepen hoeft).

---

## Samenvatting

| Punt | Eerste stap | Volgende stappen |
|------|-------------|------------------|
| **Substitutie bij FORCE-deficits** | `forceDeficits` in GUARDRAILS_VIOLATION-payload zetten | UI “voeg toe: …” tonen; zoek/filter op categorie; optioneel retry met deficit-hint in prompt |
| **Plan-chat per-dag Diet Logic** | Documenteer dat plan-chat batch-eval doet | Eventueel: `applyPlanEditDryRun` + per-dag evaluatie op resulting plan |

Beide punten vragen vooral **productkeuzes** (wel/geen retry, wel/geen dry-run) en daarna technische invulling op de genoemde plekken.
