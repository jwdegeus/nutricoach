# Guard Rails Rebuild Plan

**Document versie**: 1.0  
**Datum**: 2026-01-26  
**Doel**: Plan voor stap-voor-stap herbouw van guard rails systeem met duidelijke boundaries en ownership

---

## 1. Waarom Herbouwen?

### 1.1 Huidige Problemen

Het huidige guard rails systeem heeft meerdere kritieke gaps:

1. **Fail-Open Behavior**: Recipe adaptation retourneert drafts met violations (risico #2)
2. **Geen Post-Validation**: Plan chat omzeilt guard rails volledig (risico #3)
3. **Ongebruikte Allow Rules**: Firewall logica verzamelt allow regels maar gebruikt ze niet (risico #6)
4. **Inconsistente Matching**: Verschillende matching logica tussen recipe adaptation en meal planner (risico #10)
5. **Geen Tests**: Geen automated tests voor guard rails logica (risico #9)

### 1.2 Safety Principes voor vNext

**Deterministisch Gate**:
- Guard rails moeten **deterministisch** evalueren: zelfde input → zelfde output
- Geen dependency op AI temperature of non-deterministische matching
- Alle evaluaties moeten traceerbaar zijn (decision trace)

**Fail-Closed op Hard Constraints**:
- Hard constraints (`GUARD_RAIL_HARD`) moeten **altijd** fail-closed zijn
- Als hard constraint violation wordt gedetecteerd, moet output worden geblokkeerd
- Soft constraints kunnen warnings geven maar niet blokkeren

**Expliciete User Consent**:
- Als we toch fail-open willen (bijv. voor user experience), moet dit expliciet zijn
- User moet bewust kiezen om violations te accepteren
- Geen silent bypasses

**Unified Matching Logic**:
- Eén matching engine voor alle flows (recipe adaptation, meal planner, plan chat)
- Consistente word boundary + substring strategie
- Geen false positives door substring matching

---

## 2. Ownership Map

### 2.1 Source-of-Truth per Flow

| Flow | Source-of-Truth Module | Current Location | vNext Location |
|------|------------------------|------------------|----------------|
| **Recipe Adaptation** | `RecipeAdaptationService.loadDietRuleset()` | `src/app/(app)/recipes/[recipeId]/services/recipe-adaptation.service.ts` | `src/lib/guardrails-vnext/ruleset-loader.ts` |
| **Recipe Validation** | `validateDraft()` | `src/app/(app)/recipes/[recipeId]/services/diet-validator.ts` | `src/lib/guardrails-vnext/validator.ts` |
| **Meal Planner Rules** | `deriveDietRuleSet()` | `src/lib/diets/diet-rules.ts` | `src/lib/guardrails-vnext/ruleset-loader.ts` (unified) |
| **Meal Planner Validation** | `validateHardConstraints()` | `src/lib/agents/meal-planner/mealPlannerAgent.validate.ts` | `src/lib/guardrails-vnext/validator.ts` (unified) |
| **Plan Chat** | `PlanChatService.handleChat()` | `src/lib/agents/meal-planner/planChat.service.ts` | `src/lib/guardrails-vnext/plan-chat-gate.ts` |

### 2.2 Database Ownership

| Tabel | Owner | Purpose |
|-------|-------|---------|
| `diet_category_constraints` | Guard Rails vNext | Primary source voor recipe adaptation rules |
| `ingredient_category_items` | Guard Rails vNext | Specific terms per category |
| `recipe_adaptation_rules` | Guard Rails vNext (legacy) | Fallback/additional rules |
| `recipe_adaptation_heuristics` | Guard Rails vNext | Heuristics (e.g., added sugar) |

### 2.3 Code Ownership Boundaries

**Guard Rails vNext Module** (`src/lib/guardrails-vnext/`):
- Ruleset loading (database → canonical format)
- Validation logic (matching, evaluation)
- Decision trace generation
- Firewall evaluation (allow/block priority)

**Application Services** (remain in current locations):
- Recipe adaptation orchestration (`RecipeAdaptationService`)
- Meal planner orchestration (`MealPlannerAgentService`)
- Plan chat orchestration (`PlanChatService`)
- UI components

**Boundary Contract**:
- Services call guard rails vNext via **deterministic API**
- Guard rails vNext returns `ValidationResult` met decision trace
- Services beslissen over fail-open/fail-closed based on result

---

## 3. Bouwvolgorde

### Fase 1: Foundation (Stap 1-3)
**Doel**: Setup zonder runtime impact

1. ✅ **Stap 1**: Documentatie + TODO markers (huidige stap)
   - Ownership map
   - Build order
   - Glossary
   - Top 5 risks + vNext oplossingen

2. **Stap 2**: Unified Ruleset Loader
   - Nieuwe module: `src/lib/guardrails-vnext/ruleset-loader.ts`
   - Unificeer `loadDietRuleset()` en `deriveDietRuleSet()` logica
   - Implementeer firewall evaluatie (allow/block priority)
   - **Geen** wijzigingen aan bestaande code (parallel implementatie)

3. **Stap 3**: Unified Validator
   - Nieuwe module: `src/lib/guardrails-vnext/validator.ts`
   - Unificeer matching logica (word boundary + substring)
   - Implementeer decision trace generation
   - **Geen** wijzigingen aan bestaande code (parallel implementatie)

### Fase 2: Integration (Stap 4-6)
**Doel**: Integreer vNext modules zonder behavior changes

4. **Stap 4**: Recipe Adaptation Integration
   - Vervang `loadDietRuleset()` call met vNext loader
   - Vervang `validateDraft()` call met vNext validator
   - **Behoud** huidige fail-open behavior (expliciet via TODO)
   - Feature flag: `USE_VNEXT_GUARDRAILS` (default: false)

5. **Stap 5**: Meal Planner Integration
   - Vervang `deriveDietRuleSet()` call met vNext loader
   - Vervang `validateHardConstraints()` call met vNext validator
   - **Behoud** huidige fail-closed behavior
   - Feature flag: `USE_VNEXT_GUARDRAILS` (default: false)

6. **Stap 6**: Plan Chat Gate
   - Nieuwe module: `src/lib/guardrails-vnext/plan-chat-gate.ts`
   - Post-validation voor PlanEdit output
   - **Implementeer** fail-closed voor hard constraints
   - Feature flag: `ENABLE_PLAN_CHAT_VALIDATION` (default: false)

### Fase 3: Behavior Changes (Stap 7-9)
**Doel**: Fix fail-open behavior met expliciete user consent

7. **Stap 7**: Recipe Adaptation Fail-Closed
   - Implementeer fail-closed voor hard constraints
   - User consent flow voor soft constraint violations
   - Feature flag: `RECIPE_ADAPTATION_FAIL_CLOSED` (default: false)

8. **Stap 8**: Allow Rules Implementation
   - Implementeer allow rules evaluatie in firewall
   - Test allow/block priority logic
   - Feature flag: `ENABLE_ALLOW_RULES` (default: false)

9. **Stap 9**: Decision Trace & Audit
   - Voeg decision trace toe aan audit trail
   - Ruleset snapshot in `recipe_adaptation_runs`
   - Metrics collection voor validation rates

### Fase 4: Cleanup (Stap 10-11)
**Doel**: Verwijder legacy code

10. **Stap 10**: Legacy Code Removal
    - Verwijder oude `loadDietRuleset()` implementatie
    - Verwijder oude `validateDraft()` implementatie
    - Verwijder oude `deriveDietRuleSet()` implementatie (of markeer als deprecated)

11. **Stap 11**: Tests & Documentation
    - Comprehensive test suite voor vNext modules
    - Update API documentation
    - Update user-facing documentation

---

## 4. Non-Goals

**Wat we NIET doen in deze rebuild**:

1. **Geen Database Migraties**: Huidige schema blijft ongewijzigd
2. **Geen UI Changes**: Geen wijzigingen aan UI components (komt later)
3. **Geen Performance Optimizations**: Focus op correctness, performance komt later
4. **Geen New Features**: Alleen herbouw bestaande functionaliteit
5. **Geen Breaking Changes**: Alle wijzigingen zijn backward compatible (via feature flags)

---

## 5. Glossary

### 5.1 Naming Conventies

**DietRuleset** (Recipe Adaptation):
- Type: `DietRuleset` (lowercase 's' in "Ruleset")
- Locatie: `src/app/(app)/recipes/[recipeId]/services/diet-validator.ts`
- Format: `{ dietId, version, forbidden[], heuristics? }`
- Gebruik: Recipe adaptation validation

**DietRuleSet** (Meal Planner):
- Type: `DietRuleSet` (uppercase 'S' in "RuleSet")
- Locatie: `src/lib/diets/diet.types.ts`
- Format: `{ dietKey, ingredientConstraints[], requiredCategories[], ... }`
- Gebruik: Meal planner validation

**vNext Unified Format**:
- Type: `GuardRailsRuleset` (nieuwe naam, geen verwarring)
- Locatie: `src/lib/guardrails-vnext/types.ts`
- Format: Unified format voor beide flows
- Gebruik: Alle guard rails evaluaties

### 5.2 Terminologie

**Hard Constraint**:
- `strictness === "hard"` of `constraintType === "hard"`
- Rule code: `"GUARD_RAIL_HARD"` of `"FORBIDDEN_HARD"`
- Behavior: **Fail-closed** - violations blokkeren output
- Voorbeeld: Allergies, gluten voor celiac patient

**Soft Constraint**:
- `strictness === "soft"` of `constraintType === "soft"`
- Rule code: `"GUARD_RAIL_SOFT"` of `"FORBIDDEN_SOFT"`
- Behavior: **Warning** - violations geven warning maar blokkeren niet
- Voorbeeld: Dislikes, preferred ingredients

**Allow Rule**:
- `rule_action === "allow"` in `diet_category_constraints`
- Purpose: Expliciet toestaan van ingredient ondanks category block
- Firewall: Allow rules worden geëvalueerd vóór block rules
- **Huidige Status**: Verzameld maar niet gebruikt (risico #6)

**Block Rule**:
- `rule_action === "block"` in `diet_category_constraints`
- Purpose: Blokkeren van ingredient
- Firewall: Block rules hebben voorrang over allow rules opzelfde prioriteit
- **Huidige Status**: Wordt gebruikt voor validatie

**Decision Trace**:
- Audit trail van guard rails evaluatie
- Bevat: welke rules werden geëvalueerd, welke matches werden gevonden, waarom output werd toegestaan/geblokkeerd
- **Huidige Status**: Niet geïmplementeerd (risico #5)

**Canonicalization**:
- Normalisatie van ingredient names voor matching
- Lowercase, trim, synonym expansion
- **Huidige Status**: Gedeeltelijk geïmplementeerd (inconsistent tussen flows)

---

## 6. Top 5 Risico's + vNext Oplossingen

### 6.1 Risico #2: Fail-Open Behavior in Recipe Adaptation

**Huidige Situatie**:
- Locatie: `src/app/(app)/recipes/[recipeId]/services/recipe-adaptation.service.ts:118-129`
- Behavior: Draft wordt geretourneerd zelfs met violations
- Code: `console.warn("Strict mode rewrite still has violations:", validation.matches); // Return the draft anyway`

**vNext Oplossing**:
- **Deterministisch Gate**: vNext validator retourneert `ValidationResult` met `blocked: boolean`
- **Fail-Closed voor Hard**: Als hard constraint violation → `blocked: true`, draft wordt niet geretourneerd
- **User Consent voor Soft**: Als soft constraint violation → `blocked: false`, maar user krijgt expliciete warning + optie om te accepteren
- **Decision Trace**: Trace bevat waarom draft werd geblokkeerd/toegestaan

**Implementatie**:
- Module: `src/lib/guardrails-vnext/validator.ts`
- API: `validateDraft(draft, ruleset): ValidationResult`
- `ValidationResult.blocked: boolean` (hard constraints only)
- `ValidationResult.warnings: ValidationWarning[]` (soft constraints)

### 6.2 Risico #3: Geen Post-Validation in Plan Chat

**Huidige Situatie**:
- Locatie: `src/lib/agents/meal-planner/planChat.service.ts`
- Behavior: PlanEdit wordt direct uitgevoerd zonder validation
- Risico: User kan via chat guard rails omzeilen

**vNext Oplossing**:
- **Plan Chat Gate**: Nieuwe module `src/lib/guardrails-vnext/plan-chat-gate.ts`
- **Post-Validation**: Valideer PlanEdit output vóór `applyPlanEdit()`
- **Fail-Closed**: Als hard constraint violation → PlanEdit wordt geblokkeerd, error message naar user
- **Decision Trace**: Trace bevat welke ingredients/meals werden geblokkeerd en waarom

**Implementatie**:
- Module: `src/lib/guardrails-vnext/plan-chat-gate.ts`
- API: `validatePlanEdit(edit, ruleset): ValidationResult`
- Integration: Call vóór `applyPlanEdit()` in `PlanChatService.handleChat()`

### 6.3 Risico #6: Allow Rules Niet Gebruikt

**Huidige Situatie**:
- Locatie: `src/app/(app)/recipes/[recipeId]/services/recipe-adaptation.service.ts:228-248`
- Behavior: Allow rules worden verzameld in `allowedTerms` Set maar niet gebruikt
- Code: `const allowedTerms = new Set<string>(); // Track allowed terms` → maar alleen block rules worden toegevoegd aan `forbidden[]`

**vNext Oplossing**:
- **Firewall Evaluatie**: vNext loader implementeert volledige firewall logica
- **Priority-Based**: Rules worden gesorteerd op `rule_priority DESC`
- **Allow First**: Allow rules worden eerst geëvalueerd (tracking)
- **Block Override**: Block rules met hogere prioriteit kunnen allow overrulen
- **Deterministisch**: Zelfde input → zelfde output (geen race conditions)

**Implementatie**:
- Module: `src/lib/guardrails-vnext/ruleset-loader.ts`
- Function: `loadRulesetWithFirewall(dietId): GuardRailsRuleset`
- Logic: 
  1. Load constraints sorted by `rule_priority DESC`
  2. Eerst verzamel allow rules → `allowedTerms` Set
  3. Dan verzamel block rules → `blockedTerms` Set
  4. Als term in beide: block wint (hogere prioriteit)
  5. Return unified `GuardRailsRuleset` met `allowed[]` en `blocked[]` arrays

### 6.4 Risico #5: Geen Ruleset Snapshot in Audit Trail

**Huidige Situatie**:
- Locatie: `src/app/(app)/recipes/[recipeId]/services/recipe-adaptation-db.service.ts:270-297`
- Behavior: `recipe_adaptation_runs` slaat ruleset niet op
- Risico: Oude runs kunnen niet gereproduceerd worden als ruleset wijzigt

**vNext Oplossing**:
- **Ruleset Snapshot**: vNext loader genereert snapshot van ruleset op moment van evaluatie
- **Audit Trail**: Snapshot wordt opgeslagen in `recipe_adaptation_runs.ruleset_snapshot` (nieuwe kolom)
- **Decision Trace**: Trace bevat ruleset versie + timestamp
- **Reproduceerbaarheid**: Oude runs kunnen gereproduceerd worden met snapshot

**Implementatie**:
- Database: Add `ruleset_snapshot JSONB` kolom aan `recipe_adaptation_runs`
- Module: `src/lib/guardrails-vnext/ruleset-loader.ts`
- Function: `generateRulesetSnapshot(ruleset): RulesetSnapshot`
- Integration: Call in `RecipeAdaptationDbService.createRun()` vóór insert

### 6.5 Risico #10: Inconsistente Matching Logica

**Huidige Situatie**:
- Recipe Adaptation: Word boundary + substring (in `diet-validator.ts`)
- Meal Planner: Alleen substring (in `mealPlannerAgent.validate.ts`)
- Risico: Verschillende behavior tussen features

**vNext Oplossing**:
- **Unified Matching Engine**: Eén matching functie voor alle flows
- **Consistent Strategy**: Word boundary eerst, dan substring fallback
- **Context-Aware**: Ingredients vs steps hebben verschillende matching strategie
- **No False Positives**: Word boundary voorkomt "pasta" in "pastasaus" matches

**Implementatie**:
- Module: `src/lib/guardrails-vnext/validator.ts`
- Function: `matchIngredient(text, ruleset, context): MatchResult[]`
- Strategy:
  1. Exact match (ingredients only)
  2. Word boundary match (all contexts)
  3. Substring match (ingredients only, fallback)
  4. Synonym expansion (all contexts)

---

## 7. Module Structure (vNext)

```
src/lib/guardrails-vnext/
├── index.ts                    # Public API exports
├── types.ts                    # GuardRailsRuleset, ValidationResult, etc.
├── ruleset-loader.ts           # Unified ruleset loading (database → canonical)
├── validator.ts                # Unified validation (matching + evaluation)
├── plan-chat-gate.ts           # Plan chat post-validation gate
├── decision-trace.ts           # Decision trace generation
└── README.md                   # Module documentation
```

---

## 8. Success Criteria

**Fase 1 Complete**:
- ✅ Documentatie compleet
- ✅ TODO markers in code
- ✅ vNext folder structure aanwezig

**Fase 2 Complete**:
- ✅ vNext modules geïmplementeerd (parallel, geen runtime impact)
- ✅ Feature flags geïmplementeerd
- ✅ Integration tests geschreven

**Fase 3 Complete**:
- ✅ Fail-closed behavior voor hard constraints
- ✅ Allow rules geïmplementeerd
- ✅ Decision trace + audit trail

**Fase 4 Complete**:
- ✅ Legacy code verwijderd
- ✅ Comprehensive test suite
- ✅ Documentation updated

---

**Document End**
