# Therapeutic Supplements – Overzicht (single source of truth)

Dit document beschrijft het **supplementen-subsysteem** binnen Therapeutic: datamodel, admin- en gebruikersflows, when_json DSL, evaluatie en troubleshooting. Het is gebaseerd op de bestaande codebase; geen aannames.

**Stap 45 (doc-only):** In deze stap is **geen code gewijzigd**; alleen dit document is toegevoegd.

---

## 1. Wat is “Therapeutic Supplements” precies?

### Probleem dat het oplost

Gebruikers die een therapeutisch protocol volgen (bijv. Wahls) moeten per supplement kunnen zien:

- **Wat** wordt aanbevolen (naam, dosering, opmerkingen).
- **Welke waarschuwingen/voorwaarden/contra-indicaties** voor hen gelden (regels), en **waarom** een regel van toepassing is (uitleg op basis van profiel + intenties).

Zonder dit subsysteem zou elke regel of elk supplement in code vastgelegd moeten worden. Met dit subsysteem beheert een **admin** protocollen, supplementen en regels in de database; **gebruikers** zien alleen wat voor hun profiel en intenties relevant is.

### Wat een gebruiker ziet vs wat een admin beheert

| Aspect               | Gebruiker                                                      | Admin                                                                                        |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Protocollen          | Alleen actieve; keuze in Instellingen                          | CRUD op `/admin/therapeutic-protocols`                                                       |
| Supplementen         | Lijst + dosering/notes van het gekozen protocol                | Per protocol: toevoegen/bewerken/verwijderen, actief/uit                                     |
| Regels               | Alleen toepasselijke regels + “Waarom”-uitleg                  | Per supplement: regels met when_json, message_nl, kind/severity                              |
| When_json / snippets | Geen; alleen server-side evaluatie + matched conditions        | Regels bewerken, when_json invullen, snippets kiezen; snippets beheren in When JSON-snippets |
| Overrides            | “Mijn supplement intenties” + target-overrides in Instellingen | Niet; overrides zijn per gebruiker                                                           |

### Wat is v1 en wat bewust (nog) niet

- **v1:** Protocol → supplementen → regels (DB); when_json DSL; evaluatie op basis van health profile + overrides; “Waarom” (matched conditions, max 2 regels in UI); Settings: therapeutisch profiel, intent-overrides (flat keys), target-overrides; Admin: protocollen, protocol-editor (targets, supplementen op eigen pagina’s, regels), When JSON-snippets; Wahls-seed (protocol + supplementen + regels).
- **Bewust niet (o.a.):** Geen when_json-parsing in de browser; geen volledige context-dump in UI; geen medicatie-/interactie-database (alleen override-flags zoals `meds.aspirin`); geen automatische “neem dit supplement”-planning in weekmenu (alleen weergave/samenvatting waar van toepassing).

---

## 2. Datamodel & tabellen

### therapeutic_protocols

- **Doel:** Admin-definieerde protocollen (bijv. Wahls, MS v1).
- **Relevante kolommen:** `id` (PK), `protocol_key` (UNIQUE), `name_nl`, `description_nl`, `version`, `is_active`, `source_refs` (JSONB), `updated_at`.
- **Constraints:** `idx_therapeutic_protocols_protocol_key` UNIQUE op `protocol_key`.
- **Actief/inactief:** `is_active = true` → zichtbaar voor gebruikers in protocolkeuze; anders alleen voor admin.
- **RLS:** Authenticated SELECT alleen `is_active = true`; admins hebben FOR ALL.
- **Routes/actions:** Admin: `src/app/(app)/admin/therapeutic-protocols/` (lijst + editor); `getTherapeuticProtocolEditorAction`, protocol-CRUD in `therapeuticProtocols.actions.ts` en `therapeuticProtocolEditor.actions.ts`. Service: `listActiveProtocols`, `getActiveTherapeuticProfile` in `src/lib/therapeutic/therapeuticProfile.service.ts`.

### therapeutic_protocol_targets (alleen context)

