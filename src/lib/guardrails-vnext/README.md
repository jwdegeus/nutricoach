# Guard Rails vNext Module

**Status**: 🚧 In Development (Types + Semantics Defined)

## Intent

Unified guard rails implementation voor alle flows:
- Recipe Adaptation
- Meal Planner
- Plan Chat

## Documentation

**Policy Semantics**: Zie [`docs/guardrails-vnext-semantics.md`](../../../docs/guardrails-vnext-semantics.md) voor:
- Expliciete evaluatieregels (sorting, conflicts, defaults)
- Match targets & matching modes
- Remediation contract
- Error modes & reason codes
- Versioning & audit requirements

**Migration Plan**: Zie [`docs/guard-rails-rebuild-plan.md`](../../../docs/guard-rails-rebuild-plan.md) voor volledige rebuild plan.

## Module Structure

```
guardrails-vnext/
├── index.ts              # Public API exports (✅ Types + placeholders)
├── types.ts              # Unified type definitions (✅ Complete)
├── ruleset-loader.ts     # Database → canonical format (TODO)
├── validator.ts          # Matching + evaluation (TODO)
├── plan-chat-gate.ts    # Plan chat post-validation (TODO)
├── decision-trace.ts     # Decision trace generation (TODO)
└── README.md             # This file
```

## Public API

**Types**: Alle types zijn geëxporteerd via `index.ts`:
- `GuardRule`, `GuardrailsRuleset`, `GuardDecision`, `DecisionTrace`
- `EvaluationContext`, `EvaluationResult`
- `RuleAction`, `Strictness`, `MatchTarget`, `MatchMode`
- `GuardReasonCode`, `RemediationHint`

**Functions** (placeholders, nog niet geïmplementeerd):
- `evaluateGuardrails()` - Main evaluation entry point
- `loadGuardrailsRuleset()` - Load from database
- `compileConstraintsForAI()` - Format for LLM prompts

## Migration Plan

**Fase 1**: Documentatie + TODO markers ✅  
**Fase 2**: Types + Semantics (huidige stap) ✅  
**Fase 3**: Implementatie (parallel, geen runtime impact)  
**Fase 4**: Integration (met feature flags)  
**Fase 5**: Behavior changes (fail-closed)  
**Fase 6**: Cleanup (legacy removal)

---

**Last Updated**: 2026-01-26
