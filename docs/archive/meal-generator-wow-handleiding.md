# Meal Generator — Handleiding “WOW niveau”

Handleiding voor het tunen van de weekmenu-generator en het oplossen van veelvoorkomende problemen. Alle tuning verloopt via de **admin generator-config**; geen hardcoded waarden in code.

**Admin-route:** [/admin/generator-config](/admin/generator-config)

---

## 1) Wat is “de generator”?

De weekmenu-generator kan in twee modi draaien:

| Modus        | Beschrijving                                                                                                                                              | Wanneer actief                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Template** | Plan wordt opgebouwd uit templates (bowl, sheet_pan, soup, …) met ingrediënten uit **pools** (protein, veg, fat, flavor). Deterministic, DB-configurable. | Als `USE_TEMPLATE_MEAL_GENERATOR=true` (env). |
| **Gemini**   | Plan wordt gegenereerd door een AI-agent (Gemini).                                                                                                        | Als template-modus uit staat.                 |

**Relevante env-flags:**

- **`USE_TEMPLATE_MEAL_GENERATOR`** — Moet `true` zijn om Preview, Compare, Suggesties en pool-tooling te gebruiken.
- **`ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER`** — Bij `true` worden guardrails hard-block terms toegepast op de candidate pool vóór generatie (minder retries, “truthy” suggesties in “Vul pool (suggesties)”).

**Wat te doen:**

- Zet `USE_TEMPLATE_MEAL_GENERATOR=true` als je de admin generator-config en Preview/Suggesties wilt gebruiken.
- Zet `ENFORCE_VNEXT_GUARDRAILS_MEAL_PLANNER=true` als je wilt dat pool-suggesties en preview al rekening houden met dieet-specifieke block-terms.

---

## 2) De vijf configuratieblokken

In [Generator-config](/admin/generator-config) vind je vijf tabs:

| Tab              | Doel                                                                                                    | Belangrijkste knoppen                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Templates**    | Welke maaltijdtypes (bowl, sheet_pan, soup, …) actief zijn.                                             | Actief aan/uit.                                             |
| **Slots**        | Per template: min/default/max gram voor protein, veg1, veg2, fat.                                       | Per template “Slots” → grammen aanpassen.                   |
| **Pools**        | Welke ingrediënten (NEVO + flavor) per dieet en categorie (protein, veg, fat, flavor) beschikbaar zijn. | “Vul pool (suggesties)”, “Nieuw pool item”, Actief aan/uit. |
| **Naming**       | Patronen voor maaltijdnamen per dieet/template/slot; tokens zoals `{protein}`, `{veg1}`.                | Nieuw patroon, Actief aan/uit.                              |
| **Instellingen** | Caps en limieten: max ingrediënten, flavor-items, protein/template repeat caps, retry-limit.            | Presets (o.a. WOW Variatie), handmatig getallen.            |

**Wat te doen:**

- Begin bij **Pools** (voldoende items per categorie) en **Instellingen** (preset “WOW Variatie” of handmatig).
- Gebruik **Preview** om het resultaat te zien; **Suggesties** vertellen je wat te tunen.
- Gebruik **Vul pool nu** vanuit een Preview-suggestie om direct de juiste pool (veg/protein/fat) aan te vullen.

---

## 3) Quick-start: Van nul naar WOW in ~10 minuten

1. **Preview draaien** — Tab Instellingen of Pools, kies dieet (dietKey), dagen, startdatum, optioneel seed → “Preview genereren”.
2. **Suggesties bekijken** — Onder de preview: blok “Suggesties”. Lees titel + acties (bijv. “Pools te klein”, “Voeg 5–10 veg items toe”).
3. **Vul pool nu** — Bij een pool-suggestie: klik “Vul pool nu” → dialog opent met NEVO-suggesties voor die categorie → selecteer items → “Toevoegen (X)”. Herhaal voor andere categorieën indien nodig.
4. **Preset toepassen** — Tab Instellingen → Presets → bijv. “WOW Variatie” (strengere caps, meer retries) → Bevestig.
5. **Preview opnieuw** — Nieuwe preview; controleer of forced repeats en monotony zijn afgenomen. Zo nodig Compare (snapshot A vs B) met andere seed.

