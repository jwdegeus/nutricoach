# Store Catalog Connectors – documentatie

Documentatie voor developers/admins: hoe store catalog sync werkt en hoe je een nieuwe winkeladapter toevoegt.

---

## 1) Overzicht

Het **store catalog**-systeem synchroniseert productcatalogi van webshops naar de NutriCoach-database. Per winkel:

1. Een **sitemap-URL** wordt opgehaald; daaruit komen product-URL’s.
2. Per product-URL wordt de pagina opgehaald en **JSON-LD** (Product-schema) geëxtraheerd.
3. Producten en eventuele varianten worden **idempotent geüpsert** in `store_products` en `store_product_variants`.
4. Bij een **full run** kunnen producten die niet meer in de sitemap staan als inactief worden gemarkeerd (deactivate sweep).

**Winkel toevoegen**: Gebruikers kunnen geen winkel handmatig aanmaken. In de admin opent "Winkel toevoegen" een **lookup** op de tabel **store_templates**. Daar staan vooraf gedefinieerde winkels; kiezen daaruit maakt een **store** aan voor de huidige gebruiker (owner_id). In **store_templates** staat per winkel een **connector_type**: `sitemap_xml` (sitemap/XML-scraping) of `api` (API-koppeling, bijv. ah.nl – geen XML-scraping). Die scheiding bepaalt later hoe de sync voor die winkel werkt.

---

## 2) Datamodel

| Tabel                      | Doel                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **store_templates**        | Vooraf gedefinieerde winkels voor "Winkel toevoegen"; connector_type: api vs sitemap_xml.                                                 |
| **stores**                 | Definitie per winkel (per gebruiker): naam, base_url, sitemap_url, is_active, connector_config (JSONB; bevat connectorType uit template). |
| **store_products**         | Eén rij per product per winkel; soft-deactivate via is_active + last_seen_at.                                                             |
| **store_product_variants** | Optionele varianten (bijv. gewicht/maat) per product.                                                                                     |
| **store_catalog_runs**     | Log per sync-run: status, started_at, finished_at, stats (JSONB), error_summary.                                                          |

**Belangrijkste kolommen**

- **stores**: `id`, `owner_id`, `name`, `base_url`, `sitemap_url`, `is_active`, `sync_frequency`, `connector_config`, `created_at`, `updated_at`.
- **store_products**: `id`, `store_id`, `external_key` (uniek per store), `product_url`, `title`, `brand`, `category_path`, `image_url`, `currency`, `price_cents`, `availability`, `unit_label`, `sku`, `gtin`, `lastmod`, `last_seen_at`, `is_active`, `raw_source`, `created_at`, `updated_at`.
- **store_product_variants**: `id`, `store_product_id`, `variant_key`, `title`, `price_cents`, `currency`, `sku`, `gtin`, `is_active`, `created_at`, `updated_at`.
- **store_catalog_runs**: `id`, `store_id`, `status` (running/succeeded/failed), `started_at`, `finished_at`, `stats` (o.a. processed, upserted, variantsUpserted, extractFailed, noProductFound, deactivated), `error_summary`, `created_at`.

RLS is op alle tabellen actief; in de cron wordt een **admin/service_role** client gebruikt (geen user-context). Beleid: geen `SELECT *` in policies; alleen benodigde kolommen.

---

## 3) Config: connector_config

`connector_config` is een JSONB-kolom op `stores`. Ondersteunde keys en defaults:

| Key                   | Type    | Default | Beschrijving                                                                                                                                                                                     |
| --------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **rateLimitRps**      | number  | 2       | Requests per seconde bij het ophalen van de sitemap (en evt. detail-pagina’s).                                                                                                                   |
| **detailBatchSize**   | number  | 200     | Aantal product-URL’s per batch in één run. Zonder full mode wordt alleen de eerste batch verwerkt.                                                                                               |
| **detailConcurrency** | number  | 3       | Aantal gelijktijdige detail-fetches binnen een batch.                                                                                                                                            |
| **detailDelayMs**     | number  | 0       | Pauze in ms tussen elke detail-fetch. Voor Ekoplaza: 2000.                                                                                                                                       |
| **fullSync**          | boolean | false   | Indien true: bij elke run alle sitemap-URL's verwerken (in chunks) én deactivate sweep uitvoeren. Overschrijft het effect van alleen `?full=1` op de cron niet – beide kunnen full gedrag geven. |
| **productUrlsOnly**   | boolean | false   | Indien true: alleen URL's die eindigen op .html meenemen. Voor sitemaps die producten, categorieën en blog mixen (bijv. versenoten.nl).                                                          |

Defaults worden in code toegepast als de key ontbreekt of ongeldig is.

**URL-rewrite (www vs non-www)**: Als de sitemap URL's met een andere host bevat dan de `base_url` van de winkel (bijv. sitemap: `versenoten.nl`, base_url: `www.versenoten.nl`), worden product-URL's automatisch herschreven naar het origin van `base_url`. Dit lost veel FETCH_FAILED:404 op bij PrestaShop-winkels.

