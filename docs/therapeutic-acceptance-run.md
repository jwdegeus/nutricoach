# Therapeutic Fase A – Acceptance run

End-to-end verificatie van de therapeutic flow (geen mealplanner-refactor of recipe-first). Uitvoerbaar met alleen dit document.

---

## 1. Doel & precondities

- **Doel:** Controleren dat admin-configuratie, gebruikersinstellingen en weekmenu-weergave voor therapeutic correct werken.
- **Precondities:**
  - [ ] Migraties zijn uitgevoerd (o.a. therapeutic_protocols, therapeutic_profiles, therapeutic_when_json_snippets, therapeutic_adh_reference_values, therapeutic_protocol_supplement_rules).
  - [ ] Er is een **admin-user** (zie `docs/set-admin-role.md`).
  - [ ] Er is een **test-user** (niet-admin) voor settings en meal plan.

---

## 2. Admin-checks

Uitvoeren als admin. Start op `/admin`.

- [ ] **Protocollen:** Ga naar `/admin/therapeutic-protocols`. Lijst laadt; je kunt een protocol openen.
- [ ] **Protocol-editor (targets, supplements, rules):** Open een protocol (`/admin/therapeutic-protocols/[id]`). Tab Streefwaarden: doelen zijn zichtbaar/bewerkbaar. Tab Supplementen: lijst laadt; “Supplement toevoegen” gaat naar `/admin/therapeutic-protocols/[id]/supplements/new`; bewerken gaat naar `…/supplements/[supplementId]/edit` (eigen pagina, incl. regels). Opslaan werkt.
- [ ] **When JSON-snippets:** Ga naar `/admin/therapeutic-when-json-snippets`. Lijst laadt; nieuw sjabloon toevoegen, bewerken en actief/uit zetten werkt. Template-validator toont OK of fout.
- [ ] **ADH-referenties:** Ga naar `/admin/therapeutic-adh`. Referentiewaarden zijn zichtbaar; toevoegen/bewerken/actief zetten werkt.

---

## 3. Gebruikersinstellingen (test-user)

Uitvoeren als niet-admin test-user.

- [ ] **Therapeutisch profiel:** Ga naar `/settings#therapeutic-profile`. Sectie “Therapeutisch profiel” is zichtbaar; geboortedatum, geslacht, lengte, gewicht en **protocol** zijn in te vullen/bij te werken.
- [ ] **Targets zichtbaar:** Na het kiezen van een protocol zijn de bijbehorende doelen (macro’s/micro’s) zichtbaar in de UI.
- [ ] **Overrides:** Override-velden (indien aanwezig) zijn bewerkbaar en worden opgeslagen.
- [ ] **Mijn supplement intenties:** Sectie “Mijn supplement intenties” of gelijknamige intenties zijn zichtbaar en bewerkbaar.
- [ ] **Supplement rules + “Waarom”:** Regels met when_json tonen bij toepasselijke regels een korte “Waarom”-uitleg (matched conditions); geen fout bij ontbrekende when_json.

---

## 4. Weekmenu (meal plan)

Als test-user: zorg dat er een actief therapeutisch profiel + protocol is en ten minste één weekmenu bestaat.

- [ ] **TherapeuticSummaryCard – week-blok:** Op `/meal-plans/[planId]` is het therapeutic-weekblok zichtbaar (samenvatting voor de week).
- [ ] **Per-dag:** Per-dag informatie (targets/coverage) is zichtbaar waar van toepassing.
- [ ] **Deficits / suggesties:** Tekorten of suggesties (indien getoond) kloppen met het gekozen protocol en profiel.
- [ ] **Macro/veg coverage:** Macro- en veg-coverage worden correct weergegeven (geen lege/gekke waarden bij geldige data).

---

## 5. Edge cases

- [ ] **Geen protocol gekozen:** Bij geen actief protocol gedraagt de therapeutic-UI zich netjes (geen crash; duidelijke lege staat of melding).
- [ ] **Ongeldige when_json:** Een regel met ongeldige when_json (bijv. verkeerde structuur) leidt niet tot een crash; waar mogelijk wordt “Ongeldig” of een veilige fallback getoond.
- [ ] **Geen estimatedMacros:** Plan zonder estimatedMacros toont geen fout in de therapeutic-samenvatting; lege of “n.v.t.”-weergave is acceptabel.

---

## 6. Buglog-template

Noteer bevindingen direct in onderstaand formaat (kopieer de tabel of rijen).

**Stap 41 QA-fixes (afgehandeld):**

