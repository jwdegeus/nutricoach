# NEVO Database Integratie

Deze documentatie beschrijft de integratie van de NEVO (Nederlands Voedingsstoffenbestand) database voor het berekenen van nutriëntenwaarden per maaltijd.

## Overzicht

De NEVO integratie bestaat uit:

- **Database tabellen** voor NEVO voedingsmiddelen
- **Import script** voor het importeren van CSV data
- **Helper functies** voor het berekenen van nutriëntenwaarden per maaltijd

## Setup

### 1. Database Migratie Toepassen

Push de migratie naar je Supabase database:

```bash
npm run db:push
```

Dit creëert de volgende tabellen:

- `nevo_foods` - Alle voedingsmiddelen met nutriëntenwaarden (per 100g)
- `meal_ingredients` - Koppelt ingrediënten aan maaltijden met hoeveelheden

### 2. NEVO Data Importeren

**Let op:** De CSV bestanden zijn verwijderd uit de `temp/` map. Als je de data nog niet hebt geïmporteerd, download de NEVO dataset opnieuw van https://nevo-online.rivm.nl/ en plaats `NEVO2025_v9.0.csv` in de `temp/` map.

Zorg ervoor dat je environment variabelen zijn ingesteld in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (vereist voor import)

Installeer dependencies (als nog niet gedaan):

```bash
npm install
```

Importeer de data:

```bash
npm run import:nevo
```

Het script:

- Leest `temp/NEVO2025_v9.0.csv`
- Parseert pipe-delimited CSV met Nederlandse komma notatie
- Importeert alle voedingsmiddelen in batches van 100
- Gebruikt `upsert` om duplicaten te voorkomen

## Gebruik

### Zoeken naar Voedingsmiddelen

```typescript
import { searchNevoFoods } from '@/lib/nevo/nutrition-calculator';

const foods = await searchNevoFoods('appel', 10);
// Returns array of matching foods with basic info
```

### Berekenen van Nutriëntenwaarden voor een Ingrediënt

```typescript
import { calculateIngredientNutrition } from '@/lib/nevo/nutrition-calculator';

// Bereken nutriënten voor 150g appel (NEVO code 123)
const nutrition = await calculateIngredientNutrition(123, 150);
```

### Berekenen van Nutriëntenwaarden voor een Maaltijd

```typescript
import {
  calculateMealNutrition,
  MealIngredient,
} from '@/lib/nevo/nutrition-calculator';

const ingredients: MealIngredient[] = [
  { nevo_food_id: 123, amount_g: 150 }, // 150g appel
  { nevo_food_id: 456, amount_g: 200 }, // 200g kipfilet
  { nevo_food_id: 789, amount_g: 100 }, // 100g rijst
];

const mealNutrition = await calculateMealNutrition(ingredients);
// Returns aggregated nutritional profile for the entire meal
```

### Database Functie Gebruiken

Je kunt ook de database functie direct gebruiken als je meal_ingredients al in de database hebt:

```sql
SELECT * FROM calculate_meal_nutrition('meal-uuid-here');
```

## Data Structuur

### NEVO Foods Tabel

De `nevo_foods` tabel bevat alle voedingsmiddelen met hun nutriëntenwaarden per 100g:

- **Basis info**: NEVO code, naam (NL/EN), voedselgroep, synoniemen
- **Energie**: kJ, kcal
- **Macronutriënten**: eiwit, vet (verzadigd, onverzadigd, omega-3/6, trans), koolhydraten (suiker, zetmeel, vezels), alcohol
- **Mineralen**: natrium, kalium, calcium, fosfor, magnesium, ijzer, koper, selenium, zink, jodium
- **Vitamines**: A, D, E, K, B1, B2, B6, B12, niacine, foliumzuur, C

### Meal Ingredients Tabel

De `meal_ingredients` tabel koppelt ingrediënten aan maaltijden:

- `meal_id` - UUID van de maaltijd (toekomstige implementatie)
- `nevo_food_id` - Referentie naar nevo_foods
- `amount_g` - Hoeveelheid in grammen

## Helper Functies

### `calculateIngredientNutrition(nevoFoodId, amountG)`

Berekent nutriëntenwaarden voor een enkel ingrediënt op basis van de hoeveelheid.

### `calculateMealNutrition(ingredients)`

Berekent geaggregeerde nutriëntenwaarden voor een maaltijd met meerdere ingrediënten.

### `searchNevoFoods(searchTerm, limit)`

Zoekt voedingsmiddelen op naam (Nederlands of Engels).

### `getNevoFoodByCode(nevoCode)`

Haalt een specifiek voedingsmiddel op op basis van NEVO code.

## TypeScript Types

```typescript
interface NutritionalProfile {
  energy_kj: number | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  // ... alle andere nutriënten
}

interface MealIngredient {
  nevo_food_id: number;
  amount_g: number;
}
```

## Toekomstige Uitbreidingen

- Meal planner integratie met `meal_ingredients`
- Dagelijkse nutriënten tracking
- Dieet validatie op basis van nutriëntenwaarden
- Recepten database met NEVO ingrediënten
- Gedetailleerde vetzuren data (indien nodig)

## Troubleshooting

### Import Fails

- Controleer of `SUPABASE_SERVICE_ROLE_KEY` is ingesteld
- Controleer of de migratie is toegepast (`npm run db:push`)
- Controleer of `temp/NEVO2025_v9.0.csv` bestaat

### Geen Resultaten bij Zoeken

- Controleer of de data is geïmporteerd: `SELECT COUNT(*) FROM nevo_foods;`
- Gebruik wildcards in zoektermen: `searchNevoFoods('%appel%')`

### Type Errors

- Zorg dat TypeScript types zijn geïmporteerd: `import type { NutritionalProfile } from '@/lib/nevo/nutrition-calculator';`
