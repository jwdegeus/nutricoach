# Recept-ingrediënt ↔ Database-ingrediënt ↔ Winkelproduct: analyse en aanpak

Dit document analyseert de huidige codebase en stelt een aanpak voor om drie lagen aan elkaar te knopen: **recept-ingrediënten (tekst)**, **ingrediënten in de database (NEVO/custom/FNDDS)** en **producten die je bij winkels bestelt (store_products)**. Daarna: hoe AI-automatisering dit kan versimpelen.

---

## 1) Huidige staat in de codebase

### 1.1 Recept-ingrediënten (alleen tekst)

- **Bron**: Recepten worden geparsed (Gemini bij import, of handmatig) en opgeslagen in `custom_meals` met `meal_data`.
- **Structuur** (in `meal_data`):
  - **`ingredients`**: array van regels met o.a. `name`, `quantity`, `unit`, `note` (alleen tekst).
  - **`ingredientRefs`**: array, parallel aan `ingredients`, met de **koppeling** naar de database (zie hieronder).
- **Locatie**: o.a. `meals.actions.ts` (updateRecipeContentAction, ingredientRefs in meal_data), `MealDetailPageClient.tsx`, `IngredientRowWithNutrition.tsx`.

### 1.2 Koppelsysteem: tekst → nutriënten (NEVO, custom, FNDDS)

- **Tabel**: `recipe_ingredient_matches`
  - Kolommen: `normalized_text`, `source` ('nevo' | 'custom' | 'fndds'), `nevo_code`, `custom_food_id`, `fdc_id`.
  - Eén rij per genormaliseerde ingrediënttekst: bv. "ui" → NEVO 123 of custom_food_id X of fdc_id Y.
- **Flow**:
  1. Gebruiker ziet een recept-ingrediënt zonder koppeling → "Koppelen".
  2. Zoeken in NEVO-, custom_foods- en FNDDS-candidaten (`searchIngredientCandidatesAction`).
  3. Gebruiker kiest een kandidaat → opslaan in `recipe_ingredient_matches` + in dit recept `meal_data.ingredientRefs[index]` invullen met o.a. `displayName`, `nevoCode`/`customFoodId`/`fdcId`, `quantity`, `unit`, `quantityG`.
- **Resultaat**: Recept-ingrediënttekst is gekoppeld aan een **voedingsbron** (macro’s en nutriënten). Die refs worden gebruikt voor recept-nutritie en (waar van toepassing) voor meal plans.

### 1.3 Meal plan en boodschappenlijst

- **Meal plan**: Maaltijden hebben `ingredientRefs` met o.a. `nevoCode` (string), `quantityG`, `displayName`, `tags`. In de huidige agent/schema zijn refs **NEVO-georiënteerd** (nevoCode verplicht in het schema).
- **Boodschappenlijst**: `MealPlannerShoppingService.buildShoppingList`:
  - Aggregeert over alle dagen/maaltijden op **nevoCode**.
  - Haalt naam/categorie uit NEVO (`getNevoFoodByCode`).
  - Vergelijkt met voorraad (`pantry_items` op `nevo_code`).
  - Output: `ShoppingListItem`: nevoCode, name, requiredG, availableG, missingG, category.
- **Gap**: Custom/FNDDS-ingrediënten in recepten hebben geen plek in de huidige shopping list (die alleen op nevoCode aggregeert). Uitbreiding naar (source + id) is mogelijk maar nu nog niet gedaan.

### 1.4 Winkelproducten (store catalog)

- **Tabellen**: `stores`, `store_products`, `store_product_variants`, `store_catalog_runs`.
- **store_products**: per winkel o.a. `title`, `brand`, `gtin`, `product_url`, `price_cents`, `category_path`, `is_active`. Sync vanuit sitemaps (bv. Pit&Pit) + JSON-LD extractie.
- **Er is nog geen koppeling** tussen:
  - recept-ingrediënt / ingredientRef (NEVO/custom/FNDDS) en
  - een concreet winkelproduct (`store_product_id`).

