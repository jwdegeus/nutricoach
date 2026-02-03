# Recipe URL Import met AI – Architectuur en flow

Dit document beschrijft hoe de **URL-import** van recepten werkt: van invoer van een link tot een klaar-voor-review import job, inclusief JSON-LD, Gemini-extractie, vertaling en opslag.

---

## 1. Overzicht

De gebruiker voert een recept-URL in (bijv. een blog of receptensite). De applicatie:

1. **Haalt de HTML** op (met SSRF-beveiliging en limieten).
2. **Probeert eerst JSON-LD** (schema.org Recipe) te parsen – snel en betrouwbaar als de site het aanbiedt.
3. **Als JSON-LD faalt of ontbreekt:** stuurt de **HTML naar Gemini** met een vaste prompt en JSON-schema om titel, ingrediënten, instructies, tijden, enz. te extraheren.
4. **Valideert** het resultaat (o.a. placeholders, confidence).
5. **Maakt een import job** aan, **downloadt eventueel een receptfoto**, **vertaalt** naar de doeltaal en **returnt** de job naar de client.

De client (Recipe Import-pagina) toont het geïmporteerde recept en laat de gebruiker bewerken en finaliseren.

---

## 2. Entree: waar het begint

| Laag              | Bestand                                                        | Wat gebeurt er                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UI**            | `src/app/(app)/recipes/import/RecipeImportClient.tsx`          | Formulier “Importeer via URL”: `urlImportValue` → `handleUrlImportSubmit` → `importRecipeFromUrlAction({ url })`. Bij succes: job in sessionStorage, `router.push(/recipes/import?jobId=...)`. |
| **Server action** | `src/app/(app)/recipes/import/actions/recipeImport.actions.ts` | `importRecipeFromUrlAction(raw)` valideert user + URL, roept fetch + extractie + job-aanmaak + vertaling aan, returnt `{ ok, jobId, job }` of error.                                           |

Input wordt gevalideerd met `importRecipeFromUrlInputSchema` (o.a. `url` string).

---

## 3. HTML ophalen (fetch)

- **Functie:** `fetchHtml(url)` in `src/app/(app)/recipes/import/server/fetchAndParseRecipeJsonLd.ts`.
- **Beveiliging:** SSRF-mitigatie (geen private IP’s), DNS-resolutie voor hostname-check, hostname-cache (TTL 5 min).
- **Limieten:**
  - Timeout: `RECIPE_FETCH_TIMEOUT_MS` (env) of **35 s**.
  - Max response size: **3 MB**.
  - Max body read: **2.5 MB** (stream stopt daarna).
  - Max redirects: **5**.
- **Content-type:** Alleen `text/html` (en varianten) toegestaan; anders o.a. `UNSUPPORTED_CONTENT_TYPE`.

Dezelfde `fetchHtml` wordt gebruikt voor zowel het JSON-LD-pad als het Gemini-pad (HTML wordt één keer opgehaald en doorgegeven).

---

## 4. Twee extractiepaden

### 4.1 Pad A: JSON-LD eerst (zonder AI)

- **Functie:** `fetchAndParseRecipeJsonLd(url, html)` in `fetchAndParseRecipeJsonLd.ts`.
- **Doel:** Snelle, deterministische extractie als de pagina schema.org Recipe JSON-LD bevat (vaak bij WordPress/WPRM).
- **Flow:**
  - Zoekt in HTML naar `<script type="application/ld+json">` en parst Recipe/ItemList/HowTo.
  - Bouwt een `RecipeDraft` (titel, ingrediënten, stappen, tijden, beeld, etc.).
  - Bij succes: job aanmaken in DB, image downloaden indien aanwezig, vertalen, fresh job ophalen en returnen. **Geen Gemini aanroep.**

Als JSON-LD een volledig recept oplevert (ingrediënten + stappen), stopt de flow hier. Anders (geen recept, parsefout, of incomplete data) valt de code door naar **Pad B: Gemini**.

### 4.2 Pad B: Gemini (AI-extractie uit HTML)

- **Aanroep:** `processRecipeUrlWithGemini({ html, url })` uit `recipeImport.actions.ts`.
- **Service:** `src/app/(app)/recipes/import/services/geminiRecipeUrlImport.service.ts`.

