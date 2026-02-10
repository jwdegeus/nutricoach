# Plan van aanpak: generator versimpelen en recepten uit je database gebruiken

**Probleem:** Raar recept (bijv. Appel Kaneel Rijstbloem Shake), geen recepten uit eigen database zichtbaar, generator te complex, “JSON-onzin” in de admin.

**Doel:** Generator sterk versimpelen en ervoor zorgen dat jouw recepten (vooral shakes/smoothies) als eerste worden gebruikt.

---

## 1. Analyse: waarom zie je geen recepten uit je database?

### 1.1 Hoe het nu werkt (kort)

Er zijn **drie paden** om een weekmenu te vullen (in volgorde):

1. **History-hergebruik** – Als ≥50% van de slots uit `meal_history` kan worden gevuld → plan komt alleen uit history (geen templates, geen prefill uit custom_meals in die stap).
2. **Template-generator** (als `USE_TEMPLATE_MEAL_GENERATOR=true`) – Plan wordt **eerst** volledig opgebouwd uit **templates** (bowl, sheet_pan, soep) + **pools** (eiwit, groente, vet, smaak). Daarna wordt een deel van de slots **vervangen** door kandidaten uit **prefill** (custom_meals + meal_history). Prefill heeft nu **voorrang** voor custom_meals (eerst jouw recepten, dan history).
3. **Gemini** (als template uitstaat) – Zelfde prefill-logica: ~80% van de slots wordt uit prefill ingevuld, rest door AI.

Dus: jouw database-recepten komen alleen in het plan via **prefill**. Die prefill wordt opgebouwd in `loadPrefilledBySlot` en toegepast in `applyPrefilledMeals`.

### 1.2 Waarom prefill leeg kan zijn of niet wordt toegepast

| Mogelijke oorzaak                          | Uitleg                                                                                                                                                                                                                                                   | Waar te controleren                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **meal_slot past niet**                    | Prefill haalt alleen recepten op waar `meal_slot` in `['breakfast','lunch','dinner']` zit. Recepten met **snack** of **other** worden **niet** meegenomen.                                                                                               | Recepten → classificatie: “Soort” moet Ontbijt/Lunch/Avondeten zijn (niet Snack/Overig).                 |
| **Geen ingredientRefs**                    | Elk prefill-recept moet `ingredientRefs` hebben (minimaal 1). Die komen uit `meal_data.ingredientRefs` of uit `recipe_ingredients` met `nevo_food_id`. Zonder NEVO-koppeling valt het recept af.                                                         | Receptenpagina: ingrediënten moeten gekoppeld zijn aan NEVO (of in meal_data als het uit een plan komt). |
| **History vult alles**                     | Als eerst history wordt geprobeerd en die vult genoeg slots (≥50%), dan wordt **geen** nieuw plan gegenereerd en wordt prefill **niet** gebruikt.                                                                                                        | Alleen van toepassing als je veel eerdere weekmenu’s hebt toegepast.                                     |
| **Template vult, prefill vervangt random** | Bij template-modus wordt het plan eerst volledig met templates gevuld. Daarna kiest `pickExistingRecipesForPlan` **willekeurig** een aantal slots om te vervangen door prefill. Als prefill weinig kandidaten heeft, worden maar weinig slots vervangen. | Meer recepten met juiste meal_slot + ingredientRefs → meer vervangingen.                                 |
| **Hard constraints**                       | Bij elke vervanging wordt gecontroleerd of het plan nog voldoet aan “hard constraints”. Als een kandidaat (allergieën, household avoid, etc.) niet mag, wordt die overgeslagen.                                                                          | Allergieën/dislikes en household avoid rules.                                                            |

**Conclusie:** De meest waarschijnlijke reden dat je “helemaal geen recepten uit mijn database” ziet, is dat veel van je shakes/smoothies **meal_slot = snack of other** hebben, of dat **ingredientRefs** ontbreken (geen NEVO in `recipe_ingredients` of lege `meal_data.ingredientRefs`).

---

## 2. Waarom “raar recept” (bijv. Appel Kaneel Rijstbloem Shake)?

Bij **template-modus** wordt elke maaltijd opgebouwd uit:

- **Templates** (bowl, sheet_pan, soep) met vaste **slots**: eiwit, veg1, veg2, vet, (optioneel) smaak.
- **Pools** uit de admin: per dieet staan daar bv. eiwit-, groente-, vet- en smaak-items (vaak NEVO-codes/namen zoals “Bloem rijste-”, “Appel m schil gem”).

De **naam** komt uit **naam-patronen** (Naming-tab), bijv. `{protein} met {veg1} & {veg2}`. De plaatshouders worden ingevuld met de **pool-namen** van de gekozen ingrediënten. Als in de pool “rijstbloem” als eiwit of groente staat en de template kiest dat voor een ontbijt-shake-achtig patroon, krijg je dus een “Appel Kaneel Rijstbloem Shake” – technisch consistent met de configuratie, maar voor jou voelt dat als een raar recept.

Dus: de “rare” recepten komen **niet** uit jouw receptendatabase, maar uit de **template + pool-combinatie**. Jouw eigen shakes/smoothies zouden juist uit **custom_meals** (prefill) moeten komen; als die niet voldoen aan meal_slot/ingredientRefs, blijven de template-maaltijden over.

---

## 3. Waarom de generator “te complex” aanvoelt

- **Admin-pagina** toont: Templates, Pools (per categorie), Naming (patronen met `{protein}`, `{veg1}`, …), Instellingen (caps, groente-scoring, enz.).
- **Export/Import JSON** en “Compare” gaan over diezelfde configuratie; dat voelt als “JSON-onzin” als je gewoon wilt: “gebruik mijn recepten”.
- De **logica** is: eerst templates + pools, dan pas prefill. Voor jouw wens (“veel shakes/smoothies uit mijn database”) zou het omgekeerd moeten voelen: **eerst jouw recepten, rest eventueel aanvullen**.

---

## 4. Plan van aanpak (versimpelen + database eerst)

### Fase 1: Zorgen dat jouw recepten mee kunnen doen (korte termijn)

1. **Controleren meal_slot**
   - In de code: prefill gebruikt alleen `breakfast`, `lunch`, `dinner`. Recepten met `snack` of `other` worden genegeerd.
   - **Actie:** Recepten die je in het weekmenu wilt zien (vooral shakes/smoothies) moeten **Ontbijt**, **Lunch** of **Avondeten** als “Soort” hebben. Eventueel: in de UI een korte uitleg bij classificatie: “Recepten met Soort = Snack/Overig komen niet in het weekmenu.”
   - **Optioneel (technisch):** Als we ook “snack” in het weekmenu willen toelaten, moet `request.slots` worden uitgebreid en de template/prefill-logica daarop worden aangepast (grotere wijziging).

2. **Controleren ingredientRefs**
   - Recepten zonder geldige `ingredientRefs` (uit `meal_data` of uit `recipe_ingredients` met `nevo_food_id`) vallen in prefill af.
   - **Actie:** Op de receptenpagina (of in een checklist) duidelijk maken dat ingrediënten een NEVO-koppeling moeten hebben om in het weekmenu te kunnen worden gebruikt. Eventueel een waarschuwing tonen: “Dit recept heeft geen NEVO-ingrediënten en komt niet in aanmerking voor het weekmenu.”

3. **Diagnostiek (optioneel)**
   - Loggen of tonen (bijv. alleen in dev of achter een vlag): per slot hoeveel prefill-kandidaten zijn gevonden (custom_meals vs meal_history). Dan zie je direct of prefill leeg is of vol.

### Fase 2: Generator “database-eerst” maken (middellange termijn)

4. **Volgorde omdraaien in beleving en prioriteit**
   - **Huidige beleving:** “Generator maakt iets met templates/pools, en vervangt een deel door prefill.”
   - **Gewenste beleving:** “Generator vult het plan zoveel mogelijk uit **mijn recepten**; alleen lege slots worden met iets anders (template of AI) gevuld.”
   - **Actie:** Logica aanpassen naar een **database-eerst** flow:
     - Eerst bepalen: voor elk (dag, slot) een **kandidaat uit custom_meals** (en eventueel meal_history) als die beschikbaar is.
     - Alleen voor slots **zonder** geschikte kandidaat: template (of AI) gebruiken om een maaltijd te genereren.
   - Dit vereist wijzigingen in o.a. `mealPlans.service.ts` en de agent/template-aanroep: in plaats van “volledig plan maken, dan een deel vervangen” wordt het “per slot: eerst prefill proberen, anders template/AI”.

