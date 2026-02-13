# Diet Validator – Refactor Stappenplan

## Doel

Alle hardcoded strings en logica vervangen door beheerbare backend/database-data. Daarna logica en Gemini AI-integratie controleren en false positives correct afhandelen.

---

## Fase 1: Hardcoded data naar database (Stap 1)

### 1.1 Huidige hardcoded blokken in `diet-validator.ts`

| Blok                                          | Regels  | Doel                                                             | Actie                                             |
| --------------------------------------------- | ------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| **EXTRA_INGREDIENT_SYNONYMS**                 | 56-140  | NL↔EN synoniemen voor matching (mozzarella→cheese, honing→sugar) | Nieuwe DB-tabel of bestaande structuur uitbreiden |
| **isExcludedByOverrides – `key === 'bloem'`** | 158     | Speciale normalisatie voor "bloem" (kool bloem vs bloem)         | Configuratie/flag in DB of generieke normalisatie |
| **validateDraft summary**                     | 406-408 | "No forbidden ingredients detected"                              | Optioneel: i18n/vertaling – prioriteit laag       |
| **LOW_SUGAR heuristics**                      | 315-317 | Rule code voor toegevoegde suiker                                | Uit ruleset halen; geen hardcoded code            |

### 1.2 Database-uitbreiding voor synoniemen

**Optie A – Nieuwe tabel `magician_ingredient_synonyms`**

```sql
CREATE TABLE magician_ingredient_synonyms (
  id UUID PRIMARY KEY,
  forbidden_term TEXT NOT NULL,      -- bv. cheese, dairy, sugar
  synonym TEXT NOT NULL,             -- bv. mozzarella, honing
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  UNIQUE(forbidden_term, synonym)
);
```

**Optie B – Kolom in `magician_validator_overrides`**

- `match_synonyms JSONB` – extra synoniemen voor matching (naast exclude_if_contains).
- Beperkt tot één tabel; semantisch minder zuiver.

**Aanbeveling:** Optie A – aparte tabel voor matching-synoniemen; `magician_validator_overrides` blijft alleen voor exclusions.

### 1.3 Admin-functionaliteit

- Nieuwe admin-pagina of uitbreiding AI Magician:
  - Beheer `magician_ingredient_synonyms` (CRUD).
  - Per forbidden_term synoniemen toevoegen/verwijderen.

### 1.4 Loader en diet-validator aanpassen

- Nieuwe loader: `loadMagicianIngredientSynonyms(): Promise<Record<string, string[]>>`
- Diet-validator: `EXTRA_INGREDIENT_SYNONYMS` verwijderen; synoniemen uit DB gebruiken.
- Fallback: lege object bij DB-fout (geen hardcoded fallback).

### 1.5 Speciale `bloem`-logica

- **Huidige logica:** Voor `bloem` ook `normalized` tekst (spaties, koppeltekens) gebruiken.
- **Opties:**
  - A) `match_mode` kolom in `magician_validator_overrides` (bv. `substring` vs `substring_normalized`).
  - B) Generiek: altijd normalized matching voor substring-check.
- **Aanbeveling:** B – altijd normalized; sluit aan bij `normalizeForMatching()`.

---

## Fase 2: Logica herzien (Stap 2)

### 2.1 Matchingflow

1. **Exact match** (term/synoniem = ingrediënt)
2. **Word boundary** (term/synoniem als woord)
3. **Substring** (term/synoniem in ingrediënt) – alleen ingredients

### 2.2 Override-check

- Voor elke match: `isExcludedByOverrides(text, matchedTerm, overrides)`.
- Overrides: `exclude_if_contains` per `forbidden_term`.
- Geen term-specifieke code; alles via data.

### 2.3 Te controleren randgevallen

- [x] "X of Y" – enrichLastMatchWithAllowedAlternative zet allowedAlternativeInText op het toegestane deel
- [x] Meerdere matches – break na eerste synonym match per regel; één match per forbidden term
- [x] Volgorde: exact → word boundary (term) → substring (term+synonyms+extra) → word boundary (synonym) → substring (synonym)
- [x] Steps vs ingredients – substring alleen bij context === 'ingredients'; steps alleen word boundary + addedSugar

### 2.4 Added-sugar heuristics

- [x] `ruleset.heuristics.addedSugarTerms` komt uit DB (`recipe_adaptation_heuristics`).
- [x] Geen hardcoded `LOW_SUGAR`; zoek eerst regel in ruleset waar ruleCode/ruleLabel suiker bevat, anders fallback `ADDED_SUGAR`.

---

