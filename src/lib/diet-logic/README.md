# Diet Logic (Dieetregels)

Diet Logic bepaalt **per ingredientgroep** welke actie geldt: **DROP**, **FORCE**, **LIMIT** of **PASS**. Dit zijn de Dieetregels voor een gekozen dieettype.

## Terminologie

- **Dieetregels**: het geheel van regels per dieet (uit `diet_category_constraints` + `diet_logic`).
- **Diet Logic**: de vier actietypen (drop/force/limit/pass) en de 4-fasen evaluatie.

## Acties (P0–P3)

| Priority | Diet Logic | Betekenis |
|----------|------------|-----------|
| P0 | **DROP** | Ingrediënt in deze groep → recept/maaltijd ongeldig. |
| P1 | **FORCE** | Verplicht quotum (min per dag/week) moet gehaald worden. |
| P2 | **LIMIT** | Max per dag/week; overschrijding = overtreding. |
| P3 | **PASS** | Toegestaan; vrije invulling. |

## Gebruik

```ts
import { loadDietLogicRuleset, evaluateDietLogic } from "@/src/lib/diet-logic";

// Laden (bij isInflamed wordt nightshade extra aan DROP toegevoegd)
const ruleset = await loadDietLogicRuleset(dietTypeId, { isInflamed: true });

// Evalueren
const result = evaluateDietLogic(ruleset, {
  ingredients: [{ name: "spinazie" }, { name: "pasta" }],
});

if (!result.ok) {
  console.log(result.summary, result.failedPhase); // 1 = DROP, 2 = FORCE, 3 = LIMIT
}
```

## Database

- **diet_category_constraints**: kolom `diet_logic` ('drop'|'force'|'limit'|'pass'), plus `max_per_day`, `max_per_week` voor LIMIT.
- Zie migratie `20260131000018_diet_logic_dieetregels.sql` en `docs/diet-logic-plan.md`.
