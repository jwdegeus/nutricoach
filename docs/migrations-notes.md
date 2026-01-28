# Migratie-notities

## Niet verwijderen of wijzigen

- **Geen migraties weglaten** die al op de remote database zijn toegepast. Dat breekt de Supabase migration history (`supabase migration list` gaat scheef, `db push` faalt).

## Revert-paar 28 + 29

- **20260131000028** (`ingredient_category_items_dutch_synonyms`): voegde Nederlandse synoniemen toe aan een paar `ingredient_category_items`.
- **20260131000029** (`revert_dutch_synonyms`): zet diezelfde wijzigingen weer terug.

Samen zijn ze een **netto no-op**: de DB staat nu weer zoals vóór 28. Beide bestanden **laten staan** – ze horen bij de migration history. Verwijderen of inhoud aanpassen zou checksum/history breken.

## Voorkomen van nieuwe rommel

- **Geen revert-migraties meer**: om iets “ongedaan” te maken, maak een **nieuwe** migratie die de gewenste eindstaat zet (zoals 29 deed), in plaats van oude migraties te editen.
- Bij twijfel: wijzigingen in een **nieuwe** migratie met volgnummer, niet in bestaande bestanden.
