# Generator-inzicht: transparantie om te perfectioneren

**Doel:** Inzicht wanneer en waarom de generator besluit om zelf maaltijden te maken (AI), zodat je gericht aanpassingen kunt doen aan dieetregels, groenten, variëteit, etc. Nu: nul input → frustratie.

---

## Huidige situatie

### Wat er al bestaat (maar beperkt)

| Flow                                        | slotProvenance | dbCoverage | fallbackReasons | Per-slot redenen |
| ------------------------------------------- | -------------- | ---------- | --------------- | ---------------- |
| **DB-first** (`MEAL_PLANNER_DB_FIRST=true`) | ✅             | ✅         | ✅              | ✅               |
| **Agent** (standaard)                       | ✅             | ✅         | ❌              | ❌               |

De agent-flow vult wél `dbCoverage` en `slotProvenance` (db/ai), maar **niet** `fallbackReasons` of `reason` per slot. Die redenen bestaan alleen in de DB-first flow, waar we per slot proberen te vullen en expliciet bijhouden _waarom_ het mislukte.

**Bekende redenen (DB-first):**

- `no_candidates` – Geen passende recepten (pool leeg of te klein)
- `repeat_window_blocked` – Variatie-venster te streng (zelfde maaltijd te recent)
- `missing_ingredient_refs` – NEVO ontbreekt bij recepten
- `all_candidates_blocked_by_constraints` – Geblokkeerd door regels (dieet, allergenen, etc.)
- `ai_candidate_blocked_by_constraints` – AI-voorstel geblokkeerd na validatie

### Waarom je “nul input” ziet

1. **Agent is standaard** – Geen fallbackReasons, geen per-slot reasons.
2. **Panel is voorwaardelijk** – Alleen zichtbaar als `dbSlots < totalSlots`; bij 100% DB zie je niets.
3. **Redenen zijn technisch** – “Geblokkeerd door regels” zegt niet _welke_ regel (dieet? groente? variëteit?).
4. **Geen groenten/variëteit-diagnostiek** – We loggen niet of een slot AI werd vanwege te weinig groenten of te lage variëteit.

---

## Voorgestelde aanpak

### Fase 1: Nu (quick wins)

1. **Altijd een “Generator-inzicht”-panel** tonen als er AI-slots zijn (ook in agent-flow).
2. **Agent-flow:** Fallback-bericht: “X van Y maaltijden door AI. Zet DB-first-modus aan voor gedetailleerde redenen per slot.”
3. **Betere copy:** “Database”/“AI” vervangen door “Uit recepten” / “Nieuw gegenereerd” waar dat verwarring voorkomt.
4. **Acties duidelijker:** Korte uitleg bij elke reden + link naar Recepten, Instellingen, etc.

### Fase 2: Rijkere metadata

1. **Agent-flow uitbreiden:** Bij prefill-falures bijhouden waarom een kandidaat werd overgeslagen (valideer → bij falen: “blocked_by_constraints” per slot).
2. **Dieper in constraints:** Bij `all_candidates_blocked_by_constraints` bijhouden _welke_ constraints faalden (allergeen, dieet, groente-categorie, etc.).
3. **Groenten-diagnostiek:** Per slot/dag bijhouden of een groente-categorie vereist was en of die gehaald werd (voor latere “te weinig groenten”-insights).

### Fase 3: Dashboard & rapportage

1. **Runs-pagina:** Overzicht van generator-runs met dbCoverage, fallbackReasons, en eventueel constraint-failure counts.
2. **Maandelijkse samenvatting:** “Deze maand: 40% AI; top-reden: geen passende lunch-recepten.”
3. **Actie-aanbevelingen:** “Voeg 2–3 groente-heavy lunchrecepten toe” o.b.v. patterns.

---

## Implementatie volgorde

| #   | Actie                                                                | Impact           |
| --- | -------------------------------------------------------------------- | ---------------- |
| 1   | Generator-inzicht-panel altijd tonen bij AI-slots; ook in agent-flow | Zichtbaarheid    |
| 2   | Agent-flow: fallback-tekst “zet DB-first aan voor details”           | Duidelijkheid    |
| 3   | REASON_LABELS uitbreiden + “Wat kun je doen?”-tekst per reden        | Actiegericht     |
| 4   | Panel prominent maken (niet verstop in veel tekst)                   | UX               |
| 5   | DB-first: constraint-detail bij blocked_by_constraints (fase 2)      | Diepere insights |

---

## Config-optie voor power users

`.env.local`:

```
MEAL_PLANNER_DB_FIRST=true   # Gedetailleerde redenen per slot
```

**Admin:** Beheer → Generator v2 — schakel database-eerst in. **Alternatief:** `MEAL_PLANNER_DB_FIRST=true` in .env.local overschrijft de DB-config.
