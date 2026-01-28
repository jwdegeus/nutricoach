# Guard Rails vNext - Policy Semantics

**Document versie**: 1.0  
**Datum**: 2026-01-26  
**Doel**: Expliciete evaluatieregels en contracten voor Guard Rails vNext systeem

---

## 1. Terminologie

Zie `docs/guard-rails-rebuild-plan.md` sectie 5 (Glossary) voor volledige terminologie.

**Kernbegrippen**:
- **Rule**: Een individuele guard rail regel (allow/block, hard/soft, priority)
- **Ruleset**: Collectie van rules voor een specifiek dieet/user context
- **Evaluation Context**: Input voor evaluatie (dietId, locale, user constraints, mode)
- **Decision**: Resultaat van evaluatie (ok, blocked, warnings, matches, trace)
- **Match**: Detectie van een rule match in content (ingredient, step, metadata)
- **Remediation**: Suggesties voor het oplossen van violations (substitute, remove, etc.)

---

## 2. Policy Model Overview

### 2.1 Rule Structure

Elke **GuardRule** bevat:
- **id**: Unieke identifier (stable, voor audit trail)
- **action**: `"allow"` | `"block"` (firewall semantics)
- **strictness**: `"hard"` | `"soft"` (effect op outcome)
- **priority**: Integer (0-100, hoger = belangrijker, voor conflict resolution)
- **target**: Waar rule van toepassing is (`"ingredient"` | `"step"` | `"metadata"`)
- **match**: Matching criteria (term, synonyms, canonical_id, etc.)
- **metadata**: Extra context (ruleCode, label, category, etc.)
- **remediation**: Optionele suggesties (substitutions, hints)

### 2.2 Ruleset Structure

Een **GuardrailsRuleset** bevat:
- **dietId/key**: Dieet identifier (UUID of DietKey)
- **version**: Versie nummer (voor audit trail)
- **rules**: Array van GuardRule (gesorteerd volgens evaluatie semantiek)
- **heuristics**: Optionele heuristics (e.g., added sugar detection)
- **provenance**: Metadata over oorsprong (database, derived, fallback)
- **contentHash**: Hash van ruleset content (voor reproduceerbaarheid)

### 2.3 Evaluation Context

Een **EvaluationContext** bevat:
- **dietId/key**: Dieet identifier
- **locale**: Taal voor matching en messages (`"nl"` | `"en"`)
- **userConstraints**: User-specifieke constraints (allergies, dislikes)
- **mode**: Evaluatie mode (`"recipe_adaptation"` | `"meal_planner"` | `"plan_chat"`)
- **timestamp**: Wanneer evaluatie plaatsvond (voor audit)

### 2.4 Decision Structure

Een **GuardDecision** bevat:
- **ok**: Boolean (true = geen hard constraint violations)
- **outcome**: `"allowed"` | `"blocked"` | `"warned"` (final outcome)
- **matches**: Array van GuardRuleMatch (alle matches gevonden)
- **appliedRuleIds**: Array van rule IDs die effect hadden
- **summary**: Human-readable samenvatting
- **reasonCodes**: Array van reason codes (voor categorisatie)
- **remediationHints**: Array van RemediationHint (voor AI/UI)
- **trace**: Volledige decision trace (voor audit)

---

## 3. Deterministische Evaluatie-Semantiek

### 3.1 Rule Sorting (Evaluatie Volgorde)

Rules worden gesorteerd op **drie niveaus** (in volgorde van prioriteit):

1. **rule_priority DESC** (hoog naar laag)
   - Database field: `rule_priority` (0-100)
   - Hogere priority = eerder geëvalueerd
   - Tie-break: zie niveau 2

2. **Specificity** (user > diet > global)
   - **User constraints** (allergies, dislikes): Highest specificity
   - **Diet rules** (from database): Medium specificity
   - **Global rules** (fallback): Lowest specificity
   - Tie-break: zie niveau 3

3. **Stable tie-break** (ruleId lexicographic)
   - Als priority en specificity gelijk zijn, sorteer op `ruleId` (lexicographic)
   - Garandeert deterministische volgorde (zelfde input → zelfde output)

**Implementatie**:
```typescript
rules.sort((a, b) => {
  // Level 1: Priority
  if (a.priority !== b.priority) return b.priority - a.priority;
  // Level 2: Specificity
  const specificityA = getSpecificity(a);
  const specificityB = getSpecificity(b);
  if (specificityA !== specificityB) return specificityB - specificityA;
  // Level 3: Stable tie-break
  return a.id.localeCompare(b.id);
});
```