**Wat te doen:**

- Elke keer na pool-uitbreiding of preset-wijziging: opnieuw Preview en Suggesties checken.
- Gebruik “Vul pool nu” vanuit de suggestie in plaats van handmatig naar Pools te gaan (zelfde diet/category wordt al gezet).

---

## 4) Tuning playbooks

### Monotony (zelfde groente vaak)

- **Signaal:** Suggestie “Zelfde groente vaak herhaald” of VEG_MONOTONY in advisor.
- **Oorzaak:** Veg-pool te klein of caps te ruim, waardoor dezelfde NEVO-codes vaak gekozen worden.
- **Acties:**
  - Pools → veg-pool uitbreiden (“Vul pool (suggesties)” of “Vul pool nu” vanuit suggestie).
  - Preset “WOW Variatie” toepassen (strengere protein/template caps).
  - Optioneel: Instellingen → `template_repeat_cap_7d` / `protein_repeat_cap_7d` verlagen voor meer spreiding.

**Wat te doen:**

- Eerst veg (en evt. protein) pool vergroten; daarna caps/preset finetunen.

---

### Forced repeats (plan moet herhalen om binnen caps te blijven)

- **Signaal:** “Forced repeats in plan” of `repeatsForced` / `proteinRepeatsForced` / `templateRepeatsForced` in generator-meta.
- **Trade-off:** Pools groter maken → meer variatie maar grotere pools. Caps verhogen → minder geforceerde herhaling maar mogelijk minder spreiding.
- **Acties:**
  - **Pools vergroten** — Vooral protein/veg/fat uitbreiden (Vul pool suggesties).
  - **Caps verhogen** — Instellingen: `protein_repeat_cap_7d` en/of `template_repeat_cap_7d` iets verhogen (niet te ruim, anders monotony).
  - Advisor geeft soms concreet “meest herhaald: nevo X (Nx)” → overweeg meer alternatieven in die categorie.

**Wat te doen:**

- Eerst pools uitbreiden; alleen als dat niet genoeg is caps licht verhogen.

---

### Guardrails filter groot (veel terms / veel verwijderd)

- **Signaal:** In Preview → Generator-meta: “Guardrails terms toegepast: N” en “Verwijderd door guardrails: M items”. In “Vul pool (suggesties)” dialog: “Guardrails filter actief: N terms, verwijderd: M”.
- **Betekenis:** N = aantal hard-block terms voor dit dieet; M = aantal pool-candidaten die door die terms zijn weggefilterd (naam bevat een block-term).
- **Acties:**
  - **Veel verwijderd, weinig suggesties:** Dieet-specifieke guardrails (block terms) zijn streng. Opties: block terms in dieet/guardrails config versoepelen, of alleen niet-gebruikte NEVO-items handmatig toevoegen.
  - **Weinig verwijderd:** Normaal; suggesties zijn al “truthy” en vallen later niet alsnog door guardrails weg.

**Wat te doen:**

- Interpreteer “terms” als strengheid van het filter, “verwijderd” als impact op de pool. Bij te weinig suggesties: guardrails of pool-strategie (andere items) aanpassen.

---

### INSUFFICIENT_ALLOWED_INGREDIENTS

- **Signaal:** Foutmelding bij generatie of preview: `INSUFFICIENT_ALLOWED_INGREDIENTS` (bijv. “Pool is empty”).
- **Oorzaak:** Voor het gekozen dieet/caps zijn er te weinig toegestane ingrediënten in de pools (na merge met NEVO-candidate pool en eventueel guardrails-filter).
- **Acties:**
  - **Pools-tab:** Controleer voor het betreffende dieet of protein, veg en fat voldoende actieve items hebben (minimaal enkele per categorie). Vul aan via “Vul pool (suggesties)”.
  - **Dieet/guardrails:** Als guardrails veel wegfiltert, kan de effectieve pool te klein worden → guardrails of pool uitbreiden.
  - **Slots:** Te hoge min_g bij weinig beschikbare items kan ook tot “geen geldige combinatie” leiden; overweeg slot-grammen iets te verlagen.

**Wat te doen:**

