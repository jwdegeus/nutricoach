# Receptpagina: performance en caching

## Huidige aanpak

- **Receptdetail laden**: Eén keer `getMealByIdAction`, daarna parallel `getRecipeComplianceScoresAction`, `getNevoFoodNamesByCodesAction` en `getCustomFoodNamesByIdsAction` via `Promise.all`. Minder wachttijd dan opeenvolgende calls.
- **Page loader**: `loading.tsx` in `recipes/[recipeId]/` toont een spinner tijdens navigatie; `MealDetailPageClient` toont een eigen loader tijdens het ophalen van meal + compliance + namen.
- **Ingrediënten zoeken**: NEVO en custom_foods worden parallel opgevraagd; filter gebruikt alleen `name_nl` en `name_en` (geen `synonym` i.v.m. NULL in PostgREST).

## Caching-advies

### 1. Server: request-deduplicatie (React `cache()`)

Voor server actions die **binnen dezelfde request** meerdere keren met dezelfde argumenten worden aangeroepen, kun je React `cache()` gebruiken zodat maar één echte call naar de DB gaat:

```ts
import { cache } from 'react';

export const getMealByIdCached = cache(getMealByIdAction);
```

Gebruik de gecachte variant in Server Components; in client components blijf je de gewone action aanroepen (die per call een nieuwe request doet).

### 2. Server: tijdgebaseerde cache (`unstable_cache`)

Voor data die niet per-request hoeft te zijn (bijv. NEVO-namen, dieetregels), kun je Next.js `unstable_cache` gebruiken met een korte TTL:

```ts
import { unstable_cache } from 'next/cache';

const getCachedNevoNames = unstable_cache(
  async (codes: string[]) => getNevoFoodNamesByCodesAction(codes),
  ['nevo-names'],
  { revalidate: 60, tags: ['nevo'] },
);
```

Pas op: bij server actions die vanuit de client worden aangeroepen, wordt de request elke keer opnieuw uitgevoerd; `unstable_cache` helpt vooral bij server-side fetches (bijv. in Server Components of route handlers).

### 3. Client: SWR of React Query

Voor data die op de receptpagina vaak opnieuw wordt geladen (bijv. na een ingrediënt-match), kun je op de client een cache laag toevoegen:

- **SWR**: Eenvoudig, key-based, automatische hervalidatie.
- **React Query (TanStack Query)**: Meer controle (stale time, invalidation, mutations).

Beide cachen op basis van key (bijv. `['meal', mealId, mealSource]`) en verminderen dubbele calls bij snel navigeren of herladen.

### 4. Aanbevolen volgorde

1. **Nu**: Parallelle calls op de receptpagina + duidelijke page loader (zoals nu).
2. **Optioneel**: React `cache()` rond meal/namen-actions als je die ook vanuit Server Components aanroept met dezelfde args.
3. **Optioneel**: Client-side cache (SWR/React Query) voor meal data zodat teruggaan naar een recept geen volledige refetch doet.
4. **Optioneel**: `unstable_cache` voor relatief statische data (NEVO-namen, dieetregels) als die op meerdere plekken worden gebruikt.

## Zoekfunctie ingrediënten

- Filter: `name_nl.ilike.%term%` en `name_en.ilike.%term%` (geen `synonym` in de `.or()` van PostgREST i.v.m. NULL).
- NEVO en custom_foods worden parallel opgevraagd per zoekterm.
- Enkele aanhalingstekens in de zoekterm worden geëscaped (`'` → `''`).
