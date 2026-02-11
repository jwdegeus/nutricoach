# Analyse: Geen recepten uit receptendatabase in weekmenu

**Datum:** 11 februari 2026  
**Probleem:** Weekmenu's tonen vrijwel geen recepten uit `custom_meals` (de receptendatabase). Gebruiker ziet "Geen ingrediënten beschikbaar" bij sommige maaltijden en herkent eigen recepten niet.

---

## 1. Architectuur (kort)

### Waar komen recepten vandaan?

| Bron                   | Tabel / config         | Gebruik in generator                                        |
| ---------------------- | ---------------------- | ----------------------------------------------------------- |
| **Jouw recepten**      | `custom_meals`         | Alleen via **prefill** → `loadPrefilledBySlot`              |
| **Eerdere maaltijden** | `meal_history`         | Ook via prefill (aanvulling na custom_meals)                |
| **Admin pools**        | `meal_plan_pool_items` | Template-generator: eiwit, groente, vet, smaak (NEVO-codes) |
| **NEVO database**      | `nevo_food`            | Template + Gemini: zoektermen per dieet → ingrediënten      |

**Belangrijk:** De generator maakt het plan eerst met **templates + pools** (of Gemini + NEVO-pool). Daarna worden een aantal slots **vervangen** door kandidaten uit prefill. `custom_meals` komt **alleen** binnen via dat vervangstapje.

### Generatiepaden

1. **History-hergebruik**  
   Als ≥50% van de slots uit `meal_history` kan → plan alleen uit history. Prefill wordt niet gebruikt.

2. **Template-generator** (`USE_TEMPLATE_MEAL_GENERATOR=true`)  
   Plan wordt volledig opgebouwd uit templates + `meal_plan_pool_items` + NEVO. Daarna: `applyPrefilledAndAttachProvenance` vervangt ~80% van de slots door prefill. Geen prefill → geen vervangingen → 0 recepten uit jouw database.

3. **Gemini** (template uit)  
   Zelfde logica: Gemini vult plan, prefill vervangt ~80% van de slots. Geen prefill → 0 eigen recepten.

4. **Database-eerst** (`MEAL_PLANNER_DB_FIRST=true`)  
   Per slot eerst uit prefill vullen, anders AI. Prefill leeg → alle slots door AI → 0 eigen recepten.

**Conclusie:** Alle paden zijn afhankelijk van prefill. Prefill leeg = 0 recepten uit jouw database.

---

## 2. Waarom is prefill leeg?

`loadPrefilledBySlot` haalt kandidaten uit `custom_meals` en `meal_history`. Recepten moeten aan **alle** onderstaande voorwaarden voldoen.

### 2.1 Slotfilter

```sql
-- custom_meals query
.eq('user_id', userId)
.or('meal_slot.in.(breakfast,lunch,dinner),weekmenu_slots.not.is.null')
```

- `meal_slot` moet `breakfast`, `lunch` of `dinner` zijn, **of**
- `weekmenu_slots` moet niet-null zijn (array met o.a. breakfast/lunch/dinner).

Recepten met `meal_slot = 'snack'` of `'other'` (zonder `weekmenu_slots`) vallen af.

### 2.2 Ingrediënten (kritiek)

Elk recept moet `ingredientRefs` hebben (min. 1).

Bronnen:

1. `meal_data.ingredientRefs` (JSONB op `custom_meals`)
2. `recipe_ingredients` (koppeling `recipe_id` → `nevo_food_id`)

Als beide leeg zijn:

- **Template/Gemini-pad:** er wordt een _stub_ (lege ingredientRefs) gepusht; die kan wel geplaatst worden, maar toont "Geen ingrediënten beschikbaar".
- **DB-first pad:** `availableWithRefs` filtert recepten zonder ingredientRefs eruit; slot krijgt `reason: 'missing_ingredient_refs'` en wordt door AI gevuld.

### 2.3 Blokkades

- `household_avoid_rules` (strictness = 'hard')
- Allergieën en dislikes uit het profiel

Recepten die daardoor geblokkeerd worden, komen niet in prefill.

### 2.4 Dietfilter

- `custom_meals`: geen filter op `diet_key` in de huidige query.
- `meal_history`: gefilterd op `diet_key` van het plan.

---

## 3. Waarschijnlijke oorzaken

| Oorzaak                                                                    | Kans   | Actie                                                                        |
| -------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| **meal_slot = snack/other** zonder weekmenu_slots                          | Hoog   | Recepten classificeren als ontbijt/lunch/diner, of `weekmenu_slots` invullen |
| **Geen ingredientRefs** (lege meal_data + geen NEVO in recipe_ingredients) | Hoog   | NEVO-koppeling toevoegen voor alle recepten die in het weekmenu moeten       |
| **Allergieën/household rules** blokkeren alles                             | Medium | Regels controleren; evt. diagnostiek toevoegen                               |
| **Prefill leeg door andere filters**                                       | Lager  | Logging van prefill-statistieken toevoegen                                   |

---

## 4. Plan van aanpak

### Fase 1: Diagnostiek (direct)

1. **Prefill-logging**
   - In `loadPrefilledBySlot`: log per slot hoeveel custom_meals en meal_history kandidaten zijn gevonden.
   - Log hoeveel er afvallen door:
     - geen ingredientRefs
     - household/allergie-blokkade
   - Alleen in dev of achter feature flag.