- Doel: Streefwaarden per protocol (daily/weekly, macro/micro/…). Geen supplementen; welzelfde protocol-hiërarchie.
- Relatie: `protocol_id` → `therapeutic_protocols(id)` ON DELETE CASCADE.
- Gebruikt door: target-snapshot, coverage, meal plan therapeutic summary. Overrides voor targets: zie `user_therapeutic_profiles.overrides` (key-formaat `period:targetKind:targetKey`).

### therapeutic_protocol_supplements

- **Doel:** Supplementen die bij een protocol horen (naam, dosering, notities).
- **Relevante kolommen:** `id` (PK), `protocol_id` (FK → therapeutic_protocols ON DELETE CASCADE), `supplement_key`, `label_nl`, `dosage_text`, `notes_nl`, `is_active`, `updated_at`.
- **Constraints:** UNIQUE `(protocol_id, supplement_key)`.
- **Actief/inactief:** `is_active = true` → supplement (en zijn regels) komen in aanmerking voor gebruikers; RLS voor rules vereist ook actief protocol + actief supplement.
- **RLS:** Authenticated SELECT alleen actieve rijen bij een actief protocol; admins FOR ALL.
- **Routes/actions:** Admin: protocol-editor → tab Supplementen → link naar `…/supplements/new` en `…/supplements/[supplementId]/edit`. Actions: `upsertTherapeuticSupplementAction`, `deleteTherapeuticSupplementAction`, `toggleTherapeuticSupplementActiveAction` in `therapeuticProtocolEditor.actions.ts`. Service: `getProtocolSupplements` in `therapeuticProfile.service.ts`.

### therapeutic_protocol_supplement_rules

- **Doel:** Regels per protocol+supplement (waarschuwing/voorwaarde/contra-indicatie), optioneel when_json voor wanneer de regel geldt.
- **Relevante kolommen:** `id` (PK), `protocol_id`, `supplement_key`, `rule_key`, `kind` (warning/condition/contraindication), `severity` (info/warn/error), `when_json` (JSONB, optioneel), `message_nl` (5–400 tekens), `is_active`, `updated_at`.
- **Constraints:** UNIQUE `(protocol_id, supplement_key, rule_key)`; FK `(protocol_id, supplement_key)` → `therapeutic_protocol_supplements` ON DELETE CASCADE.
- **Actief/inactief:** `is_active = true`; daarnaast vereist RLS actief protocol + actief supplement.
- **RLS:** Authenticated SELECT alleen als rule + protocol + supplement actief zijn; admins FOR ALL.
- **Routes/actions:** Admin: supplement-editpagina (regeltabel + regelmodal). Actions: `upsertTherapeuticSupplementRuleAction`, `deleteTherapeuticSupplementRuleAction`, `toggleTherapeuticSupplementRuleActiveAction`; `getTherapeuticProtocolEditorAction` laadt rules (+ whenJsonStatus). Service: `getProtocolSupplementRules`, `getApplicableProtocolSupplementRules`, `filterSupplementRulesForUser` in `therapeuticProfile.service.ts`.

### therapeutic_when_json_snippets

- **Doel:** Herbruikbare when_json-templates voor regels (geen businessdata in code).
- **Relevante kolommen:** `id` (PK), `snippet_key` (UNIQUE), `label_nl`, `description_nl`, `template_json` (JSONB), `is_active`, `updated_at`.
- **Constraints:** UNIQUE op `snippet_key`; check op lengte label_nl/description_nl.
- **Actief/inactief:** `is_active = true` → alleen actieve snippets in policy voor niet-admin; admins zien alle (FOR ALL).
- **RLS:** Authenticated SELECT alleen `is_active = true`; admins FOR ALL.
- **Routes/actions:** Admin: `/admin/therapeutic-when-json-snippets`. Editor laadt snippets via `getTherapeuticProtocolEditorAction`; in regelmodal kun je een snippet kiezen om when_json in te vullen. Validatie met `whenJsonSchema` in o.a. `src/lib/therapeutic/whenJson.schema.ts` en in snippet-admin.

### user_therapeutic_profiles.overrides