5. **Template-modus optioneel of tweede keuze**
   - Als database-eerst goed werkt, is de template-generator vooral een **aanvulling** voor lege slots. De admin-configuratie (templates, pools, naming) blijft nodig voor die aanvulling, maar de **standaard** wordt: zo veel mogelijk uit jouw recepten.

### Fase 3: Admin en UX versimpelen (langere termijn)

6. **Admin-pagina begrijpelijker maken**
   - **Probleem:** Veel tabs (Templates, Pools, Naming, Instellingen) en JSON-export/import voelen als “ik snap er niks van”.
   - **Actie:**
     - Eén duidelijke **tekstblok** bovenaan: “Het weekmenu wordt zoveel mogelijk gevuld met **recepten uit je receptenbank**. Recepten moeten Soort Ontbijt/Lunch/Avondeten hebben en ingrediënten met NEVO-koppeling. Onderstaande instellingen gelden voor de **aanvulling** (wanneer er geen recept beschikbaar is).”
   - Export/Import JSON behouden voor beheerders, maar **niet** als primaire actie presenteren; eventueel onder “Geavanceerd” of “Voor ontwikkelaars”.

7. **Presets en voorinstellingen**
   - **Presets**-knop kan worden gebruikt om een paar **vooraf ingestelde** configuraties aan te bieden (bijv. “Standaard”, “Veel variatie”, “Minimalistisch”). Daarmee hoeft een gebruiker geen JSON te zien.

8. **Minder nadruk op “Max stappen”, pool-grammen, etc.**
   - Deze blijven nodig voor de template-engine, maar de **uitleg** kan korter: “Deze getallen sturen alleen de **automatisch gegenereerde** maaltijden (wanneer er geen recept uit je database past).”

---

## 5. Samenvatting acties (prioriteit)

| Prioriteit | Actie                                                                                                          | Doel                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **P1**     | Recepten controleren: meal_slot = breakfast/lunch/dinner voor shakes/smoothies die in het menu moeten.         | Prefill kan ze meenemen.                                                  |
| **P1**     | Recepten controleren: ingrediënten met NEVO (of meal_data.ingredientRefs) zodat ingredientRefs niet leeg zijn. | Prefill laat ze niet vallen.                                              |
| **P2**     | Generator **database-eerst**: eerst per slot prefill proberen, alleen lege slots met template/AI vullen.       | Jouw recepten staan centraal; “rare” template-recepten alleen waar nodig. |
| **P2**     | Korte uitleg in app (classificatie/receptenpagina) over meal_slot en NEVO voor weekmenu.                       | Minder verwarring waarom een recept niet in het plan zit.                 |
| **P3**     | Admin: duidelijke teksten dat “recepten uit je database eerst” en JSON/Compare onder “Geavanceerd”.            | Generator voelt eenvoudiger en minder “JSON-onzin”.                       |
| **P3**     | Presets en vereenvoudigde instellingen voor niet-technische gebruikers.                                        | Minder moeten “snappen” van templates/pools.                              |

---

## 6. Technische aanknopingspunten in de code

- **Prefill laden:** `mealPlans.service.ts` → `loadPrefilledBySlot`. Hier worden custom_meals en meal_history opgehaald; filter op `request.slots` (breakfast, lunch, dinner).
- **Prefill toepassen:** `mealPlannerAgent.service.ts` → `applyPrefilledMeals`, `applyPrefilledAndAttachProvenance`. Template-pad roept dit na `generateTemplatePlan` aan.
- **Database-eerst:** Nieuwe flow zou kunnen: voor elke (dag, slot) eerst een kandidaat uit prefill kiezen; alleen als geen geldige kandidaat, die slot door template (of AI) laten vullen. Dat vraagt een andere structuur dan “volledig plan maken → deel vervangen”.
- **Admin UI:** `src/app/(app)/admin/generator-config/` (templates, pools, naming, instellingen). Export/Import in `generatorConfig.actions.ts`.

Als je wilt, kan de volgende stap zijn: **concrete codevoorstellen** voor P1 (uitleg/checks meal_slot + NEVO) en/of P2 (database-eerst flow-schets).