Samengevat:

- **Recept-tekst → Database-ingrediënt (voeding)** is geregeld via `recipe_ingredient_matches` + `meal_data.ingredientRefs`.
- **Database-ingrediënt (NEVO) → Boodschappenlijst** is geregeld via meal plan `ingredientRefs` en shopping service (NEVO + voorraad).
- **Boodschappenlijst-item / ingrediënt-concept → Winkelproduct** ontbreekt: er is geen model of UI om te zeggen “dit lijstregel wordt ingekocht als dit product bij deze winkel”.

---

## 2) Gewenste keten

Doel is drie lagen eenduidig te verbinden:

1. **Recept-ingrediënt (tekst)**  
   → gekoppeld aan **één voedingsbron** (NEVO/custom/FNDDS)  
   → dat is al zo via `recipe_ingredient_matches` + `ingredientRefs`.

2. **Voedingsbron (NEVO/custom/FNDDS)**  
   → vertaald naar een **“inkoop-concept”**: wat je op de lijst zet (naam, evt. hoeveelheid).  
   → Voor NEVO: naam + nevo_code. Voor custom/FNDDS: naam + id. Shopping list kan later uitgebreid worden naar (source, id) naast alleen nevoCode.

3. **Inkoop-concept**  
   → gekoppeld aan **één of meer winkelproducten** (per winkel): “bij Pit&Pit koop ik dit als product X”.  
   → Dit is de **nieuwe** laag: een koppeltabel of -logica tussen “ingrediënt/concept” en `store_products`.

Daarmee ontstaat:

- Recept → ingrediënttekst → match → NEVO/custom/FNDDS (voeding).
- Zelfde match → “ingrediënt op boodschappenlijst” (naam + hoeveelheid).
- Boodschappenlijst-regel → (optioneel) voorgesteld/gekozen winkelproduct per winkel → link naar `store_products` (URL, prijs, GTIN).

---

## 3) Voorstel: koppeling ingrediënt ↔ winkelproduct

### 3.1 Concept

- **Ingrediënt-identiteit** in de app is nu: ofwel **nevo_code**, ofwel **custom_food_id**, ofwel **fdc_id** (FNDDS). Die identiteit heeft een weergavenaam (displayName / NEVO naam / custom naam).
- **Winkelproduct** is een rij in `store_products` (per store): titel, GTIN, URL, prijs.
- Koppeling: “voor dit ingrediënt (nevo_code of custom_food_id of fdc_id) kies ik bij deze winkel dit store_product”.

### 3.2 Optie A: Koppeltabel (aanbevolen)

Nieuwe tabel, bijvoorbeeld:

- **`ingredient_store_product_links`** (of `shopping_ingredient_store_links`):
  - `id` (uuid)
  - **Ingrediënt**: `nevo_code` (nullable), `custom_food_id` (nullable), `fdc_id` (nullable), met constraint: precies één van de drie gevuld.
  - **Winkel**: `store_id` (FK naar `stores`).
  - **Product**: `store_product_id` (FK naar `store_products`).
  - **Scope**: `user_id` (nullable) = user-specifieke voorkeur; null = globale/systeem-suggestie.
  - Uniek: bv. `(user_id, store_id, nevo_code)` (en evt. variant voor custom_food_id / fdc_id) zodat één gebruiker per winkel één “standaard” product kiest voor dat ingrediënt.

Gebruik:

- Boodschappenlijst toont per regel (nevoCode + naam, later uitbreidbaar naar custom/FNDDS) een **voorgesteld product** per winkel: lookup in deze tabel (eerst op user_id, dan eventueel globaal).
- In de UI: “Bij Pit&Pit: [Product X] – €Y” met link; gebruiker kan een ander product kiezen en dan een rij in deze tabel (bij)schrijven.
- Zoekfunctie: als er nog geen link is, zoek in `store_products` op titel/merk (bv. ILIKE op `title`/`brand`); toon suggesties; bij keuze insert in koppeltabel.