- **Doel:** Gebruikersspecifieke overrides gekoppeld aan het actieve protocol (target-overrides + intent-overrides in één JSONB).
- **Kolom:** `overrides` (JSONB) op de actieve rij in `user_therapeutic_profiles`.
- **Geen vaste structuur in DB:** Keys en waarden zijn dynamisch (uit protocol/regels); max 200 keys (validatie in `upsertMyTherapeuticOverridesAction`).
- **RLS:** User beheert eigen profiel (SELECT/INSERT/UPDATE eigen rijen); admins alleen SELECT.
- **Routes/actions:** Settings: `getMyTherapeuticOverridesAction`, `upsertMyTherapeuticOverridesAction` in `src/app/(app)/settings/actions/therapeuticProfile.actions.ts`. Service: `getActiveTherapeuticOverrides`, `upsertActiveTherapeuticOverrides` in `therapeuticProfile.service.ts`. Target-overrides worden toegepast in `buildTherapeuticTargetsSnapshot` (`applyOverridesToTargets`); intent-overrides gaan in `UserRuleContext` voor regel-evaluatie.

---

## 3. Admin-flow (end-to-end)

### Waar beheert admin supplementen en regels?

- **Protocollenlijst:** `/admin/therapeutic-protocols` → `TherapeuticProtocolsAdminClient.tsx`.
- **Protocol openen:** `/admin/therapeutic-protocols/[protocolId]` → targets (tab), supplementen (tab), bronnen (tab). Supplementen: link “Supplement toevoegen” → `/admin/therapeutic-protocols/[protocolId]/supplements/new`; per rij link naar `…/supplements/[supplementId]/edit`.
- **Nieuw supplement:** `supplements/new/page.tsx` + `SupplementNewPageClient.tsx`; formulier → `upsertTherapeuticSupplementAction` → redirect naar edit.
- **Supplement bewerken:** `supplements/[supplementId]/edit/page.tsx` + `SupplementEditPageClient.tsx`: formulier (code vast) + regeltabel + “Regel toevoegen” / bewerken in modal.

### Rule modal, when_json, validator preview, status

- **Rule modal:** Op de supplement-editpagina: “Nieuwe regel” / “Bewerk” opent een modal met o.a. Regel (rule_key), Type (kind), Ernst (severity), message_nl, Sjabloon (dropdown), Voorwaarde – JSON (optioneel), Actief.
- **When_json:** Vrij JSON-veld; moet voldoen aan `whenJsonSchema` (object met optioneel `all`, `any`, `not`). Zie sectie 5.
- **Validator preview:** Onder het when_json-veld toont de admin-UI een live status (zelfde logica als `getWhenJsonStatus` in `therapeuticProtocolEditor.actions.ts`):
  - Leeg → “Geen voorwaarden”
  - Ongeldige JSON (parse error) → “Ongeldige JSON” + hint
  - Geldige JSON maar ongeldige DSL-shape (Zod fail) → “Ongeldige DSL-shape” + max. 2 Zod-issues
  - Geldige shape → “OK” + welke top-level keys (all/any/not) aanwezig zijn
- **Status “Ongeldig”:** Wanneer when_json niet parseert of niet door `whenJsonSchema` komt; in de regeltabel kan een badge “Ongeldig” getoond worden op basis van `whenJsonStatus` uit de editor-data.

### Snippets in de UX

- **Waar:** Admin → When JSON-snippets (`/admin/therapeutic-when-json-snippets`) om snippets aan te maken/bewerken. In de **regelmodal** (supplement bewerken): dropdown “Sjabloon” (“— Kies sjabloon —”); bij keuze wordt het veld “Voorwaarde – JSON” ingevuld met `template_json` van het snippet; daarna aanpasbaar.
- **Validatie:** Snippet-template wordt bij opslaan in snippet-admin gevalideerd met `whenJsonSchema`; in protocol-editor vult het alleen het when_json-veld (geen aparte snippet-validatie in de regelmodal, wel when_json-validator onder het veld).

### Fouten die admin kan veroorzaken

- **Ongeldige when_json:** Regel wordt door evaluator als invalid beschouwd (fail-closed); telt mee in `rulesMeta.invalidWhenJson`; gebruiker ziet melding “X regels hebben een ongeldige voorwaarde”.
- **Rule/supplement/protocol inactief:** Regel of supplement wordt niet getoond aan gebruikers; protocol inactief verbergt het hele protocol.
- **Dubbele (protocol_id, supplement_key, rule_key):** UNIQUE constraint; insert/update faalt met DB-fout.