### 3.2 Conflict Resolution

**Principe**: **BLOCK wint altijd** (fail-closed, veiliger)

**Regels**:
1. **Allow rules** worden eerst geëvalueerd (tracking)
   - Term wordt toegevoegd aan `allowedTerms` Set
   - Geen directe effect op outcome

2. **Block rules** worden daarna geëvalueerd
   - Als term in `allowedTerms` staat: **block overrides allow**
   - Block rule met hogere priority wint altijd
   - Block rule met gelijke priority wint ook (block is veiliger)

3. **Geen OVERRIDE_ALLOW mechanisme**
   - We kiezen voor "block always wins" (eenvoudiger, veiliger)
   - Als je een term expliciet wilt toestaan ondanks block, verhoog priority van allow rule
   - Als dat niet werkt, verwijder block rule (expliciete actie vereist)

**Rationale**:
- Fail-closed is veiliger dan fail-open
- Eenvoudiger te begrijpen en te testen
- Expliciete actie vereist om allow te forceren (verhoog priority of verwijder block)

### 3.3 Default Behavior

**Fail-Closed op Hard Constraints**:
- Als **hard constraint** violation wordt gedetecteerd → `outcome: "blocked"`
- Output wordt **niet** toegestaan (geen fail-open)
- User krijgt error message met reason code

**Warn-Only op Soft Constraints**:
- Als **soft constraint** violation wordt gedetecteerd → `outcome: "warned"`
- Output wordt **wel** toegestaan (soft never blocks)
- User krijgt warning message met remediation hints

**Geen Matches**:
- Als geen matches gevonden → `outcome: "allowed"`, `ok: true`
- Output wordt toegestaan

### 3.4 Strictness Semantiek

**Hard Constraints** (`strictness: "hard"`):
- **Effect**: Block output als violation gedetecteerd
- **Outcome**: `"blocked"` → output wordt niet toegestaan
- **Reason codes**: `FORBIDDEN_INGREDIENT`, `ALLERGEN_PRESENT`, etc.
- **Voorbeelden**: Allergies, gluten voor celiac, required categories

**Soft Constraints** (`strictness: "soft"`):
- **Effect**: Warn-only, output wordt altijd toegestaan
- **Outcome**: `"warned"` → output wordt toegestaan, maar warning getoond
- **Reason codes**: `DISLIKED_INGREDIENT`, `SOFT_CONSTRAINT_VIOLATION`
- **Voorbeelden**: Dislikes, preferred ingredients, variety preferences

**Expliciete Regel**: Soft constraints **blokkeren nooit** output. Ze geven alleen warnings.

### 3.5 Decision Trace

**Vereisten**:
- **Altijd volledig**: Alle matches + applied rules + final outcome
- **Deterministisch**: Zelfde input → zelfde trace
- **Audit-ready**: Trace kan opgeslagen worden in audit trail

**Trace Structuur**:
```typescript
{
  evaluationId: string; // Unique ID voor deze evaluatie
  timestamp: string; // ISO timestamp
  context: EvaluationContext; // Volledige context snapshot
  rulesetVersion: number; // Ruleset versie gebruikt
  rulesetHash: string; // Content hash van ruleset
  evaluationSteps: Array<{
    step: number; // Evaluatie stap nummer
    ruleId: string; // Rule die geëvalueerd werd
    matchFound: boolean; // Of match gevonden werd
    matchDetails?: GuardRuleMatch; // Details als match gevonden
    applied: boolean; // Of rule effect had op outcome
  }>;
  finalOutcome: "allowed" | "blocked" | "warned";
  appliedRuleIds: string[]; // Alle rule IDs die effect hadden
  reasonCodes: string[]; // Alle reason codes
}
```

---

## 4. Match Targets & Matching Modes

### 4.1 Match Targets

**Ingredient** (`target: "ingredient"`):
- Match op ingredient name, displayName, note, tags
- Gebruikt voor: Recipe adaptation, meal planner ingredient validation
- Matching modes: `exact`, `word_boundary`, `substring`, `canonical_id`

**Step** (`target: "step"`):
- Match op recipe step text
- Gebruikt voor: Recipe adaptation step validation (e.g., added sugar detection)
- Matching modes: `exact`, `word_boundary` (geen substring, voorkomt false positives)

**Metadata** (`target: "metadata"`):
- Match op metadata fields (tags, categories, NEVO codes)
- Gebruikt voor: Category-based validation, NEVO code validation
- Matching modes: `canonical_id`, `exact`