| Stap                               | Verwachting                                              | Werkelijk                                                              | Fix                                                                                       |
| ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Admin – when_json status           | Ongeldige DSL-structuur toont “Ongeldig” badge + callout | Alleen JSON.parse werd gecontroleerd; verkeerde shape toonde “OK”      | `therapeuticProtocolEditor.actions.ts`: getWhenJsonStatus gebruikt nu whenJsonSchema      |
| Settings – number inputs           | Geen “NaN” in lengte/gewicht                             | Bij ontbrekende/ongeldige backend-waarde kon “NaN” in veld verschijnen | `SettingsPageContent.tsx`: initiële heightCm/weightKg alleen zetten bij Number.isFinite() |
| Meal plan – TherapeuticSummaryCard | Geen gekke waarden in per-dag macro-regel                | targetNum undefined kon “Xg / undefined g” tonen                       | `TherapeuticSummaryCard.tsx`: regel alleen renderen als Number.isFinite(targetNum)        |

**Stap 43 handmatige QA (code review):** Acceptance-run paden doorlopen (admin protocols/snippets/ADH, settings therapeutic, meal plan TherapeuticSummaryCard, edge cases). Geen P1-issues; geen P2 gelogd.

| Stap | Verwachting | Werkelijk | Screenshot? | Route | userId? | Severity |
| ---- | ----------- | --------- | ----------- | ----- | ------- | -------- |
|      |             |           |             |       |         | P2 / P1  |

- **Stap:** Korte verwijzing naar teststap (bijv. “Admin – Snippets aanmaken”).
- **Verwachting:** Wat zou moeten gebeuren.
- **Werkelijk:** Wat er gebeurt.
- **Screenshot?:** Pad of link naar screenshot (optioneel).
- **Route:** Pagina waar het optrad (bijv. `/admin/therapeutic-when-json-snippets`).
- **userId?:** Optioneel; alleen als relevant voor repro.
- **Severity:** P2 = normaal, P1 = blokkerend.

---

## 7. Seed v2 + Supplementen-samenvatting (Stap 38 QA)

Na migratie `20260231000041_seed_wahls_supplements_and_rules_v2.sql` en implementatie supplementen-samenvatting in meal plans.

### 7.1 Seed (DB)

- [ ] Migratie v2 is uitgevoerd. In Supabase:
  - [ ] `therapeutic_protocols` bevat rij met `protocol_key = 'wahls_mitochondria_v1'`.
  - [ ] `therapeutic_protocol_supplements`: ≥ 21 rijen voor dit protocol (v1 + v2 kunnen samen > 21 zijn door overlap).
  - [ ] `therapeutic_protocol_supplement_rules`: ≥ 11 rijen voor dit protocol.
- [ ] Idempotentie: migratie nogmaals draaien geeft geen duplicaten (ON CONFLICT DO NOTHING).

### 7.2 User-flow (Settings)

- [ ] Settings → Therapeutisch profiel: koppel test-user aan **Wahls – Mitochondria (v1)** (actief profiel).
- [ ] Supplementen zijn zichtbaar (read-only lijst); sectie **Mijn supplement intenties** toont inputs (o.a. vitamin_d.intended_amount, meds.aspirin, conditions.\*).
- [ ] Overrides opslaan en pagina herladen: waarden blijven staan.

### 7.3 Meal plan integration

- [ ] Genereer een **nieuw weekmenu** (agent-pad).
- [ ] Open `/meal-plans/[planId]`:
  - [ ] TherapeuticSummaryCard toont onderaan het compacte blok **Supplementen**.
  - [ ] Regel: “X waarschuwingen · Y aandachtspunten” (errorCount / warnCount).
  - [ ] Als er toepasselijke regels zijn: max 3 bullets (`topMessagesNl`).
  - [ ] Als `totalApplicableRules === 0`: tekst “Geen waarschuwingen op basis van je profiel.”
- [ ] Geen extra fetch: page.tsx haalt geen therapeutic-details action op; data komt uit `plan.metadata.therapeuticSupplementsSummary`.
- [ ] Geen JSON of when_json zichtbaar in de UI.

### 7.4 Metadata-check (optioneel)

- [ ] In DB of via response: `plan_snapshot.metadata.therapeuticSupplementsSummary` is gevuld met o.a. `totalSupplements > 0`, `warnCount`, `errorCount`, `topMessagesNl` (max 3).

---

## Release checklist

- [ ] Alle therapeutic-migraties zijn toegepast op de doelomgeving (o.a. therapeutic_protocols, therapeutic_profiles, therapeutic_when_json_snippets, therapeutic_adh_reference_values, therapeutic_protocol_supplement_rules).
- [ ] Optioneel: Wahls-seed v1 (`20260231000038`) en/of v2 (`20260231000041_seed_wahls_supplements_and_rules_v2.sql`) voor startcontent.
- [ ] Admin-data is ingevuld: minstens één actief protocol; wanneer gewenst snippets en ADH-referenties.
- [ ] Tests draaien: `npm run test` (of het in het project gebruikte testcommando).

---

_Scope: Therapeutic Fase A. Laatste update: zie git._