---

## 4. User-flow (end-to-end)

### Waar ziet de gebruiker supplementen?

- **Instellingen → Therapeutisch profiel** (`/settings#therapeutic-profile`): na keuze van een actief protocol worden de bijbehorende **targets** en **supplementen** getoond. Onder elk supplement: lijst van **toepasselijke regels** (message_nl, kind/severity) en optioneel **“Waarom”** (max 2 regels uitleg). Sectie **“Mijn supplement intenties”** toont override-inputs die uit de when_json van de regels worden afgeleid (flat keys, primitives).

### “Mijn supplement intenties” – wat het is en hoe het technisch werkt

- **Betekenis:** Gebruiker kan per “intentie”-key (bijv. `supplements.vitamin_d.intended_amount`, `meds.aspirin`) een waarde invullen (number of boolean). Die waarden gaan in `user_therapeutic_profiles.overrides` en bepalen mee of een regel van toepassing is (when_json override-conditions).
- **Technisch:** `extractOverrideInputsFromRules(rules)` in `SettingsPageContent.tsx` scant alle when_json van de geladen regels, verzamelt override-conditions met een key en leidt het type af (number/boolean). Daaruit komen `OverrideInputSpec[]` (key + kind). De UI toont per key een input (number of switch); waarden worden in `overridesDraft` (flat object) gezet en opgeslagen via `upsertMyTherapeuticOverridesAction`. Geen when_json-parsing in de browser; keys komen alleen uit de door de server geleverde regels.

### Override keys

- **Target overrides (streefwaarden):** Key = `${period}:${targetKind}:${targetKey}` (bijv. `daily:macro:protein`). Waarde = object `{ valueNum, unit?, valueType? }`. Zie `overrideKey()` in `SettingsPageContent.tsx` en `applyOverridesToTargets` in `buildTherapeuticTargetsSnapshot.ts`; alleen entries die voldoen aan `OverrideEntry` (o.a. `valueNum` number, finite, >= 0) worden toegepast.
- **Intent overrides (supplement/meds):** Flat keys met primitieve waarden (number of boolean), bijv. `supplements.vitamin_d.intended_amount` (number), `supplements.b_complex.is_active` (boolean), `meds.aspirin`, `meds.blood_thinner` (boolean). Gebruikt in when_json als `field: "override"`, `key: "supplements.vitamin_d.intended_amount"`, `op: "gte"`, `value: 2000`, enz.

### “Waarom” (explain) – opbouw en veiligheid

- **Opbouw:** Server (`filterSupplementRulesForUser` / `evaluateWhenJson`) bepaalt per toepasselijke regel met when_json welke condities “true” waren en stopt max. 6 daarvan in `ruleMetaById[rule.id].matched`. Action `loadMyActiveTherapeuticProtocolDetailsAction` levert `rulesWhy: ruleMetaById` mee. UI toont per regel max. **2** regels uitleg (`MAX_WHY_LINES = 2` in `SettingsPageContent.tsx`), geformatteerd via `formatMatchedConditionLine` (veldnaam/override key, op, expected; optioneel “(jij: actual)” als actual veilig is).
- **Veiligheid:** Geen dump van de volledige context; alleen de primitives van de gematchede condities; max 6 server-side, max 2 in UI; geen when_json in de frontend.

---

## 5. when_json DSL (praktisch + voorbeelden)

### Ondersteunde shape

- Root: object met optioneel **`all`**, **`any`**, **`not`** (niet tegelijk; array op root is ongeldig).
- **`all`:** array van condities; alle moeten true zijn.
- **`any`:** array van condities; minstens één moet true zijn.
- **`not`:** één conditie; regel geldt als die false is (geen matched conditions voor “Waarom”).

### Conditietypes

