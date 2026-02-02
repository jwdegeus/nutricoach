# Admin Receptenbeheer — canonical plek voor catalogbeheer

Dit document beschrijft waar recept-gerelateerde instellingen worden beheerd en hoe de canonical routes en tab-URL’s werken. Doel: voorkomen dat catalogbeheer weer versnipperd raakt.

---

## Routes

| Route                               | Beschrijving                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `/admin/receptenbeheer`             | Receptenbeheer-pagina met tabs. Zonder `tab` opent standaard de eerste tab (bronnen).     |
| `/admin/receptenbeheer?tab=keukens` | **Canonical entry** voor catalogbeheer: Keuken, Proteïne-type en Soort.                   |
| `/admin/receptenbeheer?tab=bronnen` | Beheer recept bronnen.                                                                    |
| `/admin/catalog`                    | **Legacy route** — redirect naar `/admin/receptenbeheer?tab=keukens`. Geen eigen UI meer. |

---

## Tab-contract

- **Geldige tab-keys:** `bronnen`, `keukens` (zoals in de page-parser: `VALID_TABS` in `receptenbeheer/page.tsx`).
- **Shareable links:** Gebruik altijd `?tab=<key>` voor directe links naar een tab, bijv. `/admin/receptenbeheer?tab=keukens`.
- **Breadcrumbs:** De tab wordt meegenomen via `options.tab` in `getBreadcrumbs()`; voor `tab=keukens` verschijnt een extra crumb “Recept keukens”.

Relevante bestanden voor tab-parsing en breadcrumbs:

- `src/app/(app)/admin/receptenbeheer/page.tsx` — `parseTab()`, `VALID_TABS`
- `src/lib/nav.ts` — `getBreadcrumbs()`, `BreadcrumbOptions.tab`
- `src/components/app/Topbar.tsx` / `src/components/app/ApplicationLayout.tsx` — geven `searchParams.tab` door aan breadcrumbs

---

## Waar beheer ik wat?

| Wat                              | Waar                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Keuken, Proteïne-type, Soort** | Receptenbeheer → tab **Recept keukens** (`?tab=keukens`). Binnen die tab: sub-tabs Keuken / Proteïne-type / Soort (CatalogAdminClient). |
| **Recept bronnen**               | Receptenbeheer → tab **Recept bronnen** (`?tab=bronnen`).                                                                               |
| **Tags / Receptenboeken**        | Binnenkort (nog geen eigen tab; placeholders).                                                                                          |

Catalog-opties (keuken, proteïne-type, soort) komen uit de tabel `catalog_options` en worden in de app o.a. gebruikt in classificatie en filters. Alleen de **Recept keukens**-tab beheert die opties; er is geen aparte `/admin/catalog`-pagina meer.

---

## Do / Don’t

**DO**

- Nieuwe catalog-dimensies (zoals soort) toevoegen als **sub-tab/dimension** binnen Receptenbeheer → Recept keukens (CatalogAdminClient), niet als nieuwe top-level admin route.
- Directe links naar catalogbeheer gebruiken: `/admin/receptenbeheer?tab=keukens`.
- Bij wijziging van tabs of routes: redirects (zoals `/admin/catalog`) en breadcrumb-logica in `nav.ts` (en eventueel Topbar/ApplicationLayout) meenemen.

**DON’T**

- Geen losse admin-routes voor recipe-instellingen zonder redirect en zonder breadcrumb-update.
- Geen nieuwe “catalog”-pagina naast Receptenbeheer; alles onder Receptenbeheer houden.

---

## Verwijzingen naar bestanden

- **Receptenbeheer (tabs):** `src/app/(app)/admin/receptenbeheer/page.tsx`
- **Receptenbeheer client (tab UI):** `src/app/(app)/admin/receptenbeheer/components/ReceptenbeheerClient.tsx`
- **Legacy redirect:** `src/app/(app)/admin/catalog/page.tsx`
- **Catalog UI (Keuken/Proteïne/Soort):** `src/app/(app)/admin/catalog/components/CatalogAdminClient.tsx`
- **Breadcrumbs + tab:** `src/lib/nav.ts`
- **Layout/breadcrumb-gebruik:** `src/components/app/ApplicationLayout.tsx`, `src/components/app/Topbar.tsx`