---

## 4) Cron

- **Endpoint**: `GET /api/cron/store-catalog`
- **Auth**: Header `x-cron-secret` of query `?secret=` moet gelijk zijn aan de waarde van de env var **CRON_SECRET**. Geen secret in de docs; alleen de env var naam.
- **Full run**: `?full=1` — verwerkt alle sitemap-URL’s (in batches) en voert de deactivate sweep uit. Zonder `full=1` (en zonder `fullSync` in connector_config) wordt alleen de eerste batch (detailBatchSize) verwerkt.
- **Vercel Cron**: Stel bijvoorbeeld wekelijks in (bijv. `0 0 * * 0`). Aanroep: `GET https://<jouw-domein>/api/cron/store-catalog` met header `x-cron-secret: <CRON_SECRET>`.
- **Handmatig**: Zelfde URL met `x-cron-secret` (of `?secret=...`). Full run handmatig: `.../api/cron/store-catalog?full=1` (plus secret).

---

## 5) Extractor-pipeline

- **Aanpak**: Eerst **JSON-LD** op de pagina zoeken (Product-schema). Geen HTML-scraping; alles via `extractProductFromUrl` (fetch + JSON-LD parse).
- **Failure modes** (typecodes van `StoreCatalogExtractError`):
  - **FETCH_FAILED** – netwerk/timeout of geen body.
  - **NOT_HTML** – response is geen HTML.
  - **TOO_LARGE** – response overschrijdt max bytes.
  - **PARSE_FAILED** – ongeldige of niet-ondersteunde JSON-LD.
  - **NO_PRODUCT_FOUND** – geen Product JSON-LD op de pagina.

Sync telt `extractFailed` (overige fouten) en `noProductFound` apart in de run-stats.

---

## 6) Deactivate sweep (alleen full mode)

- **Wanneer**: Alleen als de run in **full mode** draait (cron met `?full=1` of store met `fullSync: true`).
- **Wat**: Producten van die store waar `last_seen_at` **ouder** is dan `runStartedAt` en nog `is_active = true` zijn, worden op `is_active = false` gezet.
- **Rationale**: Alleen bij een volledige sitemap-pass weten we dat een product dat niet in de sitemap zat, waarschijnlijk verdwenen is; bij incrementele runs zouden we anders te veel producten ten onrechte deactiveren.

---

## 7) Search

- **Huidige aanpak**: Zoeken in `store_products` via **ILIKE** op `title` en `brand`. Speciale tekens voor ILIKE (`%`, `_`, `\`) worden geëscaped; zoekterm wordt in `%...%` gezet voor partial match. Filter: standaard `is_active = true`; optioneel filter op `store_id`.
- **Toekomst**: FTS (full-text search) of trigram-indexen kunnen voor betere performance en relevanter zoeken worden toegevoegd; nu blijft het bij ILIKE.

---

## 8) Privacy / logging

- **Geen product- of sitemap-URL’s in logs**. In de cron en sync worden alleen **hostnames** (bijv. uit sitemap-URL) en **aantallen** gelogd (urls, processed, upserted, variantsUpserted, extractFailed, noProductFound, deactivated).
- **error_summary** op runs: kort (bijv. eerste 128 teksten van een foutmelding), geen PII/URL’s. Zie ook de migratie-comment op `store_catalog_runs.error_summary`.

---

## 9) Winkel toevoegen (lookup) en connector_type

- **Gebruiker**: In de admin kiest "Winkel toevoegen" een winkel uit **store_templates**. Er is geen formulier om een winkel volledig handmatig aan te maken.
- **connector_type in store_templates**:
  - **sitemap_xml** – Sync verloopt via sitemap + detailpagina’s (JSON-LD). Standaard voor o.a. Ekoplaza, Pit&Pit.
  - **api** – Winkel heeft een API-koppeling (bijv. ah.nl); geen sitemap/XML-scraping. De cron kan later op `connector_config.connectorType === 'api'` andere logica gebruiken.
- Nieuwe winkels toevoegen aan de catalogus: insert in **store_templates** (bijv. via migratie of backend). Voor ah.nl: rij met `connector_type = 'api'` en passende base_url/config.

---

## 10) Nieuwe shop in catalogus (store_templates) – checklist

1. **Sitemap of API** – Bepaal of de winkel sitemap/XML gebruikt of een API (zoals ah.nl).
2. **Sitemap vinden** (bij sitemap_xml) – Product-sitemap-URL (bijv. `https://winkel.nl/sitemap-products.xml`).
3. **Test-URL** (bij sitemap_xml) – Controleer of een productpagina **JSON-LD** met type `Product` bevat.
4. **Template aanmaken** – Insert in `store_templates` met name, base_url, sitemap_url (of null bij api), connector_type (`sitemap_xml` of `api`), connector_config.
5. **Full run draaien** (bij sitemap_xml) – Eerste keer: cron met `?full=1` (en secret).
6. **Run-stats controleren** – In `store_catalog_runs`: status en stats (processed, upserted, extractFailed, noProductFound, deactivated).