- **Field-conditions:** `field` één van `sex`, `ageYears`, `heightCm`, `weightKg`, `dietKey`, `protocolKey`, `protocolVersion`. `dietKey` is gereserveerd (nu undefined in context).
- **Override-conditions:** `field: "override"`, `key` (string), `op`, optioneel `value`. Key is vrij (bijv. `supplements.vitamin_d.intended_amount`, `meds.aspirin`).

### Operatoren

- Field + override: `eq`, `neq`, `gte`, `lte`, `in`. Override ook: `exists`.
- **gte/lte:** Alleen numeriek; anders fail-closed (regel invalid, telt als invalidWhenJson).
- **in:** value is array; membership-check.

### Copy-paste voorbeelden (valide bij whenJsonSchema)

**Medicatie (aspirin / blood_thinner) – any + exists:**

```json
{
  "any": [
    { "field": "override", "key": "meds.blood_thinner", "op": "exists" },
    { "field": "override", "key": "meds.aspirin", "op": "exists" }
  ]
}
```

**Intended amount threshold (vitamine D ≥ 2000):**

```json
{
  "all": [
    {
      "field": "override",
      "key": "supplements.vitamin_d.intended_amount",
      "op": "gte",
      "value": 2000
    }
  ]
}
```

**Gecombineerd (all + any):** Zie `docs/therapeutic-supplement-rules-dsl.md` – voorbeeld “any + override exists + override gte” (vitamin_d gte 2000 of blood_thinner exists).

Schema: `src/lib/therapeutic/whenJson.schema.ts`.

---

## 6. Evaluatie & filtering (server)

### Context (UserRuleContext)

- Opgebouwd in `loadMyActiveTherapeuticProtocolDetailsAction`: `sex`, `heightCm`, `weightKg` uit health profile; `ageYears` via `ageYearsFromBirthDate(healthRow?.birth_date)`; `overrides` uit `getActiveTherapeuticOverrides`; `protocolKey`, `protocolVersion` (version geparsed als number); `dietKey: undefined`.
- Gebruikt in `getApplicableProtocolSupplementRules` → `filterSupplementRulesForUser` → `evaluateWhenJson` per regel.

### ageYears

- `ageYearsFromBirthDate(birthDate)` in `therapeuticProfile.service.ts`: gehele jaren vanaf birth_date t.o.v. nu (UTC); invalid/missing date → undefined.

### Ongeldige when_json (fail-closed)

- Bij parse-fout of whenJsonSchema.safeParse fail: `evaluateWhenJson` retourneert `{ applicable: false, invalid: true }`.
- Regel telt niet als toepasselijk; wel meegeteld in `meta.invalidWhenJson`. Geen crash; geen when_json in response naar UI.

### rulesMeta

- **SupplementRulesFilterMeta:** `total`, `applicable`, `skipped`, `invalidWhenJson`. `skipped` = regels met when_json die niet waar zijn; `invalidWhenJson` = regels met ongeldige when_json.
- Teruggegeven door `getApplicableProtocolSupplementRules` / `filterSupplementRulesForUser`; in details als `rulesMeta`; UI toont o.a. “X regels niet van toepassing” en “X regels hebben een ongeldige voorwaarde”.

### rulesWhy / matched conditions

- **ruleMetaById:** Per rule.id (alleen bij toepasselijke regels met when_json) een object `{ matched: MatchedCondition[] }`. Max 6 matched conditions per regel (MAX_MATCHED_CONDITIONS_PER_RULE in service). Voor `not` geen matched.
- **rulesWhy:** In response = `ruleMetaById`; UI toont max 2 regels per regel (MAX_WHY_LINES).

---

## 7. Seed / Wahls

### Seed-migrations

- **20260231000038_seed_wahls_supplements_and_rules.sql:** Idempotent. Voegt protocol `wahls_mitochondria_v1` toe (ON CONFLICT DO NOTHING); 15 supplementen in `therapeutic_protocol_supplements`; 5 regels in `therapeutic_protocol_supplement_rules` (vitamin_d HIGH_DOSE_SUPERVISION, iodine THYROID_CAUTION, omega3 BLOOD_THINNING_CAUTION, methyl_folate TOO_MUCH_FOLATE_WITH_B_COMPLEX, probiotics LABEL_CAUTION).
- **20260231000033_therapeutic_profiles_schema.sql:** Basis-tabellen (protocols, targets, supplements, user_health_profiles, user_therapeutic_profiles). Geen Wahls-content.

