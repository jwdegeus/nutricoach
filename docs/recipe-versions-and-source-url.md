# Receptversies, bewerken en bron-URL

## Doelen

1. **Versies**: Altijd een origineel bewaren en een aangepaste versie (geen overschrijven).
2. **Bewerken**: Optie om ingrediënten en bereidingsinstructies handmatig aan te passen.
3. **Bron-URL**: Veld voor de originele recept-URL; meenemen bij importeren en tonen op receptpagina.

---

## 1. Versie-aanpak (origineel vs aangepast)

### Huidige situatie

- Bij “Aangepaste versie toepassen” worden `meal_data` (ingrediënten) en `ai_analysis` (bereidingsinstructies) **overschreven**. Het origineel gaat verloren.

### Opties

#### Optie A: Twee snapshots in dezelfde rij (aanbevolen voor MVP)

- **custom_meals** (en evt. meal_history) uitbreiden met:
  - `meal_data_original` (JSONB, nullable): vaste kopie van het recept zoals bij import of bij eerste “origineel vastleggen”.
  - Huidige `meal_data` en `ai_analysis` blijven de **actieve** versie (origineel of aangepast).

**Logica:**

- Bij **import/finalize**:  
  `meal_data_original` = kopie van de toen opgebouwde `meal_data` (+ evt. instructions in een vaste structuur).  
  `meal_data` = dezelfde waarde (eerste versie is “origineel”).
- Bij **“Aangepaste versie toepassen”**:  
  Niet meer overschrijven. In plaats daarvan:
  - Als er nog geen `meal_data_original` is: huidige `meal_data` + instructions naar `meal_data_original` kopiëren.
  - Daarna: `meal_data` en `ai_analysis` vullen met de **aangepaste** ingrediënten en instructies.
- **UI**: “Bekijk origineel” toont `meal_data_original` / bijbehorende instructies; standaard toon je `meal_data` + `ai_analysis`.

**Voordelen:** Geen extra tabellen, eenvoudige queries, duidelijke scheiding origineel/actief.  
**Nadeel:** Geen volledige geschiedenis van meerdere aanpassingen (alleen “origineel” + “huidige versie”).

#### Optie B: Versietabel

- Nieuwe tabel bv. `recipe_versions`:
  - `id`, `recipe_id` (custom_meals.id of meal_history.id), `version_type` (‘original’ | ‘adapted’), `ingredients_snapshot` (JSONB), `instructions_snapshot` (JSONB), `created_at`, evt. `label`.
- Huidige weergave = laatste versie of een “actieve” versie-markering.

**Voordelen:** Volledige historie, meerdere aanpassingen, eventueel vergelijken.  
**Nadelen:** Meer complexiteit, migratie, UI voor versie-keuze.

**Aanbeveling:** Start met **Optie A**. Later kan Optie B erbij als je echte versiegeschiedenis wilt.

---

## 2. Bewerken van ingrediënten en bereiding

### Doel

- Gebruiker kan op de receptpagina ingrediënten en bereidingsinstructies **handmatig** aanpassen (niet alleen via AI Magician).

### Aanpak

- **Receptdetailpagina**: Knop “Bewerken” (bij ingrediënten en/of bij bereidingsinstructies).
- **Bewerkingsformulier** (zoals bij recipe import):
  - Ingrediënten: lijst met velden per regel (naam, hoeveelheid, eenheid, opmerking).
  - Bereiding: genummerde stappen met tekst.
- **Opslaan**: Server action die:
  - `meal_data.ingredients` (en evt. `ingredientRefs` leeg of in sync) bijwerkt,
  - `ai_analysis.instructions` bijwerkt,
  - Alleen de **actieve** versie wijzigt; `meal_data_original` blijft ongewijzigd (zoals bij Optie A).

Technisch kun je hetzelfde patroon gebruiken als in `RecipeEditForm` (import): bestaande velden uitlezen, lokale state, bij submit één update naar `custom_meals` / `meal_history`.

### Versie en bewerken

- Als je Optie A gebruikt: “Bewerken” wijzigt altijd de **actieve** versie.
- Optioneel: “Terugzetten naar origineel” = `meal_data` en `ai_analysis.instructions` kopiëren uit `meal_data_original` (en evt. opgeslagen originele instructions).

---

## 3. Bron-URL (originele recept-URL)

### Huidige situatie

- Bij **URL-import** staat de recept-URL in `recipe_imports.source_image_meta.url` (en er is een `domain`).
- Bij **finalize** gaat alleen het **domein** (bv. `ah.nl`) naar `custom_meals.source`. De **volledige URL** wordt niet op het recept opgeslagen.

### Gewenste situatie

- Elk recept (in ieder geval van import) heeft een **originele URL**.
- Die URL wordt bij importeren meegenomen en op de receptpagina getoond (bv. “Bron: [link]”).

### Implementatie

1. **Database**
   - **custom_meals**: kolom toevoegen, bv. `source_url TEXT NULL` (originele receptpagina-URL).
   - **meal_history**: optioneel dezelfde kolom als je ook daar geïmporteerde recepten wilt ondersteunen.

2. **Import (URL)**
   - Bij aanmaken van de import job (URL flow) heb je al `input.url`.
   - In **finalize** (RPC of server action die custom_meals insert/update doet):
     - Lees de URL uit de job: bv. uit `recipe_imports.source_image_meta->>'url'` (als je die daar opslaat).
     - Zet die waarde in `custom_meals.source_url` bij het INSERT (en bij eventuele UPDATE van dezelfde rij).

3. **Import (foto/screenshot)**
   - Geen URL beschikbaar → `source_url` blijft `NULL`. Later evt. uitbreiden als je “bron-URL toevoegen” in bewerkingsscherm toevoegt.

4. **Receptpagina**
   - Als `source_url` gevuld is: tonen als “Bron: [originele receptpagina]” (link, open in nieuw tabblad).
   - Plaatsing: logisch bij bron/source-informatie (naast of onder bestaand “source”/domein).

### Waar URL vandaan halen bij finalize

- In **recipe_imports** moet de **page URL** (niet alleen de image URL) beschikbaar zijn. Bij URL-import wordt `source_image_meta` gezet met o.a. `url: input.url` en `domain`. Zorg dat in de finalize RPC `source_image_meta->>'url'` wordt uitgelezen en in `custom_meals.source_url` wordt weggeschreven.
- Als die `url` nu alleen in een ander veld zit (bv. alleen in de frontend), dan in de import-flow expliciet in `source_image_meta.url` (of een dedicated veld op recipe_imports) opslaan en in finalize gebruiken.

---

## 4. Volgorde van uitwerking (voorstel)

| Stap | Onderdeel         | Actie                                                                                                                                                                                               |
| ---- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Bron-URL          | Kolom `source_url` toevoegen; bij URL-import in finalize vullen; op receptpagina tonen.                                                                                                             |
| 2    | Versies (Optie A) | Kolom `meal_data_original` (+ evt. `instructions_original` of in één JSONB); bij “toepassen” eerst origineel vastleggen, dan aangepaste versie in `meal_data`/`ai_analysis`; UI “Bekijk origineel”. |
| 3    | Bewerken          | Knop “Bewerken” + formulier ingrediënten/bereiding + server action om actieve versie bij te werken.                                                                                                 |
| 4    | (Optioneel)       | “Terugzetten naar origineel” en/of later versietabel voor meerdere aanpassingen.                                                                                                                    |

Als je wilt, kan de volgende stap zijn: alleen **stap 1 (source_url)** concreet uitwerken (migratie + finalize + receptpagina), zodat je direct de originele URL bij import hebt en kunt tonen.
