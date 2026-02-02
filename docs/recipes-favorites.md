# Favorites / Opgeslagen — Data model, RLS, actions, UI

Documentatie van de “Opgeslagen”-functie: schema, RLS, server actions, lijst-integratie en UI-wiring. Voor onderhoud en uitbreiding (Recent, receptenboeken).

**Relevante bestanden:**

- `supabase/migrations/20260231000018_meal_favorites.sql` — Tabel, constraints, indexen, RLS
- `src/app/(app)/recipes/actions/meal-favorites.actions.ts` — `isMealFavoritedAction`, `setMealFavoritedAction`
- `src/app/(app)/recipes/actions/meal-list.actions.ts` — `collection`, `MealListItem.isFavorited`
- `src/app/(app)/recipes/components/RecipesIndexClient.tsx` — Receptenlijst: card toggle, sync vanuit list
- `src/app/(app)/recipes/[recipeId]/components/MealDetail.tsx` — Receptdetail: header toggle

---

## 1. Schema `meal_favorites`

**Migratie:** `supabase/migrations/20260231000018_meal_favorites.sql`

| Kolom        | Type        | Constraints                                                    |
| ------------ | ----------- | -------------------------------------------------------------- |
| `id`         | UUID        | PRIMARY KEY, DEFAULT gen_random_uuid()                         |
| `user_id`    | UUID        | NOT NULL, REFERENCES auth.users(id) ON DELETE CASCADE          |
| `meal_id`    | UUID        | NOT NULL, REFERENCES public.custom_meals(id) ON DELETE CASCADE |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()                                        |

**Constraints:**

- **UNIQUE (user_id, meal_id)** — Eén favoriet per user per recept; naam: `meal_favorites_user_meal_unique`.

**Indexen:**

- Unieke index op `(user_id, meal_id)` via de UNIQUE-constraint.
- `idx_meal_favorites_user_created` op `(user_id, created_at DESC)` — lijst “Opgeslagen” (nieuwste eerst).
- `idx_meal_favorites_meal_id` op `(meal_id)` — reverse lookups (“is dit recept opgeslagen?”).

**Cascade:** Bij verwijderen van een user of een recept verdwijnen de bijbehorende favorietenrijen.

---

## 2. RLS policies en rationale

**RLS:** Aan op `meal_favorites`.

| Policy                              | Operatie | Voorwaarde                                                                                                            | Rationale                                                                               |
| ----------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Users can select own meal favorites | SELECT   | `auth.uid() = user_id`                                                                                                | Alleen eigen favorieten zichtbaar.                                                      |
| Users can insert own meal favorites | INSERT   | `auth.uid() = user_id` **én** `EXISTS (SELECT 1 FROM custom_meals m WHERE m.id = meal_id AND m.user_id = auth.uid())` | Alleen eigen recepten mogen worden opgeslagen; geen favorieten op recepten van anderen. |
| Users can delete own meal favorites | DELETE   | `auth.uid() = user_id`                                                                                                | Alleen eigen favorieten verwijderen.                                                    |

**Geen UPDATE:** Favoriet is alleen aan/uit; er is geen policy voor UPDATE.

**Waarom INSERT alleen voor eigen recepten:** Recepten zijn per user (`custom_meals.user_id`). “Opgeslagen” is een persoonlijke lijst van eigen recepten; de INSERT-policy dwingt af dat `meal_id` naar een `custom_meal` van de ingelogde user verwijst.

---

## 3. Server actions — contract

**Bestand:** `src/app/(app)/recipes/actions/meal-favorites.actions.ts`

### `isMealFavoritedAction({ mealId })`

- **Input:** `IsMealFavoritedInput`: `{ mealId: string }` (Zod: uuid).
- **Output:** `ActionResult<{ isFavorited: boolean }>` — `ok: true` met `data: { isFavorited }`, of `ok: false` met error.
- **Query:** `meal_favorites` met `select('id')`, `eq('user_id', uid)`, `eq('meal_id', mealId)`, `limit(1)`, `maybeSingle()` — geen SELECT \*.
- **Gebruik:** Receptdetail voor init state; de receptenlijst gebruikt dit niet meer (zie listMealsAction).

### `setMealFavoritedAction({ mealId, isFavorited })`

- **Input:** `SetMealFavoritedInput`: `{ mealId: string; isFavorited: boolean }` (Zod: uuid + boolean).
- **Output:** `ActionResult<{ isFavorited: boolean }>` — resultaatstatus na schrijven.
- **Gedrag:**
  - **isFavorited === true:** `upsert({ user_id, meal_id }, { onConflict: 'user_id,meal_id' })`. Idempotent; bestaande rij blijft geldig.
  - **isFavorited === false:** `delete().eq('user_id', uid).eq('meal_id', mealId)`. Idempotent; geen fout als rij niet bestaat.
- **Foutafhandeling:** Bij DB-fout (o.a. FK/RLS, bv. code 23503) wordt een duidelijke NL-message teruggegeven (zie Troubleshooting).

---

## 4. listMealsAction — collection en isFavorited

**Bestand:** `src/app/(app)/recipes/actions/meal-list.actions.ts`

### `collection: 'all' | 'saved'`

- **Default:** `'all'`.
- **'saved':** Alleen recepten die in `meal_favorites` staan voor de ingelogde user (2-step filter: eerst favorite meal_ids ophalen, dan `custom_meals` filteren met `.in('id', ...)`).