- Eerst pools vullen (protein, veg, fat) voor het juiste diet_key; daarna eventueel guardrails of slot-grammen nalopen.

---

### MEAL_PLAN_SANITY_FAILED

- **Signaal:** Preview of generatie faalt met `MEAL_PLAN_SANITY_FAILED`; in de response zitten `issues` met codes en messages.
- **Veelvoorkomende issue-codes:**

| Code                              | Betekenis                                                     | Welke knob                                                                                         |
| --------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **PLACEHOLDER_NAME**              | Maaltijdnaam is placeholder (tbd, n/a, recept, …).            | Naming: betere/meerdere patronen; of pools/slots zodat generator betere picks doet.                |
| **INGREDIENT_COUNT_OUT_OF_RANGE** | Te weinig (<2) of te veel (>10) ingrediënten in een maaltijd. | Instellingen: `max_ingredients`; Slots: min_g/default_g/max_g per slot.                            |
| **INGREDIENT_QTY_OUT_OF_RANGE**   | quantityG buiten 1–400.                                       | Slots: min_g/max_g per slot binnen toegestane range.                                               |
| **MISSING_NEVO_CODE**             | Ingrediënt-ref zonder nevoCode.                               | Pools: alleen items met geldige nevo_code (of name-based item_key) gebruiken.                      |
| **DUPLICATE_INGREDIENT**          | Zelfde nevoCode twee keer in één maaltijd.                    | Bug in generator; blijft zeldzaam. Rapporteren indien structureel.                                 |
| **EMPTY_DAY**                     | Een dag heeft geen maaltijden.                                | Pools/caps te strikt of retry-limit te laag; pools uitbreiden of `signature_retry_limit` verhogen. |

**Wat te doen:**

- Lees de `issues` array (code + message); koppel elke code aan de juiste knob (Naming, Pools, Slots, Instellingen).
- Meestal: PLACEHOLDER_NAME → Naming + pools; INGREDIENT_COUNT → max_ingredients/slots; EMPTY_DAY → pools + retry-limit.

---

## 5) Naming: patronen en tokens

Maaltijdnamen worden opgebouwd uit **name patterns** (tab Naming): per dieet, template en slot (breakfast/lunch/dinner) kun je meerdere actieve patronen hebben. De generator kiest daar deterministisch uit (o.a. op basis van seed).

**Beschikbare tokens:**

| Token            | Vervangen door                                     |
| ---------------- | -------------------------------------------------- |
| `{protein}`      | Weergavenaam van het eiwitingrediënt (slot 0).     |
| `{veg1}`         | Weergavenaam groente 1 (slot 1).                   |
| `{veg2}`         | Weergavenaam groente 2 (slot 2).                   |
| `{flavor}`       | Weergavenaam eerste flavor-item (indien aanwezig). |
| `{templateName}` | Template naam (NL), bijv. “Bowl”.                  |

**Voorbeelden:**

- `{protein} met {veg1} & {veg2}` → “Kip met broccoli en wortel”
- `{templateName}: {protein}, {veg1} en {veg2}` → “Bowl: Kip, broccoli en wortel”
- `{protein}–{veg1} bowl met {flavor}` → “Kip–broccoli bowl met knoflook” (flavor weggelaten als leeg)

**Do:**

- Meerdere patronen per template/slot gebruiken voor variatie.
- Patronen tussen 5 en 120 tekens houden (DB-constraint).

**Don’t:**

- Geen placeholder-achtige vaste strings (“TBD”, “Recept”) als enige naam; dan faalt sanity op PLACEHOLDER_NAME.
- Flavor optioneel houden (lege `{flavor}` wordt opgeschoond); vermijd verplichte flavor in de zin als je weinig flavor-items hebt.

**Wat te doen:**

- Bij PLACEHOLDER_NAME: controleer Naming-tab en voeg duidelijke patronen toe met de tokens hierboven.
- Test met Preview of namen goed uitpakken; zo nodig extra patronen toevoegen.

---

## 6) Troubleshooting-checklist (symptoom → oorzaak → fix)

