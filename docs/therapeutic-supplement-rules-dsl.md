# Therapeutic supplement rules – when_json DSL

## when_json context fields

Regels in `therapeutic_protocol_supplement_rules` kunnen een optioneel `when_json` (JSONB) hebben. De evaluator gebruikt onderstaande contextvelden (geen hardcoded businesslogica).

| Veld              | Type   | Bron                                                                |
| ----------------- | ------ | ------------------------------------------------------------------- |
| `sex`             | string | Health profile (`user_health_profiles`)                             |
| `ageYears`        | number | Afgeleid uit `birth_date` (gehele jaren)                            |
| `heightCm`        | number | Health profile                                                      |
| `weightKg`        | number | Health profile                                                      |
| `dietKey`         | string | (Reserved; nu `undefined` tot er een bron is)                       |
| `protocolKey`     | string | Actief protocol (`therapeutic_protocols.protocol_key`)              |
| `protocolVersion` | number | Actief protocol (`therapeutic_protocols.version`, geparsed)         |
| `override`        | —      | Via condition `field: "override"`, `key` + `op` + optioneel `value` |

**Field-condition velden** (in `when_json` onder `all` / `any` / `not`):  
`sex`, `ageYears`, `heightCm`, `weightKg`, `dietKey`, `protocolKey`, `protocolVersion`.

**Operatoren** (voor field- en override-conditions):  
`eq`, `neq`, `gte`, `lte`, `in`. Voor override ook: `exists`.

- `gte`/`lte`: alleen numerieke vergelijking; anders wordt de rule als ongeldig beschouwd (fail-closed, `invalidWhenJson`).
- `in`: membership; value is een array.

Voorbeelden (losse condities; in de praktijk staan ze onder `all` of `any`):

- `{ "field": "protocolKey", "op": "eq", "value": "ms_v1" }`
- `{ "field": "dietKey", "op": "in", "value": ["wahls", "default"] }`
- `{ "field": "protocolVersion", "op": "gte", "value": 2 }`

### Copy-paste voorbeelden (valide bij whenJsonSchema)

**1. all + field gte (protocolKey + protocolVersion):**

```json
{
  "all": [
    { "field": "protocolKey", "op": "eq", "value": "wahls_mitochondria_v1" },
    { "field": "protocolVersion", "op": "gte", "value": 1 }
  ]
}
```

**2. any + override exists + override gte:**

```json
{
  "any": [
    {
      "field": "override",
      "key": "supplements.vitamin_d.intended_amount",
      "op": "gte",
      "value": 2000
    },
    { "field": "override", "key": "meds.blood_thinner", "op": "exists" }
  ]
}
```

Beide voorbeelden worden door `whenJsonSchema` (`src/lib/therapeutic/whenJson.schema.ts`) geaccepteerd.

---

## UI “Waarom” / explain

De server-evaluator (in `therapeuticProfile.service`) retourneert bij toepasselijke regels met `when_json` een **matched conditions**-lijst: welke condities daadwerkelijk “true” waren. De UI (Settings → Therapeutisch profiel → Supplementen) toont deze informatie als korte “Waarom geldt deze regel”-uitleg.

- **Geen when_json-parsing in de UI**: de frontend ontvangt alleen de voorgerekende `matched`-array (onder `details.rulesWhy[rule.id].matched`). Er wordt geen `when_json` in de browser geparsed.
- **Safety**: de service levert maximaal **6** matched conditions per regel; de UI toont maximaal **2** regels. Er wordt geen volledige context (ctx) weergegeven; alleen de primitives van de gematchede condities (veld/override, op, expected, eventueel actual).
- **Formaat**: override `exists` → “{key} is ingesteld”; overige override/field → “{key of field} {op} {expected}”, optioneel “(jij: {actual})” als actual veilig is (number, boolean of korte string).

---

## Admin validator preview (Stap 36)

In de Admin UI (Supplement regels → bewerken) staat onder de when_json-textarea een live validatie: leeg → “Geen voorwaarden”; ongeldige JSON → “Ongeldige JSON” + hint; geldige JSON maar verkeerde DSL-shape → “Ongeldige DSL-shape” + max. 2 Zod-issues; geldige shape → “OK” + welke top-level keys (all/any/not) aanwezig zijn. Het schema staat centraal in `src/lib/therapeutic/whenJson.schema.ts`; de evaluator in de service gebruikt hetzelfde schema (één bron van waarheid).

---

## Wijzigingssamenvatting (Stap 32)

- Service: types `MatchedCondition` en `RuleEvaluationMeta` toegevoegd; evaluator retourneert bij toepasselijke regels met when_json een lijst “matched conditions” (max 6 per regel). Voor `not` worden geen matched conditions opgenomen; voor `any` alleen de condities die true waren; voor `all` alle.
- `getApplicableProtocolSupplementRules` en `filterSupplementRulesForUser` uitgebreid met `ruleMetaById` (per rule.id de bijbehorende matched conditions).
- Action `loadMyActiveTherapeuticProtocolDetailsAction`: optioneel veld `rulesWhy` in details-payload (backwards compatible).
- Settings UI: bij elke toepasselijke supplementregel wordt onder de message_nl een korte “Waarom”-uitleg getoond (max 2 regels), gebaseerd op `details.rulesWhy[rule.id].matched`; geen when_json-parsing in de UI. Bekende velden krijgen een NL label (alleen weergave).