### `MealListItem.isFavorited`

- **Type:** `boolean`.
- **Vulling:** Na de `custom_meals`-query: één extra query op `meal_favorites` met `select('meal_id')`, `eq('user_id', uid)`, `in('meal_id', mealIds)` (mealIds = ids van de geretourneerde meals). Resultaat in een `Set`; per item: `isFavorited = favoritedSet.has(mealId)`.
- **Geen N+1:** Eén favorieten-query per lijst; geen per-card lookups meer in de UI.

---

## 5. UI-wiring

### Receptenlijst — card toggle

**Bestand:** `src/app/(app)/recipes/components/RecipesIndexClient.tsx`

- **Bron van waarheid:** `listResult.items[].isFavorited` wordt in een `useEffect` gesynchroniseerd naar `favoritedByMealId`; render gebruikt `favoritedByMealId[item.mealId] ?? item.isFavorited` (optimistic override, anders server).
- **Toggle:** `setMealFavoritedAction({ mealId, isFavorited })` met optimistic update: direct UI, `favoriteSavingByMealId` tijdens request, bij succes state bijwerken; bij fout revert + toast.
- **Tab “Opgeslagen”:** Bij unfavorite (isFavorited → false) wordt `router.refresh()` aangeroepen zodat de lijst opnieuw wordt geladen en het item uit de “Opgeslagen”-lijst verdwijnt.
- **Geen init-calls:** Geen `isMealFavoritedAction` meer per card; alles uit listMealsAction.

### Receptdetail — header toggle

**Bestand:** `src/app/(app)/recipes/[recipeId]/components/MealDetail.tsx`

- **Init:** Alleen bij `mealSource === 'custom'` en `mealId`: één keer `isMealFavoritedAction({ mealId })` in een `useEffect`; resultaat in `isFavorited` en `favoriteLoaded`. Geen toast bij init-fout; default false.
- **Toggle:** `setMealFavoritedAction({ mealId, isFavorited })` met optimistic update; bij fout revert + toast.
- **Plaatsing:** Zelfde actierij als “Classificeren” en “AI Magician”; knop alleen zichtbaar bij custom recepten.

---

## 6. UX-contract (labels en gedrag)

| Situatie               | Label / tekst                                                     |
| ---------------------- | ----------------------------------------------------------------- |
| Niet opgeslagen, actie | “Opslaan” (knop/label/title)                                      |
| Opgeslagen, actie      | “Opgeslagen” (knop/label); aria/title: “Verwijder uit opgeslagen” |
| Fout bij opslaan       | Toast: “Opslaan mislukt” + error.message                          |
| Fout bij ontopslaan    | Toast: “Verwijderen uit opgeslagen mislukt” + error.message       |

**router.refresh():**

- Alleen in de receptenlijst, tab “Opgeslagen”, na een succesvolle unfavorite (toggle naar “niet opgeslagen”). Doel: item direct uit de lijst laten verdwijnen zonder handmatige navigatie.

---

## 7. Security

- **RLS-first:** Alle lees/schrijf naar `meal_favorites` via server actions met `createClient()`; user-context uit `auth.getUser()`. Geen Supabase-client in de UI.
- **Geen SELECT \*:** Alleen benodigde kolommen: bij favorieten `id` of `meal_id`; bij listMealsAction de bestaande minimale kolommen + één favorieten-query met alleen `meal_id`.
- **Insert policy — eigen recept vereist:** De INSERT-policy op `meal_favorites` vereist dat `meal_id` verwijst naar een `custom_meals`-rij met `user_id = auth.uid()`. Zo kan een user geen recepten van anderen als “opgeslagen” opslaan.

---

## 8. Troubleshooting

### DB_ERROR: “Recept niet gevonden of je hebt geen rechten om het op te slaan.”

- **Oorzaak:** Meestal PostgreSQL 23503 (foreign key violation) of RLS: de INSERT in `meal_favorites` faalt omdat `meal_id` niet verwijst naar een recept van de ingelogde user (recept van ander, of ongeldig id).
- **Aanpak:** Controleer dat `meal_id` een geldige `custom_meals.id` is en dat `custom_meals.user_id = auth.uid()`. Gebruik geen service_role om RLS te omzeilen; los eventuele data/UI-bugs op (verkeerde id of verkeerde user-context).

### isFavorited klopt niet / lijkt achter te lopen

- **Receptenlijst:** De lijst haalt `isFavorited` uit `listResult.items`; na navigatie of `router.refresh()` komt er nieuwe data van de server. De client synct `favoritedByMealId` in een `useEffect` met `listResult.items`; bij een nieuwe lijst hoort de weergave weer overeen te komen met de server.
- **Detail:** Init komt uit `isMealFavoritedAction`; na een toggle wordt de lokale state direct bijgewerkt. Bij een volgende paginaload wordt opnieuw `isMealFavoritedAction` aangeroepen.

---

## 9. Volgende stappen (niet geïmplementeerd)

- **Recent:** Eigen tabel of tracking voor “recent bekeken” recepten; aparte tab of filter.
- **Receptenboeken:** Collecties/boeken (eigen tabel + koppeltabel); “Opgeslagen” kan dan evt. één specifiek boek zijn of blijven zoals nu.

---

_Laatste aanpassing: documentatie bij Stap 16 Favorites/Opgeslagen._
