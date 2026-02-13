# NutriCoach Performance Analyse – Vercel Speed Insights

**Status:** Real Experience Score 67 (Needs Improvement), target >90  
**Probleem-routes:** `/dashboard` (49), `/recipes` (67), `/login` (86)  
**Sterke route:** `/recipes/[recipeId]` (100)

## Huidige bottlenecks (TTFB 3.39s, FCP 4.52s, LCP 4.6s)

### 1. Dubbele/3-voudige auth per request (grootste impact op TTFB)

| Locatie         | Actie                                 | Impact                 |
| --------------- | ------------------------------------- | ---------------------- |
| Middleware      | `auth.getUser()`                      | Blokkeert elke request |
| i18n/request.ts | `auth.getUser()` + `user_preferences` | Bij geen URL-locale    |
| Pagina          | `auth.getUser()`                      | Elke beschermde pagina |
| Server actions  | `createClient()` + `auth.getUser()`   | Per action call        |

**Gevolg:** 2–4+ auth-calls + DB-queries voordat de eerste byte wordt verstuurd.

### 2. Root layout blokkeert HTML

```ts
// src/app/layout.tsx
const locale = await getLocale(); // Kan Supabase aanroepen!
const messages = await getMessages();
const timeZone = await getTimeZone();
```

- `getLocale()` roept via `i18n/request.ts` bij geen URL-locale `createClient()` + `auth.getUser()` + `user_preferences` aan.
- Gehele HTML-response wordt pas verzonden na deze i18n-config.

### 3. Dashboard – geen streaming, alles blokkerend

- **Geen** `loading.tsx` → geen streaming, geen snelle shell.
- `force-dynamic` → geen cache.
- Pagina wacht op `getDashboardData()` (auth + 2 queries) vóór eerste render.
- 5 `dynamic(..., { ssr: false })` chart-componenten → LCP wacht tot client hydration en lazy loads.

### 4. Recipes-pagina – zware server actions

- Auth-check **vóór** Suspense → shell wacht op auth.
- `RecipesListContent`: 5 parallelle server actions:
  - `getTranslations`
  - 3× `getCatalogOptionsForPickerAction` (cuisine, protein_type, meal_slot)
  - `listMealsAction` of `listRecentMealsAction`
- Elk `getCatalogOptionsForPickerAction`: `createClient()` + `auth.getUser()` + DB-query.
- `listMealsAction`: complexe flow met tot 8–10 DB-queries (tags, favorites, meals, ratings, ingredient links, matches, enz.).

### 5. ClientOnlyApplicationLayout

- Render placeholder tot `mounted`, daarna pas echte layout.
- Geen layout shift, maar inhoud verschijnt pas na client hydration.

### 6. Vercel serverless / cold starts

- Elke serverless call maakt nieuwe connecties.
- Meerdere `createClient()` per request verergeren dit.

---

## Prioriteit: Quick Wins (< 1 dag)

### A1. Dashboard `loading.tsx` toevoegen

**Impact:** Directe verbetering van FCP/LCP door streaming; shell komt direct, inhoud daarna.

Maak `src/app/(app)/dashboard/loading.tsx` met een skeleton die op de bento-grid lijkt (filter + KPI-cards + chart placeholders).

### A2. i18n: Supabase uit kritiek pad halen

**Impact:** Snelere TTFB op root layout.

In `src/i18n/request.ts`: bij geen `requestLocale` **geen** Supabase aanroepen. Gebruik alleen:

- URL-parameter
- `Accept-Language` header
- Fallback: `nl`

Bewaar user-locale alleen voor client-side (bijv. in settings), niet in het eerste server-render pad.

### A3. Auth in middleware hergebruiken (experimenteel)

**Impact:** Minder dubbele auth-calls.

Mogelijke richting:

- User/session in header of cookie zetten na middleware-auth.
- Server components en actions deze info laten lezen i.p.v. steeds `auth.getUser()`.

Implementatie vraagt aanpassingen in Supabase SSR / next-intl; pas doen na A1/A2.

---

## Prioriteit: Medium Effort (1–3 dagen)

### B1. Catalog-options cachen

**Impact:** Minder DB-calls op `/recipes`.

- `cuisine`, `protein_type`, `meal_slot` zijn grotendeels statisch.
- Cache in memory met korte TTL (bijv. 60s) via `unstable_cache` of Redis.
- Of: één server action die alle drie dimensies ophaalt met gedeelde Supabase-client.

### B2. Dashboard: kritieke boven-the-fold content eerst

**Impact:** Betere LCP.

- Eerste zichtbare content (filter + KPI-cards) direct server-renderen.
- Charts onder de fold in Suspense met eigen `loading`-state.
- Overweeg `priority` op bovenste content in plaats van alles tegelijk te laden.

### B3. `listMealsAction` vereenvoudigen en optimaliseren

**Impact:** Snellere recipes-lijst.

- Verminder aantal queries (combineren waar mogelijk).
- `recipe_ingredient_matches` batch lookup: alleen wanneer nodig (bijv. niet bij eerste 12 items).
- Overweeg database view of RPC voor de zwaarste queries.
- Indexes controleren: `custom_meals(user_id, updated_at)`, `meal_favorites(user_id, meal_id)`, enz.

### B4. Partial Prerendering (PPR) waar mogelijk

**Impact:** Snellere shell, betere perceived performance.

- Static shell + dynamic blokken voor boven-the-fold content.
- Vereist Next.js 14+ en mogelijk experimentele flags.

---

## Prioriteit: Grotere refactors (1+ week)

### C1. Gecombineerde data-loader per route

**Impact:** Minder round-trips, snellere TTFB.

- Per route één loader die alle benodigde data ophaalt met één Supabase-client.
- Auth één keer, daarna alleen data-queries.
- Vervangt losse server actions die elk `createClient()` + `auth.getUser()` doen.

### C2. Edge runtime voor middleware

**Impact:** Lagere latency voor auth/redirects.

- Middleware naar Edge verplaatsen indien compatibel met Supabase auth.
- Snellere first-hop response.

### C3. React Server Components en streaming verder uitbouwen

**Impact:** Betere LCP en TTI.

- Meer Suspense boundaries met duidelijke loading states.
- Boven-the-fold content prioriteren en eerder streamen dan zwaardere onderdelen.

### C4. Database & Supabase optimalisatie

**Impact:** Lagere TTFB via snellere queries.

- Connection pooling (Supabase Pooler).
- Striktere indexes.
- Kleiner houden van `SELECT` (geen `*`, alleen benodigde kolommen).

---

## Meetmomenten

1. **TTFB:** Moet omlaag naar <1s (nu 3.39s).
2. **FCP:** Doel <1.8s (nu 4.52s).
3. **LCP:** Doel <2.5s (nu 4.6s).

---

## Aanbevolen volgorde

1. **A1** – Dashboard `loading.tsx` (30 min).
2. **A2** – i18n Supabase uit kritiek pad (1–2 uur).
3. **A3** – (optioneel) Auth-hergebruik, als A1/A2 niet genoeg opleveren.
4. **B1** – Catalog cache.
5. **B2** – Dashboard streaming/herstructurering.
6. **B3** – `listMealsAction` optimalisatie.

Start met A1 en A2 voor het grootste effect op RES en TTFB.
