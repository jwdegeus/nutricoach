# Guard Rails Herstructurering - Analyse & Voorstel

## Huidige Situatie

### Database Structuur

1. **`ingredient_categories`** - Master tabel voor categorieën
   - `category_type`: "forbidden" | "required" (statisch per categorie)
   - `code`, `name_nl`, `name_en`, `description`
   - `display_order`, `is_active`

2. **`ingredient_category_items`** - Specifieke ingrediënten per categorie
   - `term`, `term_nl`, `synonyms` (JSONB array)
   - `display_order`, `is_active`

3. **`diet_category_constraints`** - Koppelt diëten aan categorieën
   - `constraint_type`: "forbidden" | "required" (moet matchen met category.category_type)
   - `strictness`: "hard" | "soft"
   - `priority`: INTEGER (0-100, hoger = belangrijker)
   - `min_per_day`, `min_per_week` (voor required)
   - `is_active`

### Huidige Beperkingen

1. **Statische categorie types**: Een categorie is OF "forbidden" OF "required", niet beide
2. **Geen flexibele allow/block logica**: Je kunt niet zowel allow als block hebben voor dezelfde categorie
3. **Prioriteit is aanwezig maar niet visueel sorteerbaar in UI**
4. **Geen firewall-achtige evaluatie**: Regels worden niet geëvalueerd in volgorde van prioriteit

### Gebruik door AI Magician

De `RecipeAdaptationService.loadDietRuleset()` laadt:

- `diet_category_constraints` met `priority DESC` sortering
- Alleen `constraint_type === "forbidden"` wordt gebruikt voor `DietRuleset.forbidden[]`
- `strictness` wordt gebruikt voor `ruleCode`: "GUARD_RAIL_HARD" of "GUARD_RAIL_SOFT"

## Gewenste Situatie: Firewall Rule Systeem

### Conceptuele Verandering

**Van**: Categorie-gebaseerd systeem (categorie is statisch forbidden/required)
**Naar**: Rule-gebaseerd systeem (regels kunnen allow/block zijn, onafhankelijk van categorie)

### Nieuwe Database Structuur (Voorstel)

#### Optie 1: Uitbreiden huidige structuur (Aanbevolen)

**Wijzigingen aan `diet_category_constraints`**:

- Hernoem `constraint_type` naar `rule_action`: "allow" | "block"
- Voeg `rule_priority` toe (expliciete prioriteit voor sortering)
- Behoud `strictness` voor backward compatibility
- Behoud `priority` maar gebruik `rule_priority` voor sortering

**Nieuwe tabel: `diet_firewall_rules`** (alternatief):

```sql
CREATE TABLE diet_firewall_rules (
  id UUID PRIMARY KEY,
  diet_type_id UUID REFERENCES diet_types(id),
  category_id UUID REFERENCES ingredient_categories(id),
  rule_action TEXT CHECK (rule_action IN ('allow', 'block')),
  strictness TEXT CHECK (strictness IN ('hard', 'soft')),
  priority INTEGER NOT NULL DEFAULT 50,
  min_per_day INTEGER,
  min_per_week INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(diet_type_id, category_id, rule_action) -- Kan zowel allow als block hebben
);
```

#### Optie 2: Volledig nieuwe structuur

Vervang `diet_category_constraints` volledig met `diet_firewall_rules` en migreer data.

### Firewall Rule Evaluatie Logica

1. **Sorteer regels op prioriteit** (hoog naar laag)
2. **Eerste match wint**: Als een ingrediënt matcht met een regel, stop evaluatie
3. **Default policy**: Als geen regel matcht, wat is de default? (allow of block?)
4. **Conflicterende regels**: Wat als zowel allow als block regels bestaan? (prioriteit bepaalt)

### UI Wijzigingen

1. **GuardRailsManager**:
   - Toon regels als firewall rules (allow/block)
   - Drag & drop voor prioriteit sortering
   - Mogelijkheid om zowel allow als block te hebben voorzelfde categorie

2. **GuardRailsOverview**:
   - Toon regels gesorteerd op prioriteit
   - Visuele indicatie van allow (groen) vs block (rood)
   - Prioriteit kolom met sorteer functionaliteit

### Impact op AI Magician

De `RecipeAdaptationService` moet:

1. Regels laden gesorteerd op prioriteit
2. Evalueren in volgorde (eerste match wint)
3. Block regels toevoegen aan `DietRuleset.forbidden[]`
4. Allow regels kunnen gebruikt worden voor substitution suggestions

## Implementatie Plan

### Fase 1: Database Migratie

1. Voeg `rule_action` kolom toe aan `diet_category_constraints`
2. Migreer bestaande data: `constraint_type === "forbidden"` → `rule_action === "block"`
3. Migreer bestaande data: `constraint_type === "required"` → `rule_action === "allow"`
4. Voeg `rule_priority` toe (kopieer van `priority`)

### Fase 2: Backend Updates

1. Update `ingredient-categories-admin.actions.ts` voor nieuwe velden
2. Update `RecipeAdaptationService.loadDietRuleset()` voor firewall logica
3. Implementeer firewall evaluatie functie

### Fase 3: UI Updates

1. Update `GuardRailsManager` voor allow/block selectie
2. Voeg drag & drop toe voor prioriteit sortering
3. Update `GuardRailsOverview` voor nieuwe weergave

### Fase 4: Testing

1. Test met bestaande diëten
2. Test AI Magician met nieuwe regels
3. Test edge cases (conflicterende regels, etc.)

## Open Vragen

1. **Default policy**: Als geen regel matcht, is de default allow of block?
2. **Conflicterende regels**: Wat als zowel allow (priority 80) als block (priority 90) bestaan voorzelfde categorie?
3. **Backward compatibility**: Moeten we oude `constraint_type` veld behouden?
4. **Required constraints**: Hoe behandelen we `min_per_day`/`min_per_week` in firewall context? (Alleen voor allow regels?)

## Aanbeveling

**Optie 1 met uitbreidingen**:

- Behoud bestaande structuur voor backward compatibility
- Voeg `rule_action` toe als nieuwe kolom
- Voeg `rule_priority` toe voor expliciete sortering
- Implementeer firewall evaluatie logica in service layer
- Update UI voor allow/block en prioriteit sortering

Dit minimaliseert breaking changes en maakt geleidelijke migratie mogelijk.