### Override keys die Wahls-seed verwacht (Settings UI)

- Uit when_json van de seed: `supplements.vitamin_d.intended_amount` (number, gte 2000), `supplements.b_complex.is_active` (exists), `meds.blood_thinner`, `meds.aspirin` (exists). Documentatie: `docs/therapeutic-wahls-supplement-seed.md` (override keys + flat voorbeeld-JSON).

### Hiaten voor “complete Wahls supplement guidance” (zonder te implementeren)

- Geen automatische koppeling weekmenu ↔ supplement-inname; geen reminder “neem X vandaag”.
- Geen medicatie-database; alleen gebruikers-ingevulde flags in overrides.
- Geen doserings-tracker of -historie.
- Snippets voor when_json zijn handmatig aan te maken; seed levert geen snippets.

---

## 8. Troubleshooting / FAQ

- **Waarom zie ik geen regels?**  
  Controleren: (1) Actief protocol gekozen, (2) Health profile + overrides waar nodig voor when_json, (3) when_json valide (geen “Ongeldig”), (4) Regel + supplement + protocol allemaal actief, (5) RLS (ingelogd, protocol actief).

- **Waarom zie ik “Ongeldig”?**  
  when_json voldoet niet aan whenJsonSchema (bijv. array op root, verkeerde conditie-shape, verkeerd type bij gte/lte). Admin: regel bewerken, validator onder when_json-veld gebruiken, corrigeren.

- **Waarom zie ik geen “Waarom”?**  
  Geen matched conditions (bijv. regel zonder when_json; of when_json met alleen `not`; of max 6/2 limit). Check of `details.rulesWhy[rule.id].matched` wordt meegegeven en of regel when_json heeft.

- **Hoe test ik dit handmatig?**  
  Zie `docs/therapeutic-acceptance-run.md`: stappen voor admin (protocollen, snippets, supplementen, regels), gebruiker (therapeutisch profiel, intenties, regels + “Waarom”), weekmenu (TherapeuticSummaryCard), edge cases.

---

## 9. Appendix: Relevante bestanden

### Actions

- `src/app/(app)/admin/therapeutic-protocols/actions/therapeuticProtocols.actions.ts` – protocol-lijst, toggle actief.
- `src/app/(app)/admin/therapeutic-protocols/[protocolId]/actions/therapeuticProtocolEditor.actions.ts` – editor-data, targets/supplements/rules/snippets CRUD, getWhenJsonStatus.
- `src/app/(app)/admin/therapeutic-when-json-snippets/actions/therapeuticWhenJsonSnippets.actions.ts` – snippets CRUD, whenJsonSchema-validatie.
- `src/app/(app)/settings/actions/therapeuticProfile.actions.ts` – profiel, protocolkeuze, loadMyActiveTherapeuticProtocolDetailsAction, overrides.

### Services

- `src/lib/therapeutic/therapeuticProfile.service.ts` – health, protocols, targets, supplements, rules, context, evaluateWhenJson, filterSupplementRulesForUser, getApplicableProtocolSupplementRules, overrides, ageYearsFromBirthDate.
- `src/lib/therapeutic/whenJson.schema.ts` – whenJsonSchema, conditionSchema.
- `src/lib/therapeutic/buildTherapeuticTargetsSnapshot.ts` – snapshot met targets + overrides (applyOverridesToTargets, OverrideEntry, normaliseOverrides).

### UI (admin)

