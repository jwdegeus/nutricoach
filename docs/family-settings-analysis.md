# Analyse: Familie-instellingen en aansluiting meal-plan

Na de refactor naar **Familie → Bewerken** (`/familie/edit`) als single source voor gezinsniveau-instellingen.

---

## 1. Overzicht familie-instellingen (data-bronnen)

| Sectie op Familie edit          | Data-bron                                                                                                                                                        | Opmerking                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Gezinsdieet**                 | `user_preferences` (diet_type_id, diet_strictness, diet_is_inflamed, max_prep_minutes, servings_default, variety_window_days, breakfast/lunch/dinner_preference) | Via `family-diet.actions.ts` (get/update).                                   |
| **Weekmenu planning**           | `user_preferences` (shopping_day, meal_plan_lead_time_hours, favorite_meal_ids)                                                                                  | Via `meal-plan-schedule-preferences.actions.ts`.                             |
| **Huishouden avoid**            | `household_avoid_rules` (per household_id)                                                                                                                       | Via `household-avoid-rules.actions.ts`. household_id uit `user_preferences`. |
| **Porties**                     | `households` (household_size 1–12, servings_policy)                                                                                                              | Via `household-servings.actions.ts`.                                         |
| **Maaltijdvoorkeuren per slot** | `user_preferences` (preferred\_\*\_style, weekend_days, preferred_weekend_dinner_style)                                                                          | Via `meal-slot-style-preferences.actions.ts`.                                |

Geen dubbel opgeslagen: elk veld heeft één bron. UI staat alleen op `/familie/edit`.

---

## 2. Logica: wat is dubbel, wat ontbreekt?

### Geen inhoudelijke duplicatie

- **Standaard porties (1–6)** in Gezinsdieet = `servings_default`: standaard aantal porties per maaltijd in het weekmenu.
- **Porties (1–12 + schaalbeleid)** = `household_size` + `servings_policy`: huishoudgrootte en of recepten geschaald worden of receptporties behouden.  
  Verschillende concepten; beide nodig.

### Revalidatie na opslaan

- **Schedule prefs**: `revalidatePath('/settings')`, `'/familie/edit'`, `'/familie'` — goed.
- **Family diet**: `revalidatePath('/familie')`, `'/meal-plans'` — geen `'/familie/edit'`; na Gezinsdieet opslaan wordt Familie edit niet gerevalideerd. Optioneel toevoegen voor consistentie.
- **Household avoid, household servings, meal-slot-style**: **geen** `revalidatePath`. Na opslaan op Familie edit kan de pagina stale zijn tot handmatige refresh. Aanbevolen: in deze drie actions `revalidatePath('/familie/edit')` en `revalidatePath('/familie')` toevoegen.

### Ontbrekende zaken

- Geen ontbrekende familie-instellingen in de doc of in de flow. Documentatie in `settings-user-vs-family.md` sluit aan.

---

## 3. Meal-plan: moet er iets aangepast?

### Dataflow (ongewijzigd correct)

De meal-plan flow leest **geen** routes; alleen data:

1. **Profile** (dieet, prefs, allergies/dislikes): `ProfileService.loadDietProfileForUser()` → `user_preferences` (+ evt. default familielid). Zelfde data als Gezinsdieet-formulier.
2. **Slot styles + weekend**: direct `user_preferences` (meal-slot-style, weekend_days) in `mealPlans.service.ts` (createPlanForUser).
3. **Household scaling**: `user_preferences.household_id` → `households.household_size`, `servings_policy` — gebruikt bij persisten (scale plan).
4. **Household avoid (prefill)**: `household_id` → `household_avoid_rules` (strictness='hard') in `loadPrefilledBySlot`; zelfde in planReview (apply-draft guardrails).

Conclusie: **meal-plan hoeft niet aangepast te worden** voor de refactor. Bronnen zijn en blijven `user_preferences` en `households` / `household_avoid_rules`; alleen de UI-plek waar de gebruiker dit bewerkt is verplaatst naar Familie edit.

### Verwijzingen in de UI (afgerond)

- **MealPlanDraftBannerClient**: bij guardrails violation (household rules) linkt nu naar **`/familie/edit#household-avoid`** met label "Gezinsinstellingen (avoid-regels)". ✓
- **ProfileService** (profile.service.ts): foutmeldingen verwezen naar "Instellingen (Gezinsdieet)" → aangepast naar **"Gezinsdieet in Familie → Bewerken"**. ✓
- **`/settings/diets/:id/edit`**: ongewijzigd — dat is de **admin-edit van een dieettype** (regels, guardrails), niet het kiezen van het gezinsdieet.

---

## 4. Aanbevelingen — afgerond

Alle aanbevelingen zijn doorgevoerd:

- **MealPlanDraftBannerClient**: link naar `/familie/edit#household-avoid`, label "Gezinsinstellingen (avoid-regels)".
- **ProfileService**: foutmeldingen verwijzen naar "Familie → Bewerken".
- **Revalidatie**: `revalidatePath('/familie/edit')` en `revalidatePath('/familie')` staan in meal-plan-schedule-preferences, household-avoid-rules, household-servings, meal-slot-style-preferences en family-diet.actions.

Geen wijzigingen nodig in `mealPlans.service.ts`, `mealPlanGeneratorConfigLoader.ts` of de meal-planner agent voor deze refactor.

---

## 5. Code-analyse: meal plan ↔ familie- vs gebruikersvoorkeuren

### Gezinsniveau (family-level) — correct aangesloten

