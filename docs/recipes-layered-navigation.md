# Receptenlijst — Gelaagde navigatie

Documentatie van de receptenindex: query-contract, URL-state, security en troubleshooting. Voor onderhoud en uitbreiding (favorites, recent, receptenboeken, facets).

**Relevante bestanden:**

- `src/app/(app)/recipes/page.tsx` — Server Component: searchParams parsen, `listMealsAction` aanroepen, error/result doorgeven
- `src/app/(app)/recipes/loading.tsx` — Skeleton bij navigatie (filterwijzigingen)
- `src/app/(app)/recipes/components/RecipesIndexClient.tsx` — Client: tabs, chips, drawer, zoekveld, resultaten, URL-updates
- `src/app/(app)/recipes/actions/meal-list.actions.ts` — Server action: lijst met filters, RLS, minimale kolommen

---

## 1. Overzicht gelaagde navigatie

| Laag  | Beschrijving                                                                    | Waar                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | Tabs: Alles / Opgeslagen / Recent                                               | `RecipesIndexClient`: boven de filters. MVP: alleen “Alles” functioneel; Opgeslagen/Recent zijn UI-only.                             |
| **B** | Primary chips + zoekveld: Soort (meal slot), Tijd (max minuten), Tags, zoekterm | Desktop: zichtbare chips + zoekveld. `buildQueryString` + `pushParams` in `RecipesIndexClient`.                                      |
| **C** | Mobiele filterdrawer                                                            | “Filters”-knop opent Catalyst `Dialog` met Soort, Max minuten, Bron, Tags. Zelfde filters als B + Bron + expliciet max minuten-veld. |

Actieve filters worden altijd als removable chips getoond (boven de resultaten), op desktop en mobiel.

---

## 2. URL-parameters

Alle filterstate is shareable via query string. Parsing gebeurt in `page.tsx` (`parseListMealsInput`); encoding in `RecipesIndexClient` (`buildQueryString`).

| Parameter         | Type     | Encoding                                                  | Parsing                                                             | Default | Opmerkingen                                                                                                                  |
| ----------------- | -------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `q`               | string   | `searchParams.set('q', value)`                            | `params.q` (string of eerste element array)                         | `''`    | Zoekterm op titel (naam); max 120 tekens in action.                                                                          |
| `mealSlot`        | enum     | `set('mealSlot', value)`                                  | Alleen toegestaan: `breakfast`, `lunch`, `dinner`, `snack`, `other` | —       | Soort maaltijd.                                                                                                              |
| `maxTotalMinutes` | number   | `set('maxTotalMinutes', String(value))`                   | `parseInt(params.maxTotalMinutes, 10)`; alleen als eindig en ≥ 0    | —       | Max. bereidingstijd in minuten.                                                                                              |
| `sourceName`      | string   | `set('sourceName', value)`                                | `params.sourceName`                                                 | `''`    | Filter op bronnaam (substring, ILIKE).                                                                                       |
| `tags`            | string[] | **Comma-separated**: `params.set('tags', tags.join(','))` | `params.tags`: split op `,`, dan `trim()` per deel, lege gefilterd  | `[]`    | Meerdere tags = OR (recept heeft minstens één van de tags). In action: lower + trim + uniek; max 20 tags, elk max 40 tekens. |
| `limit`           | number   | `set('limit', value)`                                     | `parseInt(params.limit, 10)`; geklemd 1–50                          | `24`    | Paginagrootte.                                                                                                               |
| `offset`          | number   | `set('offset', value)`                                    | `parseInt(params.offset, 10)`; ≥ 0                                  | `0`     | Pagina-offset.                                                                                                               |

**Reset offset bij filterwijziging:** bij elke `pushParams` wordt `offset` expliciet op `0` gezet in `buildQueryString`, zodat een nieuwe filtercombinatie op pagina 1 begint.

**Tags encoding/decoding:**

