# Diet Logic & Dieetregels – Implementatieplan

**Doel**: **Dieetregels** modelleren als **Diet Logic** (DROP / FORCE / LIMIT / PASS) per Wahls-niveau (1, 2, 3) in de bestaande codebase inpassen.

---

## 1. Huidige situatie (kort)

| Onderdeel | Huidige staat |
|-----------|----------------|
| **diet_category_constraints** | `constraint_type`: forbidden/required, `rule_action`: allow/block, `rule_priority`, `min_per_day`, `min_per_week`. UNIQUE(diet_type_id, category_id, rule_action). |
| **ingredient_categories** | Global, o.a. wahls_leafy_greens, wahls_forbidden_gluten, wahls_limited_legumes. `category_type` alleen forbidden/required. |
| **diet_types** | Één "Wahls Paleo" (Level 2). Geen aparte "Wahls Diet" (L1) of "Wahls Paleo Plus" (L3). |
| **GuardRule (guardrails-vnext)** | `action`: allow \| block. Geen drop/force/limit/pass. |
| **Meal planner** | `deriveDietRuleSet(profile)` in `diet-rules.ts` op basis van `dietKey` (wahls_paleo_plus, keto, …), geen gebruik van DB-constraints. |
| **Recipe adaptation** | Laadt `diet_category_constraints` + `recipe_adaptation_rules` via `loadDietRuleset(dietId)`. |

Ingredientgroepen zijn nu goed opgezet; de volgende stap is **dieetregels** die per groep DROP/FORCE/LIMIT/PASS bepalen en **per Wahls-niveau** anders zijn.

---

## 2. Diet Logic-model (jouw P0–P3)

| Priority | Rule Name   | Actie   | Omschrijving |
|----------|-------------|---------|---------------|
| **P0**   | DROP (Blocked) | Verwijder | Item in een “blocked” categorie → maaltijd/recept ongeldig. |
| **P1**   | FORCE (Required) | Verplicht | AI moet uit deze groep voldoende kiezen om aan dag-/week-quotum te voldoen. |
| **P2**   | LIMIT (Limited) | Beperk | Mag gebruikt worden, maar met harde limiet (bv. max 1/dag of x gram). |
| **P3**   | PASS (Allow) | Optioneel | Vrije invulling op basis van caloriebehoefte en smaak. |

Evalueervolgorde: **Fase 1 DROP → Fase 2 FORCE-quotum → Fase 3 LIMIT-check → Fase 4 vul aan met PASS**.

---

## 3. Aanbevolen aanpak

### 3.1 Schema: `diet_logic` + limieten

**Optie A (aanbevolen): nieuwe kolom `diet_logic`**

- Toevoegen op `diet_category_constraints`:
  - `diet_logic` TEXT NOT NULL DEFAULT 'drop'
    - CHECK (`diet_logic` IN ('drop','force','limit','pass')).
  - `max_per_day` INTEGER NULL (voor LIMIT).
  - `max_per_week` INTEGER NULL (voor LIMIT).
  - `limit_unit` TEXT NULL — bv. 'portions' | 'cups' | 'grams' (optioneel, voor later).

- Bestaande kolommen blijven:
  - `rule_action` (allow/block) voor guardrails-vnext (allow/block-evaluatie).
  - `constraint_type` (forbidden/required) voor backwards compatibility.
  - `min_per_day`, `min_per_week` voor FORCE.

- Migratie:
  - `constraint_type = 'forbidden'` → `diet_logic = 'drop'` (en waar nodig `'limit'` als er al “limited”-categorieën zijn).
  - `constraint_type = 'required'` → `diet_logic = 'force'`.
  - Waar je nu “limited”-categorieën hebt (bv. wahls_limited_legumes): `diet_logic = 'limit'`, plus `max_per_day`/`max_per_week` vullen.

Uniqueness: één rij per (diet_type_id, category_id) is voldoende als je één `diet_logic` per koppel wilt. De huidige UNIQUE(diet_type_id, category_id, rule_action) zou dan aangepast kunnen worden naar UNIQUE(diet_type_id, category_id) zodra alles op `diet_logic` draait; tot die tijd kun je `rule_action` afleiden uit `diet_logic` (drop/limit→block, force/pass→allow) en bestaande code intact laten.

**Optie B (alternatief)**  
`rule_action` uitbreiden naar ('drop','force','limit','pass'). Vereist wel aanpassing in guardrails-vnext (RuleAction, mapping naar block/allow) en in alle plekken die rule_action lezen.

**Advies**: Optie A — duidelijke begrippen (Diet Logic / Dieetregels vs. rule_action allow/block), weinig breuk, backwards compatibility eenvoudiger.

---

### 3.2 Wahls-niveaus als aparte diet_types

Drie niveaus = drie diet_types, elk met eigen set `diet_category_constraints`:

