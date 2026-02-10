# Pantry: custom locaties en product–ingredient koppeling

## 1. Zelf pantry-locaties aanmaken (settings)

**Wens:** Gebruiker wil in instellingen eigen opslaglocaties aanmaken (bijv. "Kelder", "Berging") en die in de bewerk-modal kunnen selecteren.

**Aanpak:**

- **Tabel `pantry_locations`:** `id`, `user_id`, `name`, `sort_order`. Optioneel: seed 4 standaardlocaties (Koelkast, Vriezer, Lade, Kast) met `user_id = NULL` zodat elke gebruiker ze standaard ziet.
- **`pantry_items`:** Vervang `storage_location` (enum) door `storage_location_id` (FK naar `pantry_locations`). Migratie: bestaande waarden mappen naar vaste rijen (bijv. globale defaults) of per user default-locaties aanmaken.
- **Settings-pagina:** Sectie "Voorraadlocaties" met lijst (naam, volgorde), toevoegen, bewerken, verwijderen. Alleen locaties zonder gekoppelde items mogen verwijderd worden (of cascade/zet items op null).
- **Bewerk-modal:** Dropdown vult zich uit `pantry_locations` waar `user_id = current_user OR user_id IS NULL`.

**Stappen:** migratie tabel + FK, backfill, settings UI (CRUD), PantryRow/PantryCard dropdown aanpassen om locaties op te halen en te tonen.

---

## 2. Producten koppelen aan ingrediënten + zelflerend

**Wens:** Pantry-producten koppelen aan ingrediënten (NEVO of eigen database), en het systeem leert van keuzes (bijv. "Verstegen bieslook" → NEVO bieslook).

**Mogelijke aanpak:**

### Koppeling

- **Optie A – per pantry-item:** Velden op `pantry_items`: `linked_nevo_code` (nullable). In bewerk-modal: zoekveld "Koppel aan ingrediënt", zoek in NEVO/eigen DB, selecteer één ingrediënt. Bij opslaan wordt de koppeling bewaard. Recepten/shopping kunnen dan `linked_nevo_code` gebruiken als het product in de voorraad zit.
- **Optie B – aparte koppeltabel:** `product_ingredient_matches` (barcode/source/display_name, nevo_code, user_id, confidence). Meerdere mogelijke koppelingen per product; "beste" match tonen of laten kiezen.

### Zelflerend

- **Impliciet:** Bij "koppel aan ingrediënt" opslaan: (product key, gekozen nevo_code). Bij volgende keer hetzelfde product (zelfde barcode/source) de laatst gekozen koppeling voorstellen of automatisch selecteren.
- **Expliciet:** Tabel `product_ingredient_suggestions`: (product_key, nevo_code, times_chosen of last_chosen_at). Bij tonen bewerk-modal: toon "Vaak gekozen: [ingrediënt]" of "Laatst gekozen: [ingrediënt]" en één klik om te bevestigen.
- **Gedeeld (optioneel):** Anonieme of geaggregeerde statistieken (product X → vaak nevo_code Y) om nieuwe gebruikers een voorstel te doen.

**Aanbevolen eerste stap:** Optie A (één `linked_nevo_code` per pantry item) + bij bewerken "Laatst gekozen ingrediënt voor dit product" onthouden en als voorstel tonen. Later uitbreiden naar meerdere suggesties of gedeeld leren.

---

## Reeds doorgevoerd (deze sessie)

- Hoeveelheid (g) uit bewerk-modal verwijderd; alleen **Aantal stuks** blijft bewerkbaar.
- Veld **Aantal stuks op voorraad** toegevoegd (DB: `available_pieces`, types, service, acties, formulier + weergave in tabel).
- Label **"Plakken"** verduidelijkt naar "Of plak een link naar een afbeelding (URL)" (placeholder).
- Custom locaties en product–ingredient nog niet geïmplementeerd; bovenstaand document beschrijft de aanpak.