### 4.2 Matching Modes (vNext Toegestaan)

**Exact Match** (`matchMode: "exact"`):
- Case-insensitive exact match
- `text.toLowerCase() === term.toLowerCase()`
- Gebruikt voor: Ingredient names, canonical IDs
- **Geen false positives**

**Word Boundary Match** (`matchMode: "word_boundary"`):
- Regex: `\b${escapedTerm}\b` (case-insensitive)
- Voorkomt false positives (e.g., "suiker" matcht niet "suikervrij")
- Gebruikt voor: Alle targets (ingredients, steps, metadata)
- **Aanbevolen default** voor text matching

**Substring Match** (`matchMode: "substring"`):
- `text.toLowerCase().includes(term.toLowerCase())`
- **Alleen toegestaan voor ingredients** (niet voor steps)
- **Risico**: Kan false positives geven (e.g., "pasta" in "pastasaus")
- Gebruikt als fallback na word boundary (als word boundary geen match geeft)
- **Niet toegestaan voor steps** (te veel false positives)

**Canonical ID Match** (`matchMode: "canonical_id"`):
- Exact match op canonical identifier (e.g., NEVO code)
- `text === canonicalId`
- Gebruikt voor: NEVO code validation, category codes
- **Geen false positives**

### 4.3 Matching Strategie (Evaluatie Volgorde)

Voor **ingredients**:
1. Exact match (main term + synonyms)
2. Word boundary match (main term + synonyms)
3. Substring match (fallback, alleen als word boundary geen match geeft)

Voor **steps**:
1. Exact match (main term + synonyms)
2. Word boundary match (main term + synonyms)
3. **Geen substring match** (voorkomt false positives)

Voor **metadata**:
1. Canonical ID match
2. Exact match

**Stoppen bij eerste match**: Als match gevonden, stop evaluatie voor die rule (performance).

---

## 5. Remediation Contract

### 5.1 Remediation Types

**Substitute** (`type: "substitute"`):
- Vervang verboden ingredient met alternatief
- Payload: `{ original: string, alternatives: string[] }`
- Voorbeeld: "pasta" → ["rijstnoedels", "zucchininoedels"]

**Remove** (`type: "remove"`):
- Verwijder ingredient (geen alternatief beschikbaar)
- Payload: `{ ingredient: string, reason: string }`
- Voorbeeld: Allergen dat niet vervangen kan worden

**Add Required** (`type: "add_required"`):
- Voeg ontbrekende required category toe
- Payload: `{ category: string, minAmount: number, suggestions: string[] }`
- Voorbeeld: "leafy_vegetables" → ["spinazie", "boerenkool"]

**Reduce** (`type: "reduce"`):
- Verminder hoeveelheid (voor soft constraints)
- Payload: `{ ingredient: string, currentAmount: number, suggestedAmount: number }`
- Voorbeeld: "suiker" → reduce van 50g naar 20g

### 5.2 Remediation Hints voor LLM Prompt Compiler

**Constraint Hints**:
- Formatteer remediation hints als text voor LLM prompts
- Voorbeeld: `"Replace 'pasta' with 'rijstnoedels' or 'zucchininoedels'"`
- Gebruikt in: Recipe adaptation prompts, meal planner repair prompts

**Structured Format**:
```typescript
{
  type: "substitute",
  original: "pasta",
  alternatives: ["rijstnoedels", "zucchininoedels"],
  promptText: "Replace 'pasta' with 'rijstnoedels' or 'zucchininoedels'"
}
```

---

## 6. Error Modes

### 6.1 Evaluator Errors

**Fail-Closed op Hard Constraints**:
- Als evaluator error optreedt tijdens hard constraint evaluatie → **block output**
- Reason code: `EVALUATOR_ERROR`
- Message: "Guard rails evaluation failed, output blocked for safety"

**Fail-Open op Soft Constraints**:
- Als evaluator error optreedt tijdens soft constraint evaluatie → **allow output, log warning**
- Reason code: `EVALUATOR_WARNING`
- Message: "Guard rails evaluation warning, output allowed"

### 6.2 Deterministische Reason Codes