## Fase 3: Gemini AI-integratie (Stap 3)

### 3.1 Huidige prompt (hardcoded voorbeelden)

```
- Vertrouw op onze validator: ingrediënten als bloemkoolrijst, zoete aardappel,
  plantaardige melk/yoghurt, glutenvrije producten en zwarte/witte peper zijn al gefilterd.
- Focus op duidelijke overtredingen: zuivel (melk, kaas, yoghurt), gluten (tarwe, pasta, brood), ...
```

### 3.2 Aanpassingen

1. **Dynamische “al gefilterd”-lijst**
   - Afleiden uit `magician_validator_overrides` (exclude patterns per term).
   - Voorbeeld: "De volgende patronen zijn al uitgesloten: [lijst uit overrides]".
   - Of: "Ingrediënten die patronen X, Y, Z bevatten zijn al goedgekeurd – stel daar geen violation voor."

2. **Dynamische “focus op”-lijst**
   - Gebaseerd op `ruleset.forbidden` (termen + synoniemen).
   - Geen vaste voorbeelden; regels uit ruleset in de prompt zetten.

3. **Overrides doorgeven**
   - `suggestViolationsWithAI` krijgt `overrides` mee en filtert AI-suggesties.
   - Controleren of filtering volledig en consistent is.

---

## Fase 4: False positives – analyse en fix (Stap 4)

### 4.1 Mogelijke oorzaken

1. **Overrides niet geladen** – cache, timing, foutafhandeling
2. **Term/key mismatch** – override op `aardappel`, match op `potato` (synoniem)
3. **Substring vs exact** – "zoet aardappel" vs "zoete aardappel gekookt"
4. **Normalisatie** – spaties, koppeltekens, hoofdletters
5. **Gemini gebruikt andere termen** – ruleLabel vs forbidden term
6. **Filtering te strikt** – `isExcludedByOverrides` in Gemini sluit te veel uit

### 4.2 Te verifiëren

- [x] `loadMagicianOverrides()` wordt aangeroepen in recipe-adaptation.service, planChat, guardrails-preview, recipe-compliance, planReview, enforceMealPlannerGuardrails, recipe-ai.persist
- [x] Cache wordt geleegd in magicianOverrides.actions (upsert, delete, setActive) en magicianIngredientSynonyms.actions
- [x] Overrides + extraSynonyms worden doorgegeven aan `validateDraft`, `findForbiddenMatches` in recipe-adaptation.service
- [x] Seed heeft overrides voor zowel `aardappel` als `potato` (nachtschade-synoniemen)
- [ ] Debug-logging voor edge cases (optioneel, uit te zetten in productie)

### 4.3 Testen

- Unit tests met minimale fixtures (zoals nu).
- Integratietest: recept met "zoete aardappel" → geen violation.
- Integratietest: recept met "aardappel" → wel violation.
- Gemini: AI-suggestie voor "zoete aardappel" wordt correct gefilterd.

---

## Uitvoeringsvolgorde

| #   | Taak                                                                                | Afhankelijkheid |
| --- | ----------------------------------------------------------------------------------- | --------------- |
| 1   | DB-migratie `magician_ingredient_synonyms` + loader                                 | -               |
| 2   | Admin UI voor ingredient synonyms                                                   | 1               |
| 3   | Diet-validator: EXTRA_INGREDIENT_SYNONYMS vervangen door DB                         | 1               |
| 4   | Hardcoded `bloem` in isExcludedByOverrides verwijderen (generieke normalized match) | -               |
| 5   | LOW_SUGAR uit ruleset halen (geen hardcoded rule code)                              | -               |
| 6   | Logica-review (matchingflow, edge cases)                                            | 3, 4            |
| 7   | Gemini-prompt: dynamische lijsten uit overrides + ruleset                           | 3               |
| 8   | False-positive analyse: dataflow, filtering, logging                                | 3, 7            |
| 9   | Tests uitbreiden en integratietests                                                 | 3, 7            |

---

## Checklist “alles uit backend”

- [x] Geen `EXTRA_INGREDIENT_SYNONYMS` in diet-validator
- [x] Geen `key === 'bloem'` in isExcludedByOverrides (generieke normalized match)
- [x] Geen hardcoded rule codes – sugar rule wordt dynamisch gezocht in ruleset
- [x] Geen hardcoded voorbeelden in Gemini-prompt (dynamisch uit overrides + ruleset)
- [x] Alle exclusions uit `magician_validator_overrides`
- [x] Alle match-synoniemen uit `magician_ingredient_synonyms`
- [ ] Added-sugar terms uit ruleset/heuristics
