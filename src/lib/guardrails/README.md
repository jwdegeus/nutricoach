# Guard Rails Module

## Wat is Guard Rails?

Guard Rails is het systeem dat ervoor zorgt dat AI-generated content (recepten, meal plans) voldoet aan dieetrestricties, allergies, en user preferences.

**Core Principle**: **Fail-closed op hard constraints** - als een hard constraint violation wordt gedetecteerd, moet de output worden geblokkeerd.

## Boundaries

### In Scope (Guard Rails Module)

- **Ruleset Loading**: Database queries → canonical ruleset format
- **Validation Logic**: Matching ingredients tegen rules, evaluatie van constraints
- **Firewall Evaluation**: Allow/block rule priority logic
- **Decision Trace**: Generatie van audit trail voor validatie beslissingen

### Out of Scope (Application Services)

- **Orchestration**: Recipe adaptation flow, meal planner flow, plan chat flow
- **AI Integration**: Gemini API calls, prompt construction
- **UI Components**: User-facing components voor guard rails management
- **Database Schema**: Migraties, table definitions (behoud in Supabase migrations)

## Waar Nieuwe Code Moet Landen

### Huidige Implementatie (Legacy)

- **Recipe Adaptation**: `src/app/(app)/recipes/[recipeId]/services/recipe-adaptation.service.ts`
- **Recipe Validation**: `src/app/(app)/recipes/[recipeId]/services/diet-validator.ts`
- **Meal Planner Rules**: `src/lib/diets/diet-rules.ts`
- **Meal Planner Validation**: `src/lib/agents/meal-planner/mealPlannerAgent.validate.ts`

### vNext Implementatie (Nieuwe Code)

**Alle nieuwe guard rails code moet in**:
- `src/lib/guardrails-vnext/` (nieuwe module)

**Waarom**:
- Unified implementation voor alle flows
- Deterministic evaluation
- Decision trace support
- Testable in isolation

## Migration Path

Zie `docs/guard-rails-rebuild-plan.md` voor volledige rebuild plan.

**Kort**: Stap-voor-stap migratie met feature flags, geen breaking changes.

---

**Last Updated**: 2026-01-26
