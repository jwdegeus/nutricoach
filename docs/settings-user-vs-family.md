# Instellingen: per gebruiker vs per gezin (familie) vs per familielid

Dit document definieert waar we welke instellingen vastleggen. De mealplan-generator en waarschuwingen bouwen hierop.

## Principe

- **Per gebruiker (account)**: zaken die bij het ingelogde account horen (taal, wachtwoord, weergavenaam).
- **Per gezin/familie**: één huishouden, één keuken — daarom **één dieet** voor het hele gezin. Anders is koken niet te doen.
- **Per familielid**: zaken die per persoon verschillen (allergieën, voorkeuren, gezondheidsgegevens).

---

## Per gebruiker (user-level)

| Instelling          | Tabel/kolom                             | Opmerking            |
| ------------------- | --------------------------------------- | -------------------- |
| Taal                | `user_preferences.language`             | Interface-taal       |
| Wachtwoord          | auth                                    | Via account          |
| Weergavenaam        | `auth.users.user_metadata.display_name` | Breadcrumb e.d.      |
| Onboarding voltooid | `user_preferences.onboarding_completed` | Eenmalig per account |

---

## Per gezin/familie (family-level / household)

Eén waarde voor het hele huishouden (alle familieleden van deze user). De weekmenu-generator gebruikt deze voor het plan.

| Instelling                               | Tabel/kolom                                                                      | Opmerking                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Dieettype**                            | `user_preferences.diet_type_id`                                                  | Gezinsdieet; bepaalt receptpool en dieetregels                          |
| Strictness (optioneel)                   | `user_preferences.diet_strictness` of via default member                         | Hoe strikt het dieet wordt toegepast                                    |
| Boodschappendag                          | `user_preferences.shopping_day`                                                  | 0=zo … 6=za                                                             |
| Lead time weekmenu                       | `user_preferences.meal_plan_lead_time_hours`                                     | 24/48/72 uur voor boodschap                                             |
| Favoriete maaltijden                     | `user_preferences.favorite_meal_ids`                                             | Gezinsfavorieten voor suggesties                                        |
| Max bereidingstijd (min)                 | `user_preferences.max_prep_minutes`                                              | Gezin: één pot, één max tijd                                            |
| Standaard porties (per maaltijd)         | `user_preferences.servings_default`                                              | 1–6; standaard in weekmenu.                                             |
| Huishoudgrootte + schaalbeleid           | `households.household_size`, `servings_policy`                                   | 1–12 personen; schaal recepten naar huishouden of behoud receptporties. |
| Variety window (dagen)                   | `user_preferences.variety_window_days`                                           | Herhaling vermijden                                                     |
| Meal slot-stijlen                        | `user_preferences.preferred_*_style`, `weekend_days`                             | Ontbijt/lunch/diner-stijl, weekenddagen                                 |
| Maaltijdvoorkeuren (ontbijt/lunch/diner) | `user_preferences.breakfast_preference`, `lunch_preference`, `dinner_preference` | Gezin: tags per maaltijdtype                                            |
| Household avoid rules                    | `household_avoid_rules` (per household_id)                                       | Gezinsbrede uitsluitingen                                               |

---

## Per familielid (family_member)

Per persoon in het gezin. De generator gebruikt **alle** allergieën/voorkeuren van alle leden voor waarschuwingen en uitsluitingen.

| Instelling             | Tabel                                   | Opmerking                                      |
| ---------------------- | --------------------------------------- | ---------------------------------------------- |
| **Allergieën**         | `family_member_preferences.allergies`   | Per persoon; generator waarschuwt of sluit uit |
| **Dislikes**           | `family_member_preferences.dislikes`    | Per persoon                                    |
| Kcal-doel (optioneel)  | `family_member_preferences.kcal_target` | Per persoon voor doelen                        |
| Gezondheidsprofiel     | `family_member_health_profiles`         | Geboortedatum, geslacht, lengte, gewicht       |
| Therapeutisch protocol | `family_member_therapeutic_profiles`    | Per persoon (bijv. Wahls)                      |

**Niet meer per lid (verplaatst naar gezin):**

- Dieettype → staat in Instellingen als **Gezinsdieet** (`user_preferences.diet_type_id`).
- Max prep, servings, variety → kunnen gezin-breed in `user_preferences` (of eerste lid als fallback voor generator).

---

## Gebruik door de mealplan-generator

1. **Dieet** (receptpool, dieetregels): uit **gezinsniveau** (`user_preferences.diet_type_id`).
2. **Uitsluitingen/waarschuwingen**: vereniging van **alle** allergieën en dislikes van **alle** familieleden — als één lid allergisch is, geen dat ingrediënt in het plan (of duidelijke waarschuwing).
3. **Overige regels** (max prep, porties, variety): uit gezin (`user_preferences`) of default familielid als fallback.

---

## UI-plaatsing

- **Instellingen** (`/settings`): Alleen account/gebruiker: wachtwoord, account-acties (admin aanvragen, account verwijderen), admin-links (als admin). Geen gezins- of weekmenu-instellingen meer.
- **Familie → Bewerken** (`/familie/edit`): Alle gezinsniveau-instellingen in één plek:
  - Gezinsdieet: dieettype, ontstekingsgevoelig, max bereidingstijd, standaard porties (1–6), variatie, striktheid, maaltijdvoorkeuren (tags).
  - Weekmenu planning: boodschappendag, lead time, favoriete maaltijden.
  - Huishouden: allergieën & avoid (hard rules), porties (household_size 1–12, schaal/gebruik receptporties), maaltijdvoorkeuren per slot (ontbijt/lunch/diner type, weekend diner).
- **Familie (overzicht)**: Lijst familieleden en knop «Gezinsdieet bewerken» naar `/familie/edit`.
- **Familie → [lid]**: Alleen per-persoon: allergieën, dislikes, caloriedoel, gezondheidsprofiel, therapeutisch protocol. Link naar «Gezinsdieet bewerken» voor gezinsinstellingen.