| Level | diet_types.name   | Gebruik |
|-------|--------------------|---------|
| 1     | **Wahls Diet**     | Wahls Level 1 (Wahls Diet) |
| 2     | **Wahls Paleo**    | Huidige “Wahls Paleo” (Level 2) |
| 3     | **Wahls Paleo Plus** | Wahls Level 3 |

- In `diet_types`: "Wahls Diet" en "Wahls Paleo Plus" toevoegen (als ze nog niet bestaan).
- Per diet_type_id een eigen set rijen in `diet_category_constraints`:
  - Elke rij heeft `diet_logic` in {drop, force, limit, pass}.
  - FORCE: `min_per_day` / `min_per_week` vullen (bv. 3 cups voor groenten, 3×/week orgaanvlees).
  - LIMIT: `max_per_day` / `max_per_week` en eventueel `limit_unit` vullen.

Onboarding / user choice: gebruiker kiest één diet_type = één Wahls-niveau. Geen “level”-veld nodig in de tabel; het niveau ís het diet_type.

---

### 3.3 Dieetregels per Wahls-niveau (invulling)

Ingredientgroepen zijn al goed; hier alleen de **Diet Logic per niveau** (welke groepen DROP/FORCE/LIMIT/PASS).

**WAHLS LEVEL 1 (Wahls Diet)**

- **DROP**: wahls_gluten, wahls_dairy, wahls_soy, wahls_refined_sugar, ultra_processed.
- **LIMIT**: wahls_non_gluten_grains (max 1/dag), wahls_legumes (max 1/dag), wahls_natural_sugar.
- **FORCE**: wahls_leafy_greens (3 cups), wahls_sulfur_rich (3 cups), wahls_colored (3 cups).
- **PASS**: wahls_meat_poultry, wahls_eggs, wahls_nuts_seeds, wahls_hydrating_vegetables.

**WAHLS LEVEL 2 (Wahls Paleo)**

- **DROP**: Alles van L1 + wahls_non_gluten_grains, wahls_legumes.
- **FORCE**: Alles van L1 + wahls_organ_meat (3×/week), wahls_sea_vegetables, wahls_fermented.
- **PASS**: wahls_omega3_fish, wahls_herbs_spices.

**WAHLS LEVEL 3 (Wahls Paleo Plus)**

- **DROP**: Alles van L2 + wahls_starchy_veggies (meestal).
- **LIMIT**: wahls_fruit (alleen bessen, max 1 cup), wahls_nuts_seeds (beperkt).
- **FORCE**: wahls_healthy_fats (focus ketose).
- **PASS**: wahls_organ_meat, wahls_omega3_fish.

In de DB wordt dit vertaald naar concrete rijen in `diet_category_constraints` met de juiste `diet_type_id` en `diet_logic` + min/max.

---

### 3.4 Nightshade-toggle (`is_inflamed`)

- **Plaats**: User-niveau, niet per dieet.
- **Schema**: Op het profiel dat gekoppeld is aan de gebruiker en het gekozen dieet — bv. `user_diet_profiles` of een vergelijkbare tabel:
  - `is_inflamed` BOOLEAN NOT NULL DEFAULT false.
- **Gedrag**:  
  - Als `is_inflamed = true`: **runtime** `wahls_nightshades` toevoegen aan de DROP-lijst voor die user, ongeacht Wahls-niveau.
- **Implementatie**: In de laag die het “effective ruleset” voor de user bouwt (bv. ruleset-loader of meal-planner): na het laden van constraints voor `diet_type_id`, als `is_inflamed` true is, extra “synthetic” DROP-regels voor de nightshade-categorie toevoegen (of één regel die naar de nightshade-ingredientgroep verwijst).

---

### 3.5 Algoritmische stappen (“generateMenu”-achtige pijp)

Dit sluit aan op jouw 4 fases; dezelfde volgorde kan gebruikt worden voor recept- én maaltijdvalidatie.

1. **Fase 1 – Harde filter (DROP)**  
   Scan alle ingrediënten van recept/dag tegen de categorieën met `diet_logic = 'drop'` (plus eventueel nightshades als `is_inflamed`).  
   Bij ook maar één match → recept/dag ongeldig (of “blocked”).

2. **Fase 2 – Quotum-check (FORCE)**  
   Controleer of de som van ingrediënten voldoet aan alle FORCE-categorieën (3-3-3 cups groenten, wekelijkse orgaanvlees/zeewier/fermented, etc.), op basis van `min_per_day` / `min_per_week` van constraints met `diet_logic = 'force'`.

3. **Fase 3 – Limietvalidatie (LIMIT)**  
   Voor elke categorie met `diet_logic = 'limit'`: controleer dat het gebruik die dag/week onder `max_per_day` / `max_per_week` blijft. Overschrijding → violation (hard of soft, naar keuze).