Stappen in dit pad:

1. **HTML beperken tot recept-zone**  
   `extractRelevantHtmlContent(html)`:
   - Verwijdert scripts/styles/noscript.
   - Zoekt eerst naar een receptblok (bijv. `wprm-recipe-container`, `itemtype=".../Recipe"`), anders article/main/recipe/content divs.
   - Verwijderd nav/header/footer/aside.
   - Vervangt alle whitespace door één spatie.
   - **Max 120 KB**; bij overschrijding: begin + einde behouden, midden vervangen door `... [middle content removed for size] ...` (instructies zitten vaak aan het eind).

2. **Prompt bouwen**  
   `buildRecipeExtractionFromHtmlPrompt(html)` zet de schoongemaakte HTML in een vaste instructietekst met:
   - “Extract ONLY recipe card: ingredients and instruction steps”
   - Verplicht JSON-formaat (title, language_detected, servings, times, ingredients[], instructions[]).
   - Regels voor eenheden (cups → ml, tbsp → el, tsp → tl, oz/lb → g).
   - Expliciet: `original_line` alleen zichtbare ingrediënttekst, getrimd (geen tabs/HTML).

3. **Gemini aanroep**
   - `getGeminiClient().generateJson({ prompt, jsonSchema, temperature: 0.4, purpose: 'plan', maxOutputTokens: 8192 })`.
   - Response is één JSON-string (geen markdown).

4. **Parsen en robuust maken**
   - **Eerste poging:** `JSON.parse(rawResponse)` + `geminiExtractedRecipeSchema.parse(parsed)`.
   - **Bij parsefout:** `extractJsonFromResponse(rawResponse)` (markdown-codeblokken verwijderen, `{ ... }` uit string halen) en opnieuw parsen.
   - **Bij weer fout (bijv. “Unterminated string at position N”):** `repairTruncatedJson(jsonString, parseError)`:
     - Bepaal positie uit errormessage.
     - Knip JSON af op die positie; bij “Unterminated string” een `"` toevoegen.
     - Bracket-stack bijhouden (buiten strings) en ontbrekende `]`/`}` sluiten.
     - Opnieuw parsen (eventueel ook op de originele getrimde response).
   - **Schema-normering:** `ensureRepairedRecipeHasRequiredFields(parsed)` vult ontbrekende velden na truncatie:
     - Geen/lege `instructions` → placeholder: `[{ step: 1, text: "Instructions were truncated. Please add steps manually." }]`.
     - Geen/lege `ingredients` → één placeholder-ingrediënt.

5. **Validatie tegen Zod**  
   `geminiExtractedRecipeSchema` (zie `recipeImport.gemini.schemas.ts`): o.a. title, language_detected, times, ingredients (min 1), instructions (min 1).

6. **Mapping naar draft**  
   `mapGeminiRecipeToDraft(extracted, url)` maakt een `RecipeDraft` (titel, ingrediënten als `{ text }`, stappen als `{ text }`, sourceUrl, sourceLanguage). Image-URL wordt uit de HTML gehaald (`extractImageUrlFromHtml`) en relatief → absoluut gemaakt.

De action krijgt terug: `{ draft, extracted, rawResponse }`.

---

## 5. Validatie en afwijzing in de action (na Gemini)

In `recipeImport.actions.ts` (na `processRecipeUrlWithGemini`):

- **Placeholder/“geen”-data:** als er warnings zijn én (eerste ingrediënt name bevat “geen” of eerste instructie text bevat “geen”) → error, geen job.
- **Te weinig inhoud:** `!hasIngredients || !hasInstructions` → error.
- **Lage confidence:** `confidence < 30` → error.
- Anders: job aanmaken, image downloaden (non-fatal bij fout), instructies normaliseren met `mergeInstructionsIntoParagraphs`, job insert met status `ready_for_review`, daarna vertaling.

---

## 6. Na extractie: job, image, instructies, vertaling