- `src/app/(app)/admin/therapeutic-protocols/components/TherapeuticProtocolsAdminClient.tsx` – protocollenlijst.
- `src/app/(app)/admin/therapeutic-protocols/[protocolId]/page.tsx`, `components/TherapeuticProtocolEditorClient.tsx` – protocol-editor (targets, supplementen-links, bronnen).
- `src/app/(app)/admin/therapeutic-protocols/[protocolId]/supplements/new/page.tsx`, `src/app/(app)/admin/therapeutic-protocols/[protocolId]/supplements/SupplementNewPageClient.tsx` – nieuw supplement.
- `src/app/(app)/admin/therapeutic-protocols/[protocolId]/supplements/[supplementId]/edit/page.tsx`, `src/app/(app)/admin/therapeutic-protocols/[protocolId]/supplements/SupplementEditPageClient.tsx` – supplement + regels + regelmodal (when_json, snippet-dropdown, validator).
- `src/app/(app)/admin/therapeutic-when-json-snippets/page.tsx`, `TherapeuticWhenJsonSnippetsAdminClient.tsx` – snippet-beheer.

### UI (gebruiker)

- `src/app/(app)/settings/SettingsPageContent.tsx` – Therapeutisch profiel, targets, supplementen, regels, “Waarom”, Mijn supplement intenties, override-inputs (extractOverrideInputsFromRules, overrideKey), overridesDraft, MAX_WHY_LINES, formatMatchedConditionLine.

### Docs

- `docs/therapeutic-acceptance-run.md` – acceptatietest, release checklist.
- `docs/therapeutic-supplement-rules-dsl.md` – when_json DSL, contextvelden, copy-paste voorbeelden, “Waarom”, admin-validator.
- `docs/therapeutic-wahls-supplement-seed.md` – Wahls-protocol, supplementen, regels, override keys, flat voorbeeld-JSON.

### Tests

- `src/lib/therapeutic/whenJson.schema.test.ts` – whenJsonSchema, evaluator, matched conditions.
- `src/lib/therapeutic/buildTherapeuticTargetsSnapshot.test.ts` – overrides op targets (o.a. key\_\_absolute).
- `src/lib/therapeutic/therapeuticCoverageEstimator.test.ts` – coverage-berekening.
- `src/app/(app)/meal-plans/components/TherapeuticSummaryCard.smoke.test.ts` – smoke voor summary card.

### Migrations (therapeutic)

- `20260231000033_therapeutic_profiles_schema.sql` – protocols, targets, supplements, user_health_profiles, user_therapeutic_profiles, RLS.
- `20260231000034_set_active_therapeutic_protocol_rpc.sql` – RPC voor actief protocol.
- `20260231000037_therapeutic_supplement_rules.sql` – supplement_rules-tabel, RLS.
- `20260231000038_seed_wahls_supplements_and_rules.sql` – Wahls-protocol + supplementen + regels.
- `20260231000040_therapeutic_when_json_snippets.sql` – snippets-tabel, RLS.

---

## 10. Wat is er nu geïmplementeerd (v1) en wat expliciet niet?

**Geïmplementeerd (v1):**

- Protocollen, targets, supplementen, regels, when_json DSL, snippets (admin).
- User: therapeutisch profiel, protocolkeuze, targets + supplementen + toepasselijke regels, “Waarom” (max 2 regels), Mijn supplement intenties (override-inputs uit when_json), target-overrides.
- Evaluatie server-side met UserRuleContext; fail-closed bij ongeldige when_json; rulesMeta (total, applicable, skipped, invalidWhenJson); rulesWhy (matched, max 6 server, max 2 UI).
- Admin: protocollenlijst, protocol-editor (targets, supplementen op eigen pagina’s, regels in supplement-edit), When JSON-snippets; validator-preview voor when_json; link naar snippets vanuit therapeutic-admin.
- Wahls-seed (protocol + 15 supplementen + 5 regels); flat override keys in Settings; documentatie (acceptance-run, DSL, Wahls-seed).

**Expliciet niet geïmplementeerd:**

- When_json of volledige context in de browser; meer dan 2 “Waarom”-regels in UI; meer dan 6 matched per regel server-side.
- Vaste medicatie-/interactie-database; alleen override-keys (bijv. meds.\*) door gebruiker in te vullen.
- Automatische “neem dit supplement vandaag” in weekmenu; doseringslog of herinneringen.
- dietKey in context (gereserveerd, altijd undefined).
- Ondersteuning voor meerdere actieve protocollen per gebruiker (één actief profiel per user).

---

_Dit document is gegenereerd in het kader van Stap 45 (doc-only). Er is in deze stap geen code gewijzigd._