| Symptoom                                                | Mogelijke oorzaak                           | Fix                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Preview-knop werkt niet / “template-generator uit”      | Template-modus uit                          | `USE_TEMPLATE_MEAL_GENERATOR=true` zetten.                                                                    |
| Weinig of geen pool-suggesties                          | Guardrails filtert veel weg; of pool al vol | Guardrails/dieet-terms nalopen; of andere categorie/dieet. “Geen suggesties” = verruim dieet/excludes.        |
| Veel forced repeats in preview                          | Pools te klein of caps te strikt            | Pools uitbreiden (Vul pool nu); evt. caps licht verhogen.                                                     |
| Zelfde groente vaak (monotony)                          | Veg-pool te klein                           | Veg-pool uitbreiden; preset WOW Variatie of caps aanscherpen.                                                 |
| INSUFFICIENT_ALLOWED_INGREDIENTS                        | Lege of te kleine pool na merge/guardrails  | Pools vullen voor diet_key; guardrails of slot-grammen controleren.                                           |
| MEAL_PLAN_SANITY_FAILED + PLACEHOLDER_NAME              | Geen goede naam gegenereerd                 | Naming: patronen met {protein}/{veg1}/{veg2}/{flavor}/{templateName}; pools zorgen voor geldige displayNames. |
| MEAL_PLAN_SANITY_FAILED + INGREDIENT_COUNT_OUT_OF_RANGE | Te weinig/veel ingrediënten per maaltijd    | Instellingen `max_ingredients`; Slots min_g/default_g/max_g.                                                  |
| MEAL_PLAN_SANITY_FAILED + EMPTY_DAY                     | Dag zonder maaltijden                       | Pools/caps/retries; pools uitbreiden, `signature_retry_limit` verhogen.                                       |
| Generator-meta: guardrails “verwijderd” hoog            | Veel candidaten geblokt door block-terms    | Interpreteren: normaal bij strenge dieet-regels; minder suggesties of dieet-regels versoepelen.               |

---

## 7) Kwaliteits-signalen in de UI

- **Q-score per maaltijd (Preview):** Onder elke maaltijd kan “Q: N” staan. Klik “Waarom” voor de redenen (bijv. +2 protein niet gebruikt, -3 protein cap exceeded). Gebruik dit om te zien waarom een maaltijd gekozen is of net niet.
- **poolMetrics + guardrails (Preview):** In het blok “Generator-meta”: `repeatsForced`, `poolMetrics` (o.a. before/after counts, removedByGuardrailsTerms), `guardrailsExcludeTermsCount`. Deze bepalen of suggesties “truthy” zijn en hoeveel er door guardrails is weggefilterd.

**Wat te doen:**

- Bij twijfel over kwaliteit: “Waarom” per maaltijd bekijken en Generator-meta met poolMetrics/guardrails controleren.
- Guardrails “terms” en “verwijderd” gebruiken om te bepalen of je pool-strategie of dieet-regels moet aanpassen.

---

## 8) Do not hardcode — waar zit de config?

Alle tuning gebeurt via **admin-editeerbare config** in de database. Geen waarden in code wijzigen voor dagelijks tunen.

| Wat                                    | Tabel(s)                       | Toegang                            |
| -------------------------------------- | ------------------------------ | ---------------------------------- |
| Templates (actief/inactief)            | `meal_plan_templates`          | Admin Generator-config → Templates |
| Grammen per slot (min/default/max)     | `meal_plan_template_slots`     | Admin → Templates → Slots          |
| Pool-items (protein, veg, fat, flavor) | `meal_plan_pool_items`         | Admin → Pools                      |
| Caps, retry-limit, max_ingredients, …  | `meal_plan_generator_settings` | Admin → Instellingen               |
| Naam-patronen                          | `meal_plan_name_patterns`      | Admin → Naming                     |

**RLS:** Alleen admins kunnen schrijven; authenticated gebruikers kunnen actieve config lezen. Geen `SELECT *` in productie; alleen benodigde kolommen.

**Wat te doen:**

- Wijzigingen altijd via [Generator-config](/admin/generator-config) (en eventueel dieet/guardrails-config voor block terms).
- Bij nieuwe diëten: voor dat `diet_key` pools en evt. settings/name patterns aanmaken.
