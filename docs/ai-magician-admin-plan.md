# AI Magician Admin – Plan voor beheerbare validatieregels

## 1. Huidige situatie – analyse

### 1.1 Wat draait al via de database

| Component                         | Bron                                                                                         | Beheer                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Dieetregels (verboden termen)** | `ingredient_categories` + `ingredient_category_items` via `diet_category_constraints`        | ✅ GuardRailsManager (`/settings/diets/[id]/edit`) |
| **Substitutie-suggesties**        | `recipe_adaptation_rules.substitution_suggestions` + fallback in `recipe-adaptation.service` | ✅ Via GuardRailsManager / recipe_adaptation_rules |
| **Heuristieken (added sugar)**    | `recipe_adaptation_heuristics`                                                               | ✅ Via bestaande admin                             |

### 1.2 Wat nog hardcoded is in code

| Locatie                         | Inhoud                                                                           | Impact                                                                              |
| ------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **`diet-validator.ts`**         |                                                                                  |                                                                                     |
|                                 | `EXTRA_INGREDIENT_SYNONYMS`                                                      | Extra synoniemen voor term-matching (kaas→mozzarella, suiker→honing)                |
|                                 | `SUBSTRING_FALSE_POSITIVE_IF_CONTAINS`                                           | Uitsluitingen bij substring-match (bloem→bloemkool, ei→kleine wortel)               |
|                                 | `PASTA_AS_PASTE_INDICATORS`                                                      | Lijst “pasta” als spread (notenpasta, tahini)                                       |
|                                 | `SWEET_POTATO_INDICATORS`, `isSpicePepper`, `isBloemkoolRelated`, `isRijstazijn` | Speciale uitzonderingen                                                             |
| **`ingredient-categorizer.ts`** |                                                                                  |                                                                                     |
|                                 | `INGREDIENT_CATEGORY_MAP`                                                        | Generieke categorieën: grains, dairy, nightshades, starches, leafy_vegetables, etc. |
|                                 | `SWEET_POTATO_PATTERNS`                                                          | Uitzondering zoete aardappel voor nachtschade                                       |
|                                 | `isHighHistamine`                                                                | Vaste lijst high-histamine ingrediënten                                             |

### 1.3 Verschil DB vs. ingredient-categorizer

- **DB `ingredient_category_items`**: Dieet-specifieke regels (Wahls verboden gluten, nachtschades, enz.). Gekoppeld aan `diet_type` via `diet_category_constraints`.
- **`INGREDIENT_CATEGORY_MAP`**: Semantische categorieën (grains, dairy, nightshades, starches) voor:
  - Meal planner: `getIngredientCategories()` (Wahls paleo)
  - Validation-engine: `ingredientMatchesCategory()`
  - Recipe-adaptation: substitutie-suggesties per categorie

Deze twee bronnen overlappen op termen (aardappel, paprika, melk), maar hebben verschillende rollen: DB = regels, categorizer = generieke betekenis.

---

## 2. Architectuurvoorstel

### 2.1 Kernidee

1. **False positives en uitzonderingen** → nieuwe tabel `magician_validator_overrides`
2. **Extra synoniemen** → uitbreiden van `ingredient_category_items.synonyms` of eigen tabel `magician_term_synonyms`
3. **Generieke categorieën** (ingredient-categorizer) → optioneel migreren naar DB of aparte configuratie-tabel

### 2.2 Nieuwe tabellen (conceptueel)

```
magician_validator_overrides
├── id (uuid)
├── rule_type ('false_positive' | 'exception_pattern' | 'pasta_as_paste')
├── forbidden_term (text)           -- bijv. "aardappel", "bloem", "ei"
├── exclude_if_contains (jsonb)      -- ["zoete aardappel", "zoete", "sweet potato"]
├── description (text)              -- "Zoete aardappel is geen nachtschade"
├── is_active (boolean)
├── created_at, updated_at
└── (optioneel: diet_type_id voor dieet-specifieke overrides)
```

```
magician_term_synonyms  (optioneel; kan ook in ingredient_category_items)
├── id (uuid)
├── term (text)                     -- "kaas"
├── synonym (text)                  -- "mozzarella"
├── is_active (boolean)
└── created_at, updated_at
```

### 2.3 Alternatief: eenvoudigere aanpak

Geen nieuwe tabellen; bestaande structuur uitbreiden:

- **`ingredient_category_items`**: Kolom `exclude_if_contains` (jsonb) toevoegen per item.
- **`recipe_adaptation_rules`**: `substitution_suggestions` bestaat al; extra synoniemen via `synonyms` of aparte kolom.

Voordeel: minder schema-wijzigingen. Nadeel: minder flexibel voor generieke overrides die niet aan één dieet/regel hangen.

---

## 3. Fasering

### Fase 1: False-positive overrides (prioriteit: hoog)

**Doel:** `SUBSTRING_FALSE_POSITIVE_IF_CONTAINS` + patterns als zoete aardappel beheerbaar maken.

**Stappen:**

1. Migration: tabel `magician_validator_overrides` aanmaken.
2. Seeden met huidige waarden uit `diet-validator.ts`.
3. Loader: `diet-validator` laadt overrides uit DB, merge met eventuele hardcoded fallback.
4. Admin: pagina `/admin/ai-magician-overrides` voor CRUD op overrides.
5. Verwijderen van hardcoded `SUBSTRING_FALSE_POSITIVE` en `SWEET_POTATO_INDICATORS` in code.