| Bron                                                | Waar geladen                                                                                                                                                                             | Gebruik in meal plan                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Dieet + gezinsvoorkeuren**                        | `ProfileService.loadDietProfileForUser()` → `user_preferences` (diet_type_id, max_prep_minutes, servings_default, variety_window_days, breakfast/lunch/dinner_preference) + `diet_types` | `profile` in request; dieetregels; receptpool.                                                                      |
| **Allergieën/dislikes (vereniging van alle leden)** | Zelfde service: `mergeAllFamilyMemberAllergiesAndDislikes()` over alle `family_members` van deze user                                                                                    | `profile.allergies` / `profile.dislikes` in request; prefill-filter (`loadPrefilledBySlot`); agent waarschuwingen.  |
| **Meal-slot-stijlen + weekend**                     | `mealPlans.service.ts` createPlanForUser: directe query `user_preferences` (preferred\_\*\_style, weekend_days)                                                                          | `slotPreferences` in request; prompt-richtlijnen (shake, salade, etc.).                                             |
| **Favorieten + household_id**                       | `loadPrefilledBySlot`: `user_preferences` (favorite_meal_ids, household_id)                                                                                                              | Sortering prefill op favorieten; bepalen household voor avoid-rules.                                                |
| **Household avoid (hard)**                          | Zelfde: `household_id` → `household_avoid_rules` WHERE strictness='hard'                                                                                                                 | Prefill: maaltijden die tegen regels ingaan worden uitgesloten; apply-draft (planReview) blokkeert bij overtreding. |
| **Huishoudgrootte + schaalbeleid**                  | Na generatie: `user_preferences.household_id` → `households` (household_size, servings_policy)                                                                                           | `scaleMealPlanToHousehold()` vóór persisten wanneer policy = scale_to_household.                                    |

Alle gezinsinstellingen die op **Familie → Bewerken** staan, komen uit `user_preferences` of uit `households` / `household_avoid_rules` via `user_preferences.household_id`. De meal plan leest alleen deze tabellen; er is geen harde koppeling meer naar de oude Settings-pagina.

### Gebruiker / default familielid — correct aangesloten

| Bron                                                         | Waar geladen                                                                                                                                                                             | Gebruik in meal plan                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Taal**                                                     | `ProfileService.getUserLanguage()` → `user_preferences.language`                                                                                                                         | Prompt-taal (nl/en).                                                                                               |
| **Therapeutisch protocol + overrides**                       | `buildTherapeuticTargetsSnapshot()` → `getActiveTherapeuticProfileForUser()` → **default family member** (is_self of eerste lid) → `family_member_therapeutic_profiles` + health profile | `request.therapeuticTargets`; doelen (bijv. groente-grammen, supplementen); template-fallback gebruikt veg-doelen. |
| **Gezondheidsprofiel (leeftijd, geslacht, lengte, gewicht)** | Zelfde flow: `getHealthProfileForUser()` → default family member → `family_member_health_profiles`                                                                                       | ADH-berekening voor therapeutische targets.                                                                        |
| **Kcal-doel (één waarde per plan)**                          | In profile: `user_preferences.kcal_target` of default familielid `family_member_preferences.kcal_target`                                                                                 | `profile.calorieTarget`; optioneel override via createPlan-input.                                                  |

Het plan is één plan per huishouden; therapeutische doelen en gezondheidsprofiel zijn gekoppeld aan het **default familielid** (degene die “standaard voor weekmenu” is), wat overeenkomt met “voor wie kook ik vooral”.

### Fallback-volgorde profile

1. Heeft user `user_preferences.diet_type_id`? → Gezinsdieet uit user_preferences + merged allergies/dislikes van alle leden.
2. Anders: default familielid met `family_member_diet_profiles` + `family_member_preferences` + merged allergies/dislikes.
3. Anders: `user_diet_profiles` (legacy) + user_preferences.

Conclusie: **Ja, het gaat goed.** De meal plan gebruikt gezinsniveau-instellingen (user_preferences, households, household_avoid_rules) en gebruikers-/ledenvoorkeuren (taal, default-lid voor therapeutisch en kcal) zoals bedoeld. Geen aanpassingen nodig voor deze scheiding.

---

## 6. Tips om dit solide af te ronden

1. **Documentatie bij de code**  
   In `ProfileService` en `mealPlans.service.ts` (bij de eerste query naar user*preferences/household) een korte comment dat gezinsvoorkeuren op Familie edit worden beheerd en hier alleen worden \_gelezen*. Verwijzing naar `docs/settings-user-vs-family.md` of dit document.

2. **Eén plek voor “waar komt profile vandaan”**  
   Overweeg een kleine sectie in `docs/settings-user-vs-family.md` of hier: “Meal plan profile: user_preferences (gezin) + merged family_member allergies/dislikes + default member voor therapeutic/kcal.” Dan blijft de bedoeling voor toekomstige wijzigingen helder.

3. **Tests (optioneel maar sterk)**
   - Integratietest of smoke test: “bij user met user_preferences.diet_type_id en household_avoid_rules wordt createPlanForUser geen error en bevat request.profile.allergies de merged set.”
   - Unittests voor `mergeAllFamilyMemberAllergiesAndDislikes` (twee leden, verschillende allergies → union in profile).

4. **Kcal-documentatie**  
   In de doc expliciet maken: “Het weekmenu heeft één kcal-doel per plan; dat komt van user_preferences.kcal_target (gezin-default) of van het default familielid. Per-persoon kcal staat in family_member_preferences maar wordt voor het plan geaggregeerd tot één target.” Dan is duidelijk dat meerdere kcal-doelen per lid later een bewuste uitbreiding zouden zijn.

5. **Geen extra bronnen voor gezinsinstellingen**  
   Zorg dat geen nieuwe feature “gezinsdieet” of “weekmenu-instellingen” elders (bijv. een nieuwe tabel of API) introduceert zonder dat die wordt gevoed vanuit dezelfde bron (user_preferences/households/household_avoid_rules). Familie edit blijft de single source of truth voor de UI.