2. **Admin-checklist**
   - Simpele pagina of sectie: “Recepten klaar voor weekmenu”.
   - Toon: aantal recepten per slot (breakfast/lunch/dinner) met ingredientRefs.
   - Toon: aantal zonder ingredientRefs (met waarschuwing).

3. **Prefill-debuglogging**
   - In `.env.local`: `MEAL_PLANNER_PREFILL_DEBUG=true`
   - Genereer een nieuw weekmenu; in de serverlogs zie je o.a.:
     - `custom_meals_total`, `custom_with_ingredientRefs`
     - `recipeIds_needing_refs`, `refs_from_recipe_ingredients`
     - Per slot: `custom`, `inResult`
   - Hiermee zie je direct of prefill leeg is en waarom.

4. **DB-query (handmatig)**
   - Aantal `custom_meals` met `meal_slot IN ('breakfast','lunch','dinner')` of `weekmenu_slots IS NOT NULL`.
   - Aantal daarvan met ingredientRefs (uit meal_data of recipe_ingredients).

### Fase 2: Data-reparatie

5. **meal_slot en weekmenu_slots**
   - Recepten die in het weekmenu moeten (shakes, smoothies, etc.) zetten op:
     - `meal_slot IN ('breakfast','lunch','dinner')` of
     - `weekmenu_slots` = ['breakfast'] / ['lunch'] / ['dinner'] waar van toepassing.
   - Eventueel bulk-update script of UI voor “Gebruik in weekmenu”.

6. **ingredientRefs / recipe_ingredients**
   - Voor elk recept dat in het weekmenu moet: minimaal 1 ingrediënt met NEVO-koppeling.
   - Zorg dat `meal_data.ingredientRefs` of `recipe_ingredients` (met `nevo_food_id`) gevuld is.
   - UI: waarschuwing op receptpagina bij recepten zonder NEVO-ingrediënten.

### Fase 3: Generator aanpassen (optioneel)

7. **Database-eerst als default**
   - `MEAL_PLANNER_DB_FIRST=true` standaard als je wilt dat “eerst eigen recepten, rest AI”.
   - Alleen slots zonder geldige DB-kandidaat worden dan door AI gevuld.

8. **Prefill voor template**
   - Huidige volgorde: template vult alles → prefill vervangt ~80%.
   - Alternatief: eerst prefill proberen per slot, alleen lege slots door template.
   - Dat vraagt aanpassing van de template-flow.

### Fase 4: Lange termijn

9. **Recepten expliciet in prompt**
   - Nu krijgt de AI alleen een ingrediëntenpool (NEVO).
   - Toevoegen: lijst van recept-namen uit prefill die de AI mag kiezen.
   - Vereist prompt- en schema-aanpassing.

10. **weekmenu_slots UI**

- Bij classificatie: “Gebruik in weekmenu als: Ontbijt / Lunch / Diner” invullen.
- Backend: `weekmenu_slots` correct zetten op basis van die keuze.

---

## 5. Concrete code-locaties

| Onderdeel                             | Bestand                                   | Functie/regel                                                            |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Prefill laden                         | `src/lib/meal-plans/mealPlans.service.ts` | `loadPrefilledBySlot` (ca. regel 2116)                                   |
| Slotfilter custom_meals               | `mealPlans.service.ts`                    | `or('meal_slot.in.(breakfast,lunch,dinner),weekmenu_slots.not.is.null')` |
| ingredientRefs uit recipe_ingredients | `mealPlans.service.ts`                    | `recipeIdsNeedingRefs`, `ingredientRefsByRecipeId`                       |
| toMeal (ingredientRefs-check)         | `mealPlans.service.ts`                    | `toMeal` → return null als `ingredientRefs.length === 0`                 |
| Prefill toepassen                     | `mealPlannerAgent.service.ts`             | `applyPrefilledAndAttachProvenance`, `applyPrefilledMeals`               |
| DB-first per slot                     | `mealPlans.service.ts`                    | `generatePlanDbFirst` – filter `availableWithRefs` op `hasRefs`          |
| Env-vlaggen                           | `.env.local`                              | `USE_TEMPLATE_MEAL_GENERATOR`, `MEAL_PLANNER_DB_FIRST`                   |

---

## 6. Snelle checks (handmatig)

1. **Aantal recepten per slot**

   ```sql
   SELECT meal_slot, COUNT(*)
   FROM custom_meals
   WHERE user_id = '<jouw-user-id>'
   GROUP BY meal_slot;
   ```

2. **Recepten met ingredientRefs**
   - Recepten waarbij `meal_data->'ingredientRefs'` een niet-lege array is.
   - Of recepten met rijen in `recipe_ingredients` waar `nevo_food_id IS NOT NULL`.

3. **weekmenu_slots**
   ```sql
   SELECT COUNT(*) FROM custom_meals
   WHERE user_id = '<jouw-user-id>'
   AND (meal_slot IN ('breakfast','lunch','dinner') OR weekmenu_slots IS NOT NULL);
   ```

---

## 7. Samenvatting

Recepten uit `custom_meals` komen alleen in het weekmenu via **prefill**. Prefill faalt als:

- `meal_slot` is `snack` of `other` (en `weekmenu_slots` is null)
- Er geen ingredientRefs zijn (noch in meal_data, noch via recipe_ingredients + NEVO)
- Recepten geblokkeerd worden door household rules of allergieën

**Eerste stap:** Diagnostiek toevoegen + bovenstaande checks draaien. Daarna meal_slot/weekmenu_slots en ingredientRefs/NEVO-koppelingen repareren, en eventueel MEAL_PLANNER_DB_FIRST=true zetten.