- **Job:** Insert in `recipe_imports` met o.a. `extracted_recipe_json`, `original_recipe_json`, `source_image_meta` (url, domain, source: 'url_import', imageUrl, savedImageUrl/path), `gemini_raw_json`, `confidence_overall`.
- **Image:** `downloadAndSaveRecipeImage(draft.imageUrl, user.id)` (zie `recipeImageDownload.service.ts`); bij falen wordt alleen gelogd, recept wordt wel opgeslagen.
- **Instructies:** `mergeInstructionsIntoParagraphs(instructions)` (zie `recipeInstructionUtils.ts`) voegt korte stappen samen tot paragraaf-stappen (op basis van titelpatronen zoals “Prepare …:”, “Grill …:”).
- **Vertaling:** `translateRecipeImportAction({ jobId })` vertaalt titel, ingrediënten en instructies naar de doeltaal (bijv. NL); resultaat komt in `extracted_recipe_json`, origineel blijft in `original_recipe_json`. Vertalen is “non-fatal”: bij fout gaat de flow door met onvertaald recept.

Tot slot wordt een “fresh” job opgehaald (met vertaalde `extracted_recipe_json`) en samen met `jobId` en `job` teruggegeven aan de client.

---

## 7. Belangrijke bestanden

| Bestand                                     | Rol                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recipeImport.actions.ts`                   | `importRecipeFromUrlAction`: orkestratie fetch → JSON-LD of Gemini → validatie → job → vertaling → return.                                              |
| `server/fetchAndParseRecipeJsonLd.ts`       | `fetchHtml`, `fetchAndParseRecipeJsonLd`; SSRF, timeouts, JSON-LD parsing.                                                                              |
| `services/geminiRecipeUrlImport.service.ts` | HTML-cleanup, prompt, `processRecipeUrlWithGemini`, JSON-repair, `ensureRepairedRecipeHasRequiredFields`, `mapGeminiRecipeToDraft`, image-URL uit HTML. |
| `recipeImport.gemini.schemas.ts`            | Zod-schema’s voor Gemini-output (ingredients, instructions, times, confidence, etc.).                                                                   |
| `recipeInstructionUtils.ts`                 | `mergeInstructionsIntoParagraphs` voor stappen-normalisatie.                                                                                            |
| `recipeImport.translate.actions.ts`         | `translateRecipeImportAction`: vertaling titel/ingrediënten/instructies.                                                                                |
| `RecipeImportClient.tsx`                    | UI URL-invoer, aanroep action, navigatie naar `?jobId=...`, tonen van geïmporteerd recept.                                                              |

---

## 8. Constanten en configuratie

- **Fetch:** `RECIPE_FETCH_TIMEOUT_MS` (default 35s), max response 3 MB, max body read 2.5 MB, max 5 redirects.
- **HTML voor Gemini:** max 120 KB na cleanup; WPRM-container tot 150 KB; bij truncatie 60 KB einde + rest begin.
- **Gemini:** `maxOutputTokens: 8192` voor recipe-URL-import (zodat groot recept in één response past); default client-limiet blijft `GEMINI_MAX_OUTPUT_TOKENS` (vaak 2048) tenzij overschreven.
- **Placeholder-teksten** (na repair): instructies “Instructions were truncated. Please add steps manually.”; ingrediënten “Ingredient list truncated”.

---

## 9. Waar het mis kan lopen (kort)

- **Fetch:** Timeout, te grote pagina, redirect-loop, SSRF-blokkade, verkeerde content-type.
- **JSON-LD:** Geen of kapot JSON-LD → fallback naar Gemini; of incomplete Recipe (bijv. alleen titel) → ook Gemini.
- **Gemini:** Response afgekapt (output limit) → truncatie midden in JSON → “Unterminated string” of incomplete object → repair + placeholder instructions/ingredients; gebruiker ziet dan “Voeg handmatig stappen toe” of één placeholder-ingrediënt.
- **HTML-selectie:** Verkeerde of geen recept-container gekozen → Gemini krijgt weinig recept-HTML of verkeerde tekst → slechte/ontbrekende extractie.
- **Validatie:** Placeholder/“geen”-detectie of lage confidence → import geweigerd ondanks geslaagde parse.
- **Vertaling:** Fout is non-fatal; recept blijft in brontaal.
- **Client:** Job maar één keer laden per `jobId` (ref) om herhaalde GET’s te voorkomen; sessionStorage voor direct tonen na URL-import.

Dit document legt de volledige URL-import-flow met AI (en JSON-LD) vast voor onderhoud en debugging.