4. **Fase 4 – Optimalisatie (PASS)**  
   Vul de resterende behoefte (calorieën, macro’s) met groepen die `diet_logic = 'pass'` hebben; eventueel een “advise”-groep als aparte prioriteit binnen PASS.

Implementatie kan in een nieuwe module, bijv. `src/lib/diet-logic/` of uitbreiding van `diet-validation/`, met een functie:

`evaluateDietLogic(context: { dietTypeId, userId?, isInflamed? }, targets: { ingredients, day? })`

die een resultaat teruggeeft: `{ ok, phase, violations, forceDeficits, limitExcesses }`. Die gebruikt dan de constraints die via bestaande loaders (of een kleine uitbreiding daarvan) uit de DB komen.

---

### 3.6 Waar het in de codebase aangrijpt

| Plek | Aanpassing |
|------|------------|
| **DB-migratie** | Nieuwe kolom `diet_logic` + `max_per_day`/`max_per_week` (en optioneel `limit_unit`) op `diet_category_constraints`; seed voor Wahls L1/L3 als aparte diet_types + hun constraints. |
| **user_diet_profiles** (of gelijkwaardig) | Kolom `is_inflamed`; in onboarding/instellingen tonen als “Ontstekingsgevoelig / nachtschade vermijden”. |
| **Ruleset-loader / Diet-loader** | Constraints ophalen met `diet_logic` en eventueel `is_inflamed`; voor meal planner + recipe adaptation een “effective ruleset” bouwen waarin DROP/FORCE/LIMIT/PASS en nightshades zitten. |
| **Guardrails-vnext** | Blijft voor recept/ingredient-blocking vooral op `rule_action` (allow/block) werken; onder water kan die afgeleid worden uit `diet_logic` (drop/limit → block, force/pass → allow) zodat bestaande evaluator blijft werken. Later kun je evaluator uitbreiden met aparte “force/limit”-checks. |
| **Meal planner** | Ofwel (a) ruleset uit DB gebruiken voor DROP/FORCE/LIMIT i.p.v. alleen `deriveDietRuleSet`, ofwel (b) `deriveDietRuleSet` laten vullen vanuit de DB per diet_type_id. In beide gevallen moet de validatie (mealPlannerAgent.validate, etc.) de 4 fases ondersteunen. |
| **Recipe adaptation** | `loadDietRuleset` en validatie uitbreiden zodat na “verboden term”-check ook FORCE-quotum en LIMIT (per recept of per dag) toegepast kunnen worden waar relevant. |

---

### 3.7 Gefaseerde bouw (aanbevolen volgorde)

1. **Schema + data**
   - Migratie: `diet_logic`, `max_per_day`, `max_per_week` op `diet_category_constraints`.
   - Migratie: diet_types "Wahls Diet" en "Wahls Paleo Plus" toevoegen.
   - Migratie of admin-tool: per Wahls-niveau de juiste constraints invullen (DROP/FORCE/LIMIT/PASS) volgens de tabellen hierboven.
   - Optioneel: `limit_unit` nu al toevoegen voor latere precisie.

2. **User-profiel**
   - Kolom `is_inflamed` toevoegen en in UI (onboarding/instellingen) zichtbaar maken.

3. **Diet-logic-module**
   - Nieuwe module (bv. `src/lib/diet-logic/`) met:
     - `loadDietLogicConstraints(dietTypeId, options?: { isInflamed })` → groepeer op diet_logic (drop/force/limit/pass), incl. synthetic nightshade-DROP.
     - `evaluateDietLogic(context, targets)` dat de 4 fases uitvoert en violations/forceDeficits/limitExcesses teruggeeft.

4. **Integratie**
   - Ruleset-loader: bij laden voor meal planner / recipe adaptation ook `diet_logic` en limieten meenemen.
   - Meal planner: bij validatie Fase 1–3 aanroepen (DROP, FORCE-quotum, LIMIT); Fase 4 in generatie/optimization.
   - Recipe adaptation: minimaal Fase 1 (DROP) via bestaande block-logica; FORCE/LIMIT waar je recept- of dagniveau wilt ondersteunen.

5. **UI “Dieetregels”**
   - Bij Dieetregels per diet_type een overzicht “Diet Logic”:
     - Per regel: Prioriteit (P0–P3), Rule Name (DROP/FORCE/LIMIT/PASS), Actie, Omschrijving.
     - Mogelijkheid om groepen aan een diet_logic te koppelen (of alleen tonen wat nu in de DB staat).

Dit plan laat je ingredientgroepen intact, breidt **Dieetregels** uit met duidelijke Diet Logic (DROP/FORCE/LIMIT/PASS) per Wahls-niveau en de nightshade-toggle op gebruikersniveau.