### 3.3 Optie B: Alleen zoeken, geen opslag

- Geen koppeltabel; bij tonen boodschappenlijst altijd live zoeken in `store_products` op naam (displayName / NEVO naam).
- Nadeel: geen leer-effect, geen vaste “dit koop ik altijd voor kipfilet bij Pit&Pit”.

Aanbeveling: **Optie A** (koppeltabel) voor stabiele suggesties en minder herhaald zoekwerk.

### 3.4 GTIN/barcode

- `store_products` heeft `gtin`; `pantry_items` heeft `barcode` voor externe producten.
- Matching op GTIN is ideaal waar beschikbaar (zelfde product). NEVO heeft geen barcode; custom foods kunnen later barcode krijgen. Waar GTIN beschikbaar is (bv. bij toevoegen uit OFF/AH), kan die meegenomen worden in matching. De koppeltabel kan desnoods later uitgebreid worden met “prefer GTIN” als er meerdere kandidaten zijn.

---

## 4) AI-automatisering om het te versimpelen

### 4.1 Suggesties voor koppeling recept-tekst → NEVO/custom/FNDDS (bestaat deels)

- **Bestaand**: Zoeken op genormaliseerde tekst + NEVO/custom/FNDDS-candidaten; gebruiker kiest. Er is al “Mogelijk bedoelde u …?”-achtige logica via `recipe_ingredient_matches`.
- **Uitbreiding met AI**:
  - **Batch-suggestie**: Voor alle ongekoppelde ingrediënten in een recept: in één prompt de lijst tekstregels + top-N candidaten per regel; model kiest per regel de beste match (nevo/custom/fndds + id). Gebruiker ziet “AI stelt voor: ui → NEVO 123” en kan accepteren/afwijzen. Accept = zelfde flow als nu (opslaan in matches + ingredientRefs).
  - **Normalisatie**: AI kan recept-tekst normaliseren (synoniemen, eenheden, typo’s) vóór lookup, zodat `normalized_text` en zoektermen beter matchen.

### 4.2 Suggesties voor koppeling ingrediënt → winkelproduct (nieuw)

- **Zoeken**: Voor een gegeven `displayName` of NEVO-naam: zoek in `store_products` (title, brand) met ILIKE of FTS. Sorteer op relevantie. Geen AI nodig voor eerste versie.
- **AI-verbetering**:
  - **Query-uitbreiding**: Van “kipfilet” naar “kipfilet biologisch” of “kip filet stuk” afhankelijk van winkel/voorkeur (bijv. uit user preferences). Eén korte prompt: “uitbreiden zoekterm voor webshop”.
  - **Beste match kiezen**: Gegeven één ingrediënt-naam + een lijst van 5–10 store-producttitels: “welke producttitel hoort het beste bij dit ingrediënt?”. Output: één store_product_id. Zo kun je automatisch een voorstel doen voor de koppeltabel zonder dat de gebruiker handmatig hoeft te kiezen.
  - **Leren van keuzes**: Als de gebruiker vaak product X kiest voor “Kipfilet” bij Pit&Pit, kan dat als positief signaal worden opgeslagen (in de koppeltabel met user_id). Volgende keer eerst dit product tonen.

### 4.3 Boodschappenlijst genereren met winkelproducten

- **Huidige flow**: Meal plan → ingredientRefs (nevoCode, quantityG) → aggregeren → shopping list (nevoCode, name, requiredG, missingG).
- **Uitbreiding**:
  - Per shopping list item: lookup in `ingredient_store_product_links` (user + store) → voorgesteld `store_product_id`. Als geen link: zoek in `store_products` op naam, toon top 3; optioneel AI “beste match” zoals hierboven.
  - Output: zelfde lijst + per regel optioneel “Bij [Winkel]: [Titel] – €… [Link]” en knop “Ander product kiezen”.