- **Encoding (client → URL):** array → `tags.join(',')` (geen spaties rond commas in de string; trim gebeurt bij parsing).
- **Decoding (URL → server):** `params.tags` (string of string[]) → split op `,` → per deel `trim()` → niet-lege strings. In de action: `tagLabelsAny` wordt verder genormaliseerd (lowercase, trim, uniek, max lengte/aantal).

---

## 3. Contract `listMealsAction`

**Bestand:** `src/app/(app)/recipes/actions/meal-list.actions.ts`

### Input (`ListMealsInput`)

| Veld              | Type                                                       | Default | Limieten                                                                   |
| ----------------- | ---------------------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| `q`               | string                                                     | `''`    | Max 120 tekens (na trim).                                                  |
| `mealSlot`        | `'breakfast' \| 'lunch' \| 'dinner' \| 'snack' \| 'other'` | —       | Optioneel.                                                                 |
| `maxTotalMinutes` | number                                                     | —       | Optioneel; indien aanwezig: int ≥ 0.                                       |
| `sourceName`      | string                                                     | `''`    | Trim.                                                                      |
| `tagLabelsAny`    | string[]                                                   | `[]`    | Max 20 labels; elk max 40 tekens; na normalisatie: trim, lowercase, uniek. |
| `limit`           | number                                                     | `24`    | 1–50.                                                                      |
| `offset`          | number                                                     | `0`     | ≥ 0.                                                                       |

### Output (`ListMealsOutput`)

- **Succes:** `{ ok: true, data: { items: MealListItem[], totalCount: number | null, limit: number, offset: number } }`
- **Fout:** `{ ok: false, error: { code: 'AUTH_ERROR' | 'VALIDATION_ERROR' | 'DB_ERROR', message: string } }`

### `MealListItem`

- `mealId`, `title`, `mealSlot`, `totalMinutes`, `servings`, `sourceName`, `sourceUrl`, `tags` (string[]), `updatedAt`. Geen andere velden; UI gebruikt alleen deze (geen SELECT \*).

### Gedrag

- **Tags:** OR-filter: recept moet minstens één van de opgegeven tags hebben (zie sectie Security voor 2-step).
- **Zoekterm `q`:** ILIKE op `custom_meals.name`; `%` en `_` worden geëscaped.
- **Bron:** ILIKE op `custom_meals.source`;zelfde escape.
- **totalCount:** komt van Supabase `count: 'exact'`; kan in randgevallen `null` zijn (zie Troubleshooting).

---

## 4. States (loading, empty, error)

| State       | Waar                                | Gedrag                                                                                                                                                                           |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading** | `src/app/(app)/recipes/loading.tsx` | Next.js route segment loader: skeleton (header, chip-achtige placeholders, grid met card-placeholders) tijdens navigatie naar `/recipes` of bij wijziging van searchParams.      |
| **Empty**   | `RecipesIndexClient.tsx`            | Als `items.length === 0`: blok met tekst “Geen recepten gevonden” + knop “Wis filters” (alleen zichtbaar als er filters actief zijn).                                            |
| **Error**   | `page.tsx`                          | Bij `!result.ok`: rode callout met `result.error.message` + link “Opnieuw proberen” (`<a href="/recipes">`). Geen client-side Supabase; retry = volledige herlaad van de pagina. |

---

## 5. Security en RLS

