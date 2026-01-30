# Recept compliance-score

## Hoe wordt de score berekend?

De compliance-score (0–100%) voor een recept wordt berekend in
`src/app/(app)/recipes/actions/recipe-compliance.actions.ts`:

- **Formule:** `score = round((compliantIngredients / totalIngredients) * 100)`
- **totalIngredients** = aantal ingrediënten (één atoom per ingrediënt)
- **compliantIngredients** = totalIngredients − aantal ingrediënten met een blocking violation

Alleen **ingrediënten** tellen mee voor het percentage. Bereidingsstappen worden wel
geëvalueerd (voor decision.ok en violations), maar trekken het percentage niet omlaag.
Zo sluit 100% aan bij "geen ingrediënten om te vervangen" / AI magician heeft geen verbeteringen.

Ingrediënten worden **niet dubbel** geteld: we gebruiken `ingredientRefs` óf `ingredients`
(zoals de AI magician), niet beide.

## Waarom 100% als de AI magician geen verbeteringen toont?

De score is **alleen op ingrediënten** gebaseerd. Als alle ingrediënten compliant zijn,
staat de score op 100%, ook als een bereidingsstap nog een verboden term noemt (bijv.
"voeg de yoghurt toe"). Die stap telt nog wel mee voor `decision.ok` en voor de tooltip
("X item(s) wijkt af"), maar niet voor het percentage.

## Waar wordt het gebruikt?

- **Recipes list:** compliance-badge per recept
- **Receptdetailpagina:** compliance-badge + tooltip met `violatingCount` als er items
  afwijken ("X ingrediënt of bereidingsstap wijkt af")

## Gerelateerde code

- Berekening: `recipe-compliance.actions.ts` → `complianceFromDecision`, `getRecipeComplianceScoresAction`
- Targets (atomen): `src/lib/guardrails-vnext/adapters/meal-to-targets.ts` → `mapMealToGuardrailsTargets`
- Evaluatie: `src/lib/guardrails-vnext/evaluator.ts` → block-regels op ingredient + step