- **AI in batch**: “Vul voor alle regels de winkelproduct-suggesties in” (achtergrond): voor elk item zoek + optioneel AI-keuze, schrijf koppeltabel (bijv. als user_id=null of “suggestie” flag), zodat de gebruiker bij openen van de lijst meteen suggesties ziet.

### 4.4 Beperkingen en veiligheid

- **Kosten**: Elke AI-aanroep kost tokens. Batch-suggesties beperken tot bv. max 20 regels per keer of alleen bij expliciete “AI vul in”-actie.
- **Niet hard opleggen**: AI-suggesties altijd tonen als suggestie; eindbeslissing bij de gebruiker (één klik accepteren of handmatig ander product kiezen).
- **Audit**: Log niet alle prompts, wel of er een suggestie is geaccepteerd/afgewezen (optioneel) om later model te verbeteren.

---

## 5) Implementatiestappen (in volgorde)

1. **Schema**  
   Migratie: tabel `ingredient_store_product_links` (of gekozen naam) met (user_id, store_id, nevo_code/custom_food_id/fdc_id, store_product_id), constraints, RLS, indexes.

2. **Backend**
   - Lookup: “geef voorgesteld store_product voor (user, store, nevo_code)” (en evt. custom_food_id/fdc_id).
   - Zoekfunctie: zoek in `store_products` op title/brand (filter op store_id, is_active).
   - Mutaties: “sla link op” / “verwijder link”.

3. **Shopping list uitbreiden**
   - In `MealPlannerShoppingService` (of daaromheen): na build van shopping list items, per item (nevoCode + store_ids) voorgestelde store_product ophalen en meegeven in response.
   - Types uitbreiden: bv. `ShoppingListItem` krijgt optioneel `suggestedStoreProducts?: { storeId, storeName, storeProductId, title, productUrl, priceCents }[]`.

4. **UI boodschappenlijst**
   - Per regel: toon naam, hoeveelheid, ontbrekende g; toon per winkel de voorgestelde productkaart (titel, prijs, link).
   - “Ander product kiezen” opent zoekmodal; bij keuze: link opslaan en lijst verversen.

5. **AI (optioneel, later)**
   - Batch “Koppel recept-ingrediënten” (tekst → NEVO/custom/FNDDS) met één AI-aanroep; accept/afwijzen per regel.
   - “Stel winkelproduct voor” per ingrediënt: zoek top-N, AI kiest één product, opslaan als suggestie of user link.

6. **Custom/FNDDS in boodschappenlijst (optioneel)**
   - Meal plan / enrichment uitbreiden zodat ingredientRefs ook custom_food_id/fdc_id kunnen hebben waar van toepassing.
   - Shopping list aggregeren op (source, id) naast nevoCode; koppeltabel en UI ook voor custom/FNDDS ondersteunen.

---

## 6) Samenvatting

| Van                       | Naar               | Huidige status                               | Actie                               |
| ------------------------- | ------------------ | -------------------------------------------- | ----------------------------------- |
| Recept-ingrediënt (tekst) | NEVO/custom/FNDDS  | ✓ recipe_ingredient_matches + ingredientRefs | Optioneel: AI batch-suggestie       |
| NEVO/custom/FNDDS         | Macro’s/nutriënten | ✓ nutrition-calculator                       | –                                   |
| Meal plan ingredientRefs  | Boodschappenlijst  | ✓ buildShoppingList op nevoCode              | Uitbreiden: store-product per regel |
| Boodschappenlijst-regel   | Winkelproduct      | ✗                                            | Nieuwe koppeltabel + zoek + UI      |
| Suggestie winkelproduct   | Gebruiker          | ✗                                            | Zoek + (optioneel) AI “beste match” |

De kern is: **één koppeltabel** (ingrediënt-identiteit + store + store_product + optioneel user_id) en **zoeken in store_products op naam**; daarbovenop kunnen AI-suggesties (batch koppelen ingrediënten, “beste winkelproduct”) het gedrag versimpelen zonder de eindcontrole bij de gebruiker weg te halen.