**Resultaat:** Nieuwe uitzonderingen (zoals zoete aardappel) zijn volledig configureerbaar via admin.

### Fase 2: Extra synoniemen (prioriteit: medium)

**Doel:** `EXTRA_INGREDIENT_SYNONYMS` beheerbaar maken.

**Opties:**

- **A:** Tabel `magician_term_synonyms` (term + synonym).
- **B:** Uitbreiden van `ingredient_category_items.synonyms` en centraal laden voor alle dieten.

**Keuze:** Optie B is eenvoudiger als synoniemen vooral per categorie/regel horen; optie A als er generieke “term X betekent ook Y”-regels nodig zijn.

### Fase 3: Pasta-as-paste en andere pattern-lijsten (prioriteit: medium)

**Doel:** `PASTA_AS_PASTE_INDICATORS` beheerbaar maken.

**Stappen:**

1. Kolom of tabel voor pattern-lijsten (bijv. `rule_type = 'pasta_as_paste'` in `magician_validator_overrides` met `patterns` jsonb).
2. Loader die deze lijst aan diet-validator aanlevert.
3. Admin-UI om patterns te bewerken.

### Fase 4: Ingredient-categorizer (prioriteit: lager)

**Doel:** `INGREDIENT_CATEGORY_MAP` configureerbaar maken.

**Complexiteit:** Hoger – gebruikt op meerdere plekken (meal planner, validation-engine, recipe-adaptation) en heeft overlappende categorieën (nightshades vs. starches vs. colored_vegetables).

**Opties:**

- **A:** Eigen tabellen (`ingredient_semantic_categories`, `ingredient_semantic_category_items`) en alles migreren.
- **B:** Alleen uitzonderingen (zoals zoete aardappel) in DB; rest blijft hardcoded.
- **C:** Uitstel tot er concrete gebruikersvraag is.

**Advies:** Start met B (alleen uitzonderingen) of C. Volledige migratie van categorizer is grotere refactor.

---

## 4. Admin-module structuur

### 4.1 Nieuwe admin-pagina

**Route:** `/admin/ai-magician` of `/admin/dieetvalidatie`

**Secties:**

1. **False-positive overrides** – Tabel met verboden term, exclude-patronen, beschrijving. CRUD.
2. **Extra synoniemen** (fase 2) – Term ↔ synoniem koppelingen.
3. **Link naar GuardRailsManager** – “Dieetregels bewerken” → `/settings/diets/[id]/edit`.

### 4.2 Wireframes (schets)

```
┌─────────────────────────────────────────────────────────────┐
│ AI Magician – Validatie-instellingen                         │
├─────────────────────────────────────────────────────────────┤
│ False-positive uitsluitingen                                 │
│ Als een ingrediënt deze patronen bevat, wordt de match op de  │
│ verboden term genegeerd.                                     │
│                                                              │
│ ┌─────────────────┬─────────────────────────┬────────────┐ │
│ │ Verboden term   │ Uitsluit als bevat      │ Acties     │ │
│ ├─────────────────┼─────────────────────────┼────────────┤ │
│ │ aardappel       │ zoete aardappel, sweet   │ ✏️ 🗑️     │ │
│ │ bloem           │ bloemkool, zonnebloem    │ ✏️ 🗑️     │ │
│ │ ei              │ romeinse, kleine, wortel  │ ✏️ 🗑️     │ │
│ └─────────────────┴─────────────────────────┴────────────┘ │
│ [+ Nieuwe uitsluiting]                                       │
├─────────────────────────────────────────────────────────────┤
│ Dieetregels (termen, synoniemen, substituties)               │
│ [Ga naar GuardRails →]                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Technische implementatie-schets

### 5.1 Loader in diet-validator

```typescript
// diet-validator.ts – concept
async function loadValidatorOverrides(): Promise<ValidatorOverrides> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('magician_validator_overrides')
    .select('*')
    .eq('is_active', true);
  return {
    substringFalsePositives: buildMapFromRows(data ?? []),
    sweetPotatoPatterns: getPatterns(data, 'sweet_potato'),
    pastaAsPaste: getPatterns(data, 'pasta_as_paste'),
  };
}
```

### 5.2 Caching

Overrides wijzigen niet per request. Cache op server (in-memory of Redis) met korte TTL (bijv. 60s) of revalidation na write.

---

## 6. Samenvatting en advies

| Fase       | Inhoud                                 | Effort                |
| ---------- | -------------------------------------- | --------------------- |
| **Fase 1** | False-positive overrides in DB + admin | 1–2 dagen             |
| **Fase 2** | Extra synoniemen beheerbaar            | 0.5–1 dag             |
| **Fase 3** | Pasta-as-paste e.d. in DB              | 0.5 dag               |
| **Fase 4** | Ingredient-categorizer migreren        | 2–3 dagen (optioneel) |

**Advies:** Begin met Fase 1. Dat biedt direct waarde (zoete aardappel, bloemkool, ei-wortel, etc.) zonder grote refactors. Fase 2 en 3 volgen als volgende stappen. Fase 4 pas uitvoeren bij duidelijke behoefte.