**Stable Reason Code Enum**:
```typescript
type GuardReasonCode =
  // Ingredient violations
  | "FORBIDDEN_INGREDIENT"
  | "ALLERGEN_PRESENT"
  | "DISLIKED_INGREDIENT"
  // Category violations
  | "MISSING_REQUIRED_CATEGORY"
  | "INVALID_CATEGORY"
  // NEVO/Canonical violations
  | "INVALID_NEVO_CODE"
  | "INVALID_CANONICAL_ID"
  // Macro/Calorie violations
  | "CALORIE_TARGET_MISS"
  | "MACRO_TARGET_MISS"
  // Meal structure violations
  | "MEAL_PREFERENCE_MISS"
  | "MEAL_STRUCTURE_VIOLATION"
  // Soft constraints
  | "SOFT_CONSTRAINT_VIOLATION"
  // Errors
  | "EVALUATOR_ERROR"
  | "EVALUATOR_WARNING"
  | "RULESET_LOAD_ERROR"
  | "UNKNOWN_ERROR";
```

**Forward-Compatible**:
- Nieuwe reason codes kunnen toegevoegd worden zonder breaking changes
- Bestaande codes blijven stabiel

---

## 7. Versioning & Audit Requirements

### 7.1 Ruleset Versioning

**Ruleset Version**:
- Integer versie nummer (increment bij wijzigingen)
- Opgeslagen in database (`diet_category_constraints` heeft geen versie, maar ruleset heeft versie)
- Gebruikt voor: Audit trail, reproduceerbaarheid

**Content Hash**:
- SHA-256 hash van ruleset content (serialized JSON)
- Gebruikt voor: Detectie van wijzigingen, reproduceerbaarheid
- Opgeslagen in: `GuardrailsRuleset.contentHash`

### 7.2 Evaluator Versioning

**Evaluator Version**:
- Versie van evaluatie logica (niet ruleset)
- Opgeslagen in: Decision trace
- Gebruikt voor: Debugging, reproduceerbaarheid als evaluatie logica wijzigt

### 7.3 Audit Trail Requirements

**Vereisten voor Audit Trail**:
1. **Ruleset Snapshot**: Volledige ruleset op moment van evaluatie
2. **Decision Trace**: Volledige trace (alle matches, applied rules, outcome)
3. **Context Snapshot**: Volledige evaluation context
4. **Timestamp**: Wanneer evaluatie plaatsvond
5. **Evaluator Version**: Versie van evaluatie logica

**Gebruik**:
- Reproduceerbaarheid: Oude runs kunnen gereproduceerd worden met snapshot
- Debugging: Trace laat zien waarom output werd toegestaan/geblokkeerd
- Compliance: Audit trail voor regulatory requirements

---

## 8. Integration Contracts

### 8.1 Recipe Adaptation Contract

**Input**:
- `draft: RecipeAdaptationDraft` (ingredients + steps)
- `context: EvaluationContext` (mode: "recipe_adaptation")

**Output**:
- `GuardDecision` met `outcome: "allowed" | "blocked" | "warned"`

**Behavior**:
- Hard constraint violations → `blocked`, draft wordt niet geretourneerd
- Soft constraint violations → `warned`, draft wordt geretourneerd met warnings
- Geen violations → `allowed`, draft wordt geretourneerd

### 8.2 Meal Planner Contract

**Input**:
- `plan: MealPlan` (days, meals, ingredients)
- `context: EvaluationContext` (mode: "meal_planner")

**Output**:
- `GuardDecision` met `outcome: "allowed" | "blocked" | "warned"`

**Behavior**:
- Hard constraint violations → `blocked`, plan wordt niet geaccepteerd
- Soft constraint violations → `warned`, plan wordt geaccepteerd met warnings
- Geen violations → `allowed`, plan wordt geaccepteerd

### 8.3 Plan Chat Contract

**Input**:
- `edit: PlanEdit` (proposed changes)
- `context: EvaluationContext` (mode: "plan_chat")

**Output**:
- `GuardDecision` met `outcome: "allowed" | "blocked" | "warned"`

**Behavior**:
- Hard constraint violations → `blocked`, edit wordt niet uitgevoerd
- Soft constraint violations → `warned`, edit wordt uitgevoerd met warnings
- Geen violations → `allowed`, edit wordt uitgevoerd

---

## 9. Non-Goals (Expliciet Uitgesloten)

**Wat vNext NIET doet**:
1. **Geen UI Logic**: UI components blijven in application layer
2. **Geen Database Queries**: Database queries blijven in loader module
3. **Geen AI Integration**: AI prompts blijven in application layer
4. **Geen Feature Flags**: Feature flags blijven in application layer
5. **Geen Performance Optimizations**: Focus op correctness, performance komt later

---

**Document End**
