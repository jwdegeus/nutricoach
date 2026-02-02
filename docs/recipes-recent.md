# Recent bekeken — Schema, RLS, actions, tab wiring, logging

Documentatie van de “Recent bekeken”-functie: schema, RLS, server actions, receptenindex-tab en detail-logging. Voor onderhoud en uitbreiding (retention, filters, housekeeping).

**Relevante bestanden:**

- `supabase/migrations/20260231000019_meal_recent_views.sql` — Tabel, constraints, indexen, RLS
- `src/app/(app)/recipes/actions/meal-recent.actions.ts` — `logMealRecentViewAction`, `listRecentMealsAction`
- `src/app/(app)/recipes/page.tsx` — Branch `collection=recent` (alleen limit/offset MVP)
- `src/app/(app)/recipes/components/RecipesIndexClient.tsx` — Tabs + URL-state (collection=all|saved|recent)
- `src/app/(app)/recipes/[recipeId]/components/MealDetail.tsx` — Best-effort logging effect bij openen custom meal

---

## 1. Schema `meal_recent_views`

**Migratie:** `supabase/migrations/20260231000019_meal_recent_views.sql`

| Kolom            | Type        | Constraints                                                    |
| ---------------- | ----------- | -------------------------------------------------------------- |
| `id`             | UUID        | PRIMARY KEY, DEFAULT gen_random_uuid()                         |
| `user_id`        | UUID        | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE          |
| `meal_id`        | UUID        | NOT NULL, REFERENCES public.custom_meals(id) ON DELETE CASCADE |
| `last_viewed_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                                        |
| `created_at`     | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                                        |

**Constraints:**

- **UNIQUE (user_id, meal_id)** — Eén rij per user per recept; naam: `meal_recent_views_user_meal_unique`. Deduped: bij opnieuw bekijken wordt alleen `last_viewed_at` geüpdatet (upsert).

**Indexen:**

- Unieke index op `(user_id, meal_id)` via de UNIQUE-constraint.
- `idx_meal_recent_views_user_last_viewed` op `(user_id, last_viewed_at DESC)` — “Recent”-lijst (nieuwste view eerst).
- `idx_meal_recent_views_meal_id` op `(meal_id)` — reverse lookups.

**Cascade:** Bij verwijderen van een user of een recept verdwijnen de bijbehorende recent-view-rijen.

---

## 2. RLS policies en rationale

**RLS:** Aan op `meal_recent_views`.

| Policy                                 | Operatie | Voorwaarde                                                                                                            | Rationale                                                                 |
| -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Users can select own meal recent views | SELECT   | `auth.uid() = user_id`                                                                                                | Alleen eigen recent-views zichtbaar.                                      |
| Users can insert own meal recent views | INSERT   | `auth.uid() = user_id` **én** `EXISTS (SELECT 1 FROM custom_meals m WHERE m.id = meal_id AND m.user_id = auth.uid())` | Alleen views voor eigen recepten; geen logging voor recepten van anderen. |
| Users can update own meal recent views | UPDATE   | `auth.uid() = user_id` (USING + WITH CHECK)                                                                           | Upsert: bij opnieuw bekijken wordt `last_viewed_at` geüpdatet.            |
| Users can delete own meal recent views | DELETE   | `auth.uid() = user_id`                                                                                                | Housekeeping / ontvolgen.                                                 |

**Waarom INSERT/UPSERT alleen voor eigen custom meals:** Recepten zijn per user (`custom_meals.user_id`). “Recent” is een persoonlijke lijst van eigen bekeken recepten; de INSERT-policy dwingt af dat `meal_id` naar een `custom_meal` van de ingelogde user verwijst.

---

## 3. Server actions — contract

**Bestand:** `src/app/(app)/recipes/actions/meal-recent.actions.ts`

### `logMealRecentViewAction({ mealId })`

- **Input:** `LogMealRecentViewInput`: `{ mealId: string }` (Zod: uuid).
- **Output:** `ActionResult<{ logged: true }>` — `ok: true` met `data: { logged: true }`, of `ok: false` met error.
- **Semantiek:** Upsert op `(user_id, meal_id)`: bij eerste view een INSERT; bij opnieuw bekijken een UPDATE van `last_viewed_at` naar now. `created_at` blijft ongemoeid bij update.
- **Query:** `meal_recent_views.upsert({ user_id, meal_id, last_viewed_at: now }, { onConflict: 'user_id,meal_id' })`.
- **Foutafhandeling:** Bij DB-fout (o.a. 23503/RLS) wordt een NL-message teruggegeven (“Recept niet gevonden of je hebt geen rechten om dit te loggen.”).

### `listRecentMealsAction({ limit, offset })`

- **Input:** `ListRecentMealsInput`: `{ limit?: number; offset?: number }` (Zod: limit 1–50 default 24, offset ≥ 0 default 0).
- **Output:** `ActionResult<ListRecentMealsOutput>` met `{ items: RecentMealListItem[], totalCount: number | null, limit, offset }`.
- **Ordering:** Items zijn geordend op `last_viewed_at DESC`; de action haalt eerst `meal_recent_views` op met `order('last_viewed_at', { ascending: false })` en `range(offset, offset+limit-1)`, behoudt `mealIdsOrdered`, en mapt daarna `custom_meals`-rijen terug in die volgorde (reorder op `mealIdsOrdered` omdat `.in('id', ...)` geen volgorde garandeert).
- **Count:** `totalCount` komt van `count: 'exact'` op de `meal_recent_views`-query (totaal aantal recent-views voor de user).
- **Minimal columns:** `meal_recent_views`: `meal_id`, `last_viewed_at`; `custom_meals`: id, name, meal_slot, total_minutes, servings, source, source_url, updated_at + recipe_tag_links(recipe_tags(label)); `meal_favorites`: één query met `meal_id` voor `isFavorited` per lijst.
- **RecentMealListItem:** `MealListItem & { lastViewedAt: string }` (ISO timestamp).

---

## 4. Receptenindex — URL en wiring

### URL-parameter uitbreiding

| Parameter    | Waarden                                        | Opmerking                         |
| ------------ | ---------------------------------------------- | --------------------------------- |
| `collection` | `all` (default/afwezig), `saved`, **`recent`** | Tab: Alles / Opgeslagen / Recent. |
| `limit`      | 1–50, default 24                               | Paginagrootte.                    |
| `offset`     | ≥ 0, default 0                                 | Pagina-offset.                    |

**MVP “Recent”:** Bij `collection=recent` worden **alleen `limit` en `offset`** uit de URL gebruikt. Zoekterm (`q`), mealSlot, maxTotalMinutes, sourceName en tags worden **genegeerd**; er zijn geen filters op de recent-lijst. Dit is gedocumenteerd in `page.tsx` (inline comment: “Recent: alleen limit/offset uit URL; q/filters worden niet toegepast (MVP)”).

### page.tsx — branch `collection=recent`

**Bestand:** `src/app/(app)/recipes/page.tsx`

- Collection wordt genormaliseerd uit `searchParams`: `'all' | 'saved' | 'recent'`.
- **Als `collection === 'recent'`:**
  - Alleen `limit` en `offset` worden uit `searchParams` geparsed (q/filters niet).
  - `listRecentMealsAction({ limit, offset })` wordt aangeroepen.
  - Bij succes: `listResult` = `{ items, totalCount, limit, offset }` wordt aan `RecipesIndexClient` doorgegeven (items zijn `RecentMealListItem[]` ⊇ `MealListItem[]`).
  - Bij fout:zelfde error-callout met “Opnieuw proberen” link naar `/recipes`.
- **Als `collection === 'all'` of `'saved'`:** Bestaand pad: `parseListMealsInput(params)` en `listMealsAction(input)`.

### RecipesIndexClient — tabs en URL-state

**Bestand:** `src/app/(app)/recipes/components/RecipesIndexClient.tsx`

- **CollectionValue:** `'all' | 'saved' | 'recent'`.
- **activeCollection:** Afgeleid uit `searchParams.collection`; `'recent'` wordt herkend.
- **buildQueryString:** Bij `collection === 'recent'` wordt `collection=recent` in de URL gezet (net als `saved`); bij `all` wordt de param verwijderd.
- **Tab “Recent”:** Enabled; klik roept `setCollection('recent')` aan en navigeert naar `/recipes?collection=recent` (offset 0).
- **“Wis filters”:** Blijft `router.push('/recipes')` (naar Alles); op de Recent-tab gaat de gebruiker daarmee terug naar Alles.

---

## 5. Detail — logging bij openen

**Bestand:** `src/app/(app)/recipes/[recipeId]/components/MealDetail.tsx`

- **Effect:** Eén `useEffect` met dependencies `[mealId, mealSource]`.
- **Guard:** Alleen als `mealSource === 'custom'` **en** `mealId` aanwezig: `logMealRecentViewAction({ mealId })` wordt aangeroepen.
- **Best-effort:** Geen toast; errors worden in de UI genegeerd. In development (`process.env.NODE_ENV === 'development'`) wordt bij `!result.ok` een `console.warn('[MealDetail] logMealRecentViewAction:', result.error.message)` gelogd.
- **Race-safe:** Een `cancelled`-flag in de effect-cleanup voorkomt state-updates na unmount of na mealId-wissel.
- **Frequentie:** 1x per render met dat mealId/mealSource (geen dubbele logging binnen dezelfde mount).

---

## 6. Security

- **RLS-first:** Alle lees/schrijf naar `meal_recent_views` via server actions met `createClient()`; user-context uit `auth.getUser()`. Geen Supabase-client in de UI.
- **Geen SELECT \*:** Alleen benodigde kolommen: bij logging geen select op result; bij list: `meal_id`, `last_viewed_at` op `meal_recent_views`; minimale kolommen op `custom_meals` en `meal_favorites`.
- **INSERT/UPSERT alleen eigen recepten:** De INSERT-policy op `meal_recent_views` vereist dat `meal_id` verwijst naar een `custom_meals`-rij met `user_id = auth.uid()`. Zo kan een user geen views loggen voor recepten van anderen.

---

## 7. Troubleshooting

### “Recent” blijft leeg

- **Check logging:** Wordt `logMealRecentViewAction` aangeroepen wanneer je een recept opent? Alleen bij **custom** recepten (`mealSource === 'custom'`); bij bv. Gemini-recepten zonder custom_meal wordt niet gelogd.
- **Check effect:** In `MealDetail.tsx` moet de useEffect met `logMealRecentViewAction` draaien bij `mealId` + `mealSource === 'custom'`. Controleer of het detailpagina-type (custom vs. niet) klopt.
- **Dev console:** Bij fout wordt in development een warning gelogd; check op RLS/FK-errors.

### DB_ERROR: “Recept niet gevonden of je hebt geen rechten om dit te loggen.”

- **Oorzaak:** Meestal PostgreSQL 23503 (foreign key) of RLS: de INSERT/upsert in `meal_recent_views` faalt omdat `meal_id` niet verwijst naar een recept van de ingelogde user (recept van ander, verwijderd, of ongeldig id).
- **Aanpak:** Controleer dat het recept een `custom_meal` is en dat `custom_meals.user_id = auth.uid()`. Gebruik geen service_role om RLS te omzeilen; los data/UI op (juiste mealId, juiste user-context).

### Ordering mismatch (recent-lijst in verkeerde volgorde)

- **Oorzaak:** Supabase `.in('id', mealIds)` op `custom_meals` geeft geen gegarandeerde volgorde; de volgorde moet uit de eerste query (`meal_recent_views` op `last_viewed_at DESC`) komen.
- **Aanpak:** In `listRecentMealsAction` wordt expliciet op `mealIdsOrdered` geïtereerd en per id de bijbehorende meal-row gemapt; de uiteindelijke `items`-array volgt daarmee de volgorde van `meal_recent_views`. Bij aanpassingen: blijf reorderen op `mealIdsOrdered` (zoals in de action).

---

## 8. Volgende stappen (niet geïmplementeerd)

- **Retention / housekeeping:** Bijv. max 200 recent-views per user; periodiek verwijderen van oudste rijen of een cleanup-job. Vereist beleid (retentieperiode of max aantal) en evt. migratie of cron.
- **Filters op Recent:** Zoekterm (`q`), mealSlot, etc. combineren met de recent-lijst (nu gebruikt Recent alleen limit/offset in de MVP).
- **Server-side logging op route-niveau:** Optioneel: view loggen in een Server Component of route handler in plaats van in een client-effect; vermindert afhankelijkheid van client-mount en kan dubbele requests vermijden.

---

_Laatste aanpassing: documentatie bij Stap 21 Recent bekeken._
