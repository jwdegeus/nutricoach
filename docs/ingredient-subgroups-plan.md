# Ingrediënt Subgroepen - Implementatie Plan

## Probleem Analyse

**Huidige situatie:**
- Ingrediënt categorieën (bijv. "gluten_containing_grains")
- Items direct in categorie (bijv. "pasta" met synoniemen: ["spaghetti", "penne", ...])
- Alle items worden als platte lijst getoond → rommelig en onoverzichtelijk

**Gewenste situatie:**
- Ingrediënt categorie (bijv. "gluten_containing_grains")
  - Subgroep (bijv. "pasta")
    - Items: "macaroni", "spaghetti" (elk met eigen synoniemen)
  - Subgroep (bijv. "wheat products")
    - Items: "wheat flour", "semolina" (elk met eigen synoniemen)

## Database Ontwerp

### Optie A: Nieuwe Subgroep Tabel (Aanbevolen)

```sql
-- Nieuwe tabel voor subgroepen
CREATE TABLE ingredient_subgroups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES ingredient_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Bijv. "pasta", "wheat products"
  name_nl TEXT, -- Nederlandse naam
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, name)
);

-- Update ingredient_category_items om optioneel naar subgroep te verwijzen
ALTER TABLE ingredient_category_items 
  ADD COLUMN subgroup_id UUID REFERENCES ingredient_subgroups(id) ON DELETE CASCADE;

-- Items kunnen direct aan categorie hangen (backward compatible) OF aan subgroep
-- CONSTRAINT: item moet category_id OF subgroup_id hebben (maar niet beide)
```

**Voordelen:**
- Duidelijke hiërarchie
- Backward compatible (items kunnen direct aan categorie)
- Flexibel (subgroepen optioneel)

**Nadelen:**
- Extra tabel
- Migratie nodig voor bestaande data

### Optie B: Geneste Items (Alternatief)

```sql
-- Gebruik ingredient_category_items als subgroepen
-- Voeg parent_item_id toe voor geneste structuur
ALTER TABLE ingredient_category_items
  ADD COLUMN parent_item_id UUID REFERENCES ingredient_category_items(id) ON DELETE CASCADE;

-- Items zonder parent zijn "subgroepen"
-- Items met parent zijn "termen binnen subgroep"
```

**Voordelen:**
- Geen nieuwe tabel
- Eenvoudiger schema

**Nadelen:**
- Minder duidelijk (item vs subgroep onderscheid)
- Complexere queries

**Aanbeveling: Optie A** (nieuwe subgroep tabel)

## UI/UX Ontwerp

### Hiërarchische Weergave

```
┌─────────────────────────────────────────┐
│ Ingrediëntgroep: Glutenhoudende granen  │
├─────────────────────────────────────────┤
│                                          │
│ ▼ Pasta (6 items)                       │
│   ├─ macaroni (rijst) +3 syn.           │
│   ├─ spaghetti (spaghetti) +2 syn.     │
│   ├─ penne (penne) +1 syn.              │
│   └─ ...                                 │
│                                          │
│ ▼ Wheat Products (4 items)              │
│   ├─ wheat flour (tarwebloem) +5 syn.  │
│   └─ ...                                 │
│                                          │
│ + Nieuwe subgroep toevoegen              │
└─────────────────────────────────────────┘
```

### Component Structuur

1. **Subgroep Sectie** (Collapsible)
   - Header met naam, item count, expand/collapse icon
   - Items als tags binnen subgroep
   - Actions: bewerken, verwijderen subgroep

2. **Item Tags binnen Subgroep**
   - Compacte tag weergave
   - Hover: toon synoniemen tooltip
   - Click: edit item modal
   - Delete: inline verwijderen

3. **Add Flow**
   - Optie 1: Direct item toevoegen (kies subgroep of "geen subgroep")
   - Optie 2: Subgroep aanmaken, dan items toevoegen
   - AI suggesties: per subgroep context

## Implementatie Stappen

### Fase 1: Database & Backend

1. **Database Migration**
   - Maak `ingredient_subgroups` tabel
   - Voeg `subgroup_id` toe aan `ingredient_category_items`
   - Migreer bestaande data (optioneel: maak default subgroepen)
   - Indexen en constraints

2. **Server Actions**
   - `createIngredientSubgroupAction`
   - `updateIngredientSubgroupAction`
   - `deleteIngredientSubgroupAction`
   - `getIngredientSubgroupsAction` (met items)
   - Update `addIngredientCategoryItemAction` om subgroup_id te ondersteunen

3. **AI Suggesties**
   - Update prompt om subgroep context te begrijpen
   - Suggesties per subgroep genereren

### Fase 2: UI Componenten

1. **Subgroep Component**
   - `IngredientSubgroupSection.tsx` (collapsible)
   - Subgroep header met actions
   - Items lijst als tags

2. **Update Modal**
   - Herstructureer `IngredientGroupDetailModal.tsx`
   - Groepeer items per subgroep
   - Add flow: subgroep selectie

3. **Subgroep Management**
   - Create/edit subgroep dialog
   - Delete confirmation
   - Reorder subgroepen (drag & drop optioneel)

### Fase 3: UX Verbeteringen

1. **Visuele Hiërarchie**
   - Duidelijke spacing en indentation
   - Icons voor expand/collapse
   - Color coding voor subgroepen
   - Betere typography

2. **Interactie**
   - Smooth expand/collapse animaties
   - Drag & drop voor reordering (optioneel)
   - Keyboard shortcuts
   - Bulk operations per subgroep

3. **AI Integratie**
   - Subgroep-specifieke suggesties
   - Auto-categorisering van nieuwe items
   - Suggestie voor nieuwe subgroepen

## Migratie Strategie

**Voor bestaande data:**
1. Optioneel: Maak default subgroepen gebaseerd op bestaande items
2. Of: Laat items direct aan categorie hangen (geen subgroep)
3. Gebruikers kunnen later subgroepen aanmaken en items verplaatsen

## Test Cases

1. Subgroep CRUD operaties
2. Items toevoegen aan subgroep
3. Items verplaatsen tussen subgroepen
4. Subgroep verwijderen (cascade naar items?)
5. AI suggesties met subgroep context
6. Backward compatibility (items zonder subgroep)