- **RLS-first:** Alle data voor de receptenlijst gaat via de server action `listMealsAction`. De UI gebruikt geen Supabase-client; er is geen `createClient()` in client components voor deze lijst.
- **User-context:** De action haalt `user` via `supabase.auth.getUser()` en filtert alle queries op `user_id` (of equivalente RLS). Recepten en tags zijn gebruikersgebonden.
- **Geen SELECT \*:** Alleen expliciet benodigde kolommen worden opgehaald. Voor `custom_meals` wordt `CUSTOM_MEALS_LIST_COLUMNS` gebruikt (`id,name,meal_slot,total_minutes,servings,source,source_url,updated_at`); voor tags alleen de benodigde relatie/label-kolommen.
- **Tags filtering — 2-step en performance:**  
  Het filter “recept heeft minstens één van deze tags” wordt bewust in twee stappen gedaan:
  1. Uit `recipe_tags` (voor `user_id`) de `id`’s ophalen voor de opgegeven labels (`tagLabelsAny`).
  2. Uit `recipe_tag_links` de `recipe_id`’s ophalen voor die tag-id’s; daarna `custom_meals` filteren met `.in('id', recipeIds)`.

  Reden: Supabase’s relationele filters op geneste paden zijn voor “any of these tags” minder betrouwbaar/voorspelbaar; de 2-step aanpak geeft expliciete controle en correcte OR-semantiek. Impact: bij veel tags of grote link-tabel kunnen twee extra queries worden uitgevoerd vóór de hoofdlijst-query; voor normale aantallen tags is dit acceptabel. Bij uitbreiding (bijv. facet-counts) kan caching of een materialized view overwogen worden.

---

## 6. Troubleshooting

| Probleem                                    | Mogelijke oorzaak                                                                                                     | Actie                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Geen resultaten ondanks tags**            | Tags in URL of UI niet genormaliseerd zoals de action verwacht.                                                       | Labels worden in de action **lowercase** en **trim** gezet; dubbele en lege worden eruit gefilterd. Zorg dat de UI dezelfde normalisatie toepast (zoals in `RecipesIndexClient`: tag toevoegen met `trim().toLowerCase()`). Controleer of de tag in de DB precies zo is opgeslagen (kleine letters, geen spaties). |
| **`q` zoekt niet / rare resultaten**        | Wildcards `%` of `_` in zoekterm worden als SQL-wildcards geïnterpreteerd.                                            | In `meal-list.actions.ts` worden `\`, `%` en `_` geëscaped vóór ILIKE. Als de zoekterm uit een andere bron komt (bijv. externe link), controleer of die niet als raw string wordt doorgegeven zonder deze escape.                                                                                                  |
| **Offset blijft hangen / verkeerde pagina** | Offset wordt niet gereset bij filterwijziging.                                                                        | In `RecipesIndexClient` moet bij elke `pushParams` de nieuwe URL `offset: 0` gebruiken. Controleer `buildQueryString`: daar wordt `offset: 0` gezet bij updates. Bij directe navigatie met handmatige params: zorg dat je bij nieuwe filters geen oude `offset` meeneemt.                                          |
| **totalCount null of afwijkend**            | Supabase `count: 'exact'` kan in bepaalde situaties `null` teruggeven (bijv. bij zeer grote result sets of timeouts). | De UI en types accepteren `totalCount: number                                                                                                                                                                                                                                                                      | null`. Toon geen totaal of een fallback-tekst (“Veel resultaten”) als `totalCount == null`. Wijzig geen andere filters op basis van count; gebruik count alleen voor weergave/paginatie-info. |

---

## 7. Volgende stappen (niet geïmplementeerd)

- **Favorites / Opgeslagen:** Persistente “opgeslagen” collectie (bijv. aparte tabel of vlag) en tab “Opgeslagen” koppelen aan gefilterde lijst.
- **Recent:** Persistente “recent bekeken” (bijv. cookie of tabel) en tab “Recent” koppelen aan een beperkte set recept-ids.
- **Receptenboeken:** Collecties/boeken (eigen tabel + koppeltabel); extra tab of filter “Receptenboek”.
- **Compliance / rating facets:** Filter op compliance-score of rating zodra die velden en de list-action uitgebreid zijn.
- **Tag-autosuggest:** Bij het invoeren van tags suggesties uit bestaande `recipe_tags` (per user); vereist een kleine suggestie-endpoint of action.

---

_Laatste aanpassing: documentatie bij Stap 6/7 receptenindex gelaagde navigatie._
