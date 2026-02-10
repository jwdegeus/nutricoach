# Pantry-module – architectuur en bronnen

## Doel

De Voorraad (Pantry) module biedt drie manieren om producten toe te voegen:

1. **Barcode scannen** – camera + ZXing, daarna lookup via externe bron (Open Food Facts, later Albert Heijn).
2. **Handmatige lookup** – zoeken op naam of barcode in Open Food Facts (en later NEVO / AH).
3. **Zelf artikel toevoegen** – handmatig NEVO-ingrediënt kiezen of eigen product (toekomst).

Data wordt in de basis opgehaald uit de **Open Food Facts API**. Later kunnen meerdere bronnen vanuit de admin worden gekoppeld (o.a. Albert Heijn voor matching met de boodschappenlijst).

---

## Vertaling UI

- **Nederlands**: navigatie en pagina heten **Voorraad** (`nav.pantry` / `pantry.title`).
- **Engels**: **Pantry** blijft behouden.

---

## Productbronnen (adapters)

### Abstractie

Alle externe productbronnen worden achter een **product source adapter** geplaatst:

- **Interface**: `getByBarcode(barcode: string)`, `search(query: string)` (optioneel, rate-limited).
- **Genormaliseerd type**: `ExternalProduct` of `PantryProductCandidate` (naam, merk, barcode, nutriscore, afbeelding, bron).

Zo kunnen we:

- Eerst alleen Open Food Facts gebruiken.
- Later Albert Heijn (en andere bronnen) toevoegen zonder de pantry-UI te hoeven aanpassen.
- In de admin bepalen welke bronnen actief zijn en eventueel credentials (AH).

### Open Food Facts (eerste bron)

- **API**: [Open Food Facts API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/).
- **Huidige versie**: v2.
- **Endpoints**:
  - Product op barcode: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
  - Search: `GET /api/v2/search` of cgi – **rate limit 10 req/min**; niet geschikt voor search-as-you-type.
- **Verplicht**: Custom **User-Agent** in de vorm `AppName/Version (ContactEmail)`, bijv. `NutriCoach/1.0 (contact@example.com)`.
- **Rate limits**:
  - 100 req/min product (GET product).
  - 10 req/min search.
- Implementatie: server-side adapter in `src/lib/pantry/sources/open-food-facts.adapter.ts` (of onder `src/lib/product-sources/`), die OFF-response mapt naar het genormaliseerde producttype.

### Albert Heijn (toekomst)

