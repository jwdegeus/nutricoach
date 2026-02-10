# Light & dark theming — hoe het werkt en hoe je het aanpast

## Huidige opzet

### 1. Waar het thema vandaan komt

- **next-themes** zet op `<html>` de class `dark` (of niet). Keuze: system / light / dark, opgeslagen in `localStorage` (`nutricoach-theme`).
- **globals.css**:
  - `@theme { ... }` — alle paletten (primary, secondary, accent, background-50…950, gray-50…950, zinc-50…950) en **semantische tokens** voor **light** (background, foreground, muted, …).
  - `.dark { ... }` — overschrijft alleen de **semantische tokens** (background, foreground, muted, accent, popover, card) naar de gray-schaal.

### 2. Waar kleuren vandaan komen in de app

| Bron                                              | Gebruik                                                                                                              | Volgt nieuw dark-thema?                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Semantische tokens**                            | `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, etc. (o.a. dashboard, veel pagina’s)        | ✅ Ja — .dark in globals.css                                                                 |
| **Layout root**                                   | `html` met `bg-background text-foreground`                                                                           | ✅ Ja                                                                                        |
| **Catalyst** (sidebar, table, button, listbox, …) | Hardcoded `zinc-*`, `white`, `dark:bg-zinc-900`, `dark:text-white`, etc.                                             | ❌ Nee — die lezen **@theme** (zinc-900, zinc-800, …). Die waarden veranderen niet in .dark. |
| **App-componenten**                               | Mix: veel `text-foreground`/`text-muted-foreground`, maar ook `dark:text-white`, `dark:bg-zinc-*`, `bg-gray-*`, etc. | Gedeeltelijk — alleen waar semantic tokens worden gebruikt.                                  |

Gevolg: de **pagina-achtergrond** en alles wat **alleen** semantic tokens gebruikt (bijv. dashboard bento) volgt het dark-thema. De **sidebar, modals, tabellen, knoppen** gebruiken de vaste **zinc**-kleuren uit @theme en zien er in dark mode dus hetzelfde uit, ongeacht wat je in `.dark` zet.

---

## Wat je moet doen om dark (en light) door de hele app te sturen

### Optie A — Alles op semantic tokens (ideaal, meer werk)

- **Doel:** Eén set tokens (background, foreground, muted, card, …) voor light en dark. Eén plek aanpassen (globals.css) en de hele app volgt.
- **Hoe:**
  1. In **globals.css** blijft light in `@theme` en dark in `.dark` zoals nu (eventueel met een mooier dark-palette).
  2. **Catalyst-componenten** aanpassen: overal waar nu `zinc-*` / `white` / `dark:bg-zinc-*` staat, vervangen door semantic tokens (bijv. `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`). Geen borders gebruiken; scheiding via bg/shadow (zie no-borders rule).
  3. **App-code** doorzoeken op `dark:`, `zinc-`, `gray-`, `bg-white`, `text-white` en waar het over “pagina-achtige” kleuren gaat vervangen door dezelfde semantic tokens.
- **Resultaat:** Eén kleurenschema (light + dark) in globals.css; wijzigingen daar = direct overal zichtbaar.

### Optie B — Dark ook via zinc overschrijven (snel, één plek)

- **Doel:** Zonder alle Catalyst/componenten om te bouwen toch een **ander** dark-thema (bijv. zachter, warmer of blauwgrijs).
- **Hoe:** In **.dark** naast de semantic tokens ook de **zinc-** variabelen overschrijven die Catalyst en de rest gebruiken:
  - Bijv. `--color-zinc-900`, `--color-zinc-800`, `--color-zinc-950` (en evt. 700, 600) in .dark zetten naar de gewenste oklch-waarden.
  - Semantic tokens (background, muted, …) in .dark op dezelfde nieuwe dark-palette zetten (of op die zinc-\* variabelen).
- **Resultaat:** Alle plekken die `bg-zinc-900`, `dark:bg-zinc-800`, etc. gebruiken (inclusief Catalyst) krijgen in één keer het nieuwe dark-thema. Geen refactor nodig.

---

## Aanbeveling

- **Korte termijn:** **Optie B** — in globals.css in `.dark` een mooier dark-palette definiëren (bijv. zachter grijs of licht blauwgrijs) en daar zowel de semantic tokens als `--color-zinc-950`, `--color-zinc-900`, `--color-zinc-800`, etc. op zetten. Dan ziet de hele app (inclusief sidebar, tabellen, knoppen) hetzelfde, mooiere dark-thema.
- **Lange termijn:** Naar **Optie A** migreren: overal semantic tokens gebruiken en geen hardcoded zinc/gray in componenten. Dan kun je later ook meerdere themes (bijv. “warm dark”, “cool dark”) makkelijk toevoegen.

---

## Waar aan te passen

| Bestand / plek           | Wat aanpassen                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **src/app/globals.css**  | Light: `@theme` (semantic tokens + paletten). Dark: `.dark` — semantic tokens + (bij Optie B) zinc-950, zinc-900, zinc-800, zinc-700, … |
| **src/app/layout.tsx**   | Alleen `bg-background text-foreground` op `<html>` (geen hardcoded zinc/gray).                                                          |
| **components/catalyst/** | Bij Optie A: zinc/white/dark: vervangen door background/foreground/muted/card.                                                          |
| **Rest van de app**      | Bij Optie A: zoeken op `dark:`, `zinc-`, `gray-`, `bg-white`, `text-white` en waar het “theme” is → semantic tokens.                    |

---

## Geïmplementeerd (Optie B)

In **globals.css** is in `.dark` nu het volgende gedaan:

- De **semantische tokens** (background, foreground, muted, …) gebruiken de **gray**-schaal.
- De **zinc**-variabelen worden in dark mode **gelijk getrokken met gray** (`--color-zinc-900: var(--color-gray-900);` etc.).

Daardoor gebruiken de pagina-achtergrond, sidebar, modals, tabellen en knoppen in dark mode allemaal dezelfde gray-palette (Tailwind-stijl, iets zachter dan de oude zinc). Eén consistent dark-thema zonder refactor van Catalyst of app-code.

Als je later een **ander** dark-thema wilt (bijv. warmer of blauwgrijs), vervang je in `.dark` de gray-\*-referenties door een nieuw palet of voeg je een extra set variabelen (bijv. `--color-dark-900`) toe en zet je zowel semantic als zinc daarop.