- **Referentie**: [appie-go](https://github.com/gwillem/appie-go) (Go). Geen officiële open API; deze library praat met de AH mobiele API.
- **Gebruik in NutriCoach**: voor matching met de boodschappenlijst (producten die de gebruiker bij AH koopt ↔ voorraad/ingrediënten).
- **Aanpak**:
  - Ofwel een **backend proxy** (eigen endpoint dat appie-go of een Node-equivalent aanroept).
  - Ofwel een **Node/TypeScript client** tegen dezelfde AH API, als die beschikbaar is.
  - Admin: configuratie voor AH-bron (aan/uit, evt. credentials) en alleen gebruiken voor lookup/matching, niet als primaire productdatabase.

---

## Barcode-scanner

- **Library**: `@zxing/browser` (ZXing), zie [Medium-artikel](https://medium.com/@riteshnzee/zxing-barcode-qr-code-scanner-using-next-js-45a55783c0bb).
- **Flow**: client-side camera → crop centrum van het frame → `decodeFromCanvas()` elke ~100 ms → bij succes barcode string → server action `lookupProductByBarcode(barcode)` → OFF (en later andere bronnen) → genormaliseerd product tonen → “Toevoegen aan voorraad”.
- **Next.js**: scanner is een client component (`'use client'`); geen server-side camera.

---

## Toevoegen aan voorraad

- **Huidige opslag**: `pantry_items` (Supabase) op **NEVO-code** (`user_id`, `nevo_code`, `available_g`, `is_available`).
- **Flow na lookup (OFF/AH)**:
  - Product gevonden → tonen (naam, merk, nutriscore, afbeelding).
  - **Toevoegen**: optie A – zoek in NEVO op productnaam; als match → opslaan met `nevo_code`. Optie B (toekomst) – “extern” product opslaan (barcode + bron + weergavenaam) in uitbreiding van schema of aparte tabel.
- **Handmatig toevoegen**: bestaande NEVO-zoekfunctie blijft; eventueel later formulier “eigen product” (zonder barcode).

---

## Admin: meerdere bronnen

- **Toekomst**: in admin een sectie “Productbronnen voor voorraad”:
  - Open Food Facts: altijd aan, geen credentials.
  - Albert Heijn: aan/uit, evt. credentials (als AH API dat vereist).
  - Volgorde/prioriteit bij lookup (bijv. eerst OFF, dan AH).
- Configuratie wordt bij lookup door de adapter-laag gelezen; de pantry-UI blijft bron-agnostisch (gebruikt alleen het genormaliseerde producttype).

---

## Samenvatting

| Onderdeel       | Nu                          | Later                           |
| --------------- | --------------------------- | ------------------------------- |
| UI-naam         | Voorraad (NL) / Pantry (EN) | –                               |
| Barcode scanner | ZXing, client-side          | –                               |
| Product lookup  | Open Food Facts adapter     | + Albert Heijn (+ andere)       |
| Opslag          | NEVO in `pantry_items`      | Evt. uitbreiding voor extern    |
| Admin           | –                           | Bronnen aan/uit, AH credentials |

Implementatievolgorde: vertaling → OFF adapter + genormaliseerd type → barcode-scanner + server action → UI Scan / Zoeken / Handmatig.

---

## Stappenplannen voor later

Hieronder concrete stappenplannen voor de uitbreidingen die eerder als "aanpak voor later" zijn genoemd.

---

### Stappenplan 1: Albert Heijn-integratie

**Doel:** AH-producten kunnen opzoeken (barcode/zoeken) en gebruiken voor matching met boodschappenlijst en voorraad.

#### Fase 1a – Backend-proxy of TypeScript-client

1. **Keuze vastleggen**
   - **Optie A – Go-proxy:** Aparte (micro)service in Go die appie-go gebruikt; Next.js roept eigen API-route of externe URL aan die de proxy aanroept.
   - **Optie B – Node/TS in Next.js:** Als er een Node-library of reverse-engineered AH API-specificatie is, deze in dezelfde codebase gebruiken (server-only).
   - **Optie C – Edge/Serverless:** AH-aanroepen in Next.js server actions of route handlers; alleen als AH geen strikte IP/captcha heeft.

2. **Auth-model AH**
   - Documenteren: heeft de AH API anonieme toegang (zoals appie-go `GetAnonymousToken`) of zijn inloggegevens nodig?
   - Als credentials nodig: alleen server-side gebruiken; nooit in de browser. Credentials via admin-config (zie Stappenplan 2) of env vars.

3. **Implementatie proxy/client**
   - Bij **Go-proxy:** repo of submap met Go-service; endpoint bijv. `GET /api/ah/product?barcode=...`; deployment (Docker/Vercel geen Go, dus aparte host of serverless Go).
   - Bij **Node/TS:** nieuwe module bijv. `src/lib/pantry/sources/albert-heijn-client.ts` die de AH API aanroept (fetch); alleen importeren in server code.

#### Fase 1b – Adapter in dezelfde laag als OFF

4. **Albert Heijn-adapter toevoegen**
   - Bestand: `src/lib/pantry/sources/albert-heijn.adapter.ts`.
   - Functies met dezelfde “contracten” als OFF:
     - `getAlbertHeijnProductByBarcode(barcode: string): Promise<ProductLookupResult>`
     - Optioneel: `searchAlbertHeijnProducts(query: string): Promise<ProductSearchResult>` (als AH search beschikbaar is).
   - Response van AH (of proxy) mappen naar bestaand type `ExternalProduct`; `source: 'albert_heijn'`.
   - Geen OFF-types importeren; alleen `ProductLookupResult`, `ExternalProduct`, `ProductSearchResult` uit `./product-source.types`.

5. **Foutafhandeling en rate limits**
   - Net als bij OFF: bij geen resultaat `found: false`, bij rate limit of netwerkfout duidelijke `reason` + `message`.
   - Eventueel retry/backoff als AH API onstabiel is.

#### Fase 1c – Boodschappenlijst-matching

6. **Boodschappenlijst-model inzichtelijk maken**
   - Nagaan hoe de boodschappenlijst nu is opgebouwd (bijv. uit meal plan ingredienten, NEVO-codes).
   - Bepalen of er al een “winkelproduct” of “regel”-entiteit is (bijv. barcode, productnaam, winkel).

7. **Matchinglogica**
   - Definiëren: “AH-product (barcode X) matchen met voorraad” = voorraad heeft item met dezelfde barcode (toekomstige uitbreiding) of met gekoppelde NEVO-code.
   - Definiëren: “AH-product matchen met NEVO” = naam/fuzzy match of expliciete koppeltabel (barcode → nevo_code) later.
   - Implementatie: functie(s) bijv. in `src/lib/meal-plans/` of `src/lib/pantry/` die voor een barcode (of AH product-id) retourneert: in voorraad ja/nee, en optioneel voorgestelde NEVO-match.

8. **UI boodschappenlijst (optioneel in deze fase)**
   - In de boodschappenlijst-view: per regel tonen “in voorraad” indien match (als die data al beschikbaar is).
   - Later: “Scan barcode” op boodschappenlijst om regel te koppelen aan AH-product.

#### Fase 1d – Admin-configuratie AH

9. **Configuratie voor AH-bron**
   - Zie Stappenplan 2 (Admin meerdere bronnen): daar komt de vlag “Albert Heijn aan” en evt. credentials.
   - AH-adapter bij lookup alleen aanroepen als config zegt dat AH-bron actief is.

---

### Stappenplan 2: Admin – meerdere bronnen

**Doel:** In de admin kunnen productbronnen aan/uit gezet worden; lookup gebruikt alleen actieve bronnen en kan resultaten samenvoegen/prioriteren.

#### Stap 2.1 – Configuratiemodel

1. **Database**
   - Nieuwe tabel (of uitbreiding bestaande settings), bijv. `product_source_config`:
     - `id`, `source` (enum: `openfoodfacts`, `albert_heijn`), `is_enabled` (boolean), `priority` (integer, volgorde bij samenvoegen), `config_json` (optioneel: credentials of extra instellingen per bron).
   - RLS: alleen voor admin-rol of bestaande admin-check.

2. **Migrations**
   - Supabase-migratie voor de nieuwe tabel.
   - Seed of default: `openfoodfacts` altijd `is_enabled = true`, `priority = 1`; `albert_heijn` default `is_enabled = false`, `priority = 2`.

#### Stap 2.2 – Configuratie ophalen

3. **Server-side config loader**
   - Functie bijv. `getProductSourceConfig(): Promise<ProductSourceConfig[]>` die uit DB leest, gefilterd op `is_enabled = true`, gesorteerd op `priority`.
   - Geen credentials naar de client sturen; alleen `source`, `priority`, en evt. “is_configured” (of credentials aanwezig ja/nee).

#### Stap 2.3 – Lookup-aggregator

4. **Eén lookup-entrypoint**
   - Nieuwe module bijv. `src/lib/pantry/sources/lookup.ts` (of in bestaande index):
     - `lookupProductByBarcode(barcode: string): Promise<ProductLookupResult>`:
       - Roept `getProductSourceConfig()` aan.
       - Voor elke actieve bron (in volgorde priority): aanroepen van de bijbehorende adapter (`getOpenFoodFactsProductByBarcode` / `getAlbertHeijnProductByBarcode`).
       - Stoppen bij eerste `found: true`, of alle bronnen afgaan en dan `not_found` retourneren.
     - Optioneel: “alle bronnen proberen” en resultaten samenvoegen (bijv. array van `ExternalProduct` met `source` erbij); UI toont dan meerdere kaarten.

5. **Server action aanpassen**
   - `lookupProductByBarcodeAction` in `pantry-ui.actions.ts` laat de huidige directe OFF-aanroep vallen en roept de nieuwe aggregator `lookupProductByBarcode` aan.

#### Stap 2.4 – Admin-UI

6. **Pagina/sectie in admin**
   - Bijv. onder “Instellingen” of “Admin”: sectie “Productbronnen voorraad”.
   - Tabel of lijst: per bron (OFF, AH) een rij met:
     - Naam, “Aan/uit”-switch, volgorde (priority), evt. “Credentials ingesteld” (geen wachtwoord tonen).
   - Opslaan naar `product_source_config` via server action.

7. **Credentials (alleen als nodig voor AH)**
   - Formulier voor AH: velden voor login (of API key) alleen in admin; opslaan in `config_json` (versleuteld) of in env/geheim beheer. Nooit in client bundle.

---

### Stappenplan 3: Open Food Facts – zoeken (optioneel)

**Doel:** In de zoek-modus van de voorraad ook producten uit OFF kunnen zoeken, zonder type-ahead (vanwege 10 req/min).

#### Stap 3.1 – OFF search-adapter

1. **Search-endpoint OFF**
   - Gebruik OFF API v2 search (of cgi) met `search_terms=...`; response bevat lijst producten.
   - Rate limit: max 10 req/min; dus geen debounced search-as-you-type.

2. **Functie in OFF-adapter**
   - In `open-food-facts.adapter.ts`: `searchOpenFoodFactsProducts(query: string): Promise<ProductSearchResult>`.
   - Response mappen naar `ExternalProduct[]`; bij rate limit of fout `ok: false` met `reason` en `message`.

#### Stap 3.2 – UI: expliciete zoekactie

3. **Zoekmodus voorraad**
   - In “Zoeken”-tab: naast het bestaande NEVO-zoekveld een tweede blok “Zoek in Open Food Facts” (of “Zoek product in externe bronnen” als meerdere bronnen search ondersteunen).
   - **Geen** automatische zoekactie bij typen; wel een **knop** “Zoeken” die pas bij klik de OFF-search aanroept.
   - Toon resultaten onder de knop; per resultaat “Toevoegen aan voorraad” (zelfde flow als nu: NEVO-equivalent kiezen of later extern product).

4. **Rate limit feedback**
   - Bij response “rate_limited” een duidelijke melding: “Te veel zoekverzoeken. Probeer over een minuut opnieuw.”
   - Optioneel: client-side cooldown (knop 60 seconden disabled na een zoekactie).

#### Stap 3.3 – Server action

5. **Search-action**
   - Nieuwe server action bijv. `searchExternalProductsAction(query: string)` die alleen OFF search aanroept (of later via aggregator meerdere bronnen die `search` hebben).
   - Zelfde auth-check als andere pantry-actions.

---

### Volgorde van uitvoering (aanbevolen)

| Volgorde | Stappenplan                | Afhankelijk van        |
| -------- | -------------------------- | ---------------------- |
| 1        | Stappenplan 2 (Admin)      | –                      |
| 2        | Stappenplan 1 (AH)         | Stappenplan 2 (config) |
| 3        | Stappenplan 3 (OFF search) | – (onafhankelijk)      |

Eerst admin (config + aggregator) doen, dan AH-adapter en -proxy; OFF search kan parallel of later.
