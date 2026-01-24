# Onboarding Flow - Technische Documentatie

## Overzicht

Dit document beschrijft de onboarding flow voor NutriCoach, waarbij nieuwe gebruikers hun voorkeuren en dieetprofiel instellen voordat ze toegang krijgen tot de meal planner functionaliteit.

## Doel & Scope (MVP)

### Doel
Nieuwe gebruikers begeleiden door een gestructureerd proces om hun persoonlijke voorkeuren in te stellen voor maaltijdplanning. Dit zorgt ervoor dat de meal planner relevante en gepersonaliseerde maaltijden kan genereren.

### Scope (MVP)
- 4-stap wizard voor het verzamelen van gebruikersvoorkeuren
- Validatie van input volgens business rules
- Opslag van voorkeuren in database
- Automatische redirect naar onboarding voor gebruikers die dit nog niet hebben voltooid
- Basis dieettype selectie (hardcoded lijst, later te vervangen door `diet_types` tabel)

### Uitgesloten (voor later)
- Multi-tenant support
- Geavanceerde dieettype configuratie
- Preview van meal plan tijdens onboarding
- A/B testing van onboarding flow

## Datamodel

### Tabel: `user_preferences`

Bevat gebruikersvoorkeuren voor mealplanning.

**Key Fields:**
- `user_id` (UUID, PK, FK naar `auth.users`)
- `max_prep_minutes` (INTEGER, NOT NULL, DEFAULT 30) - Maximale bereidingstijd in minuten
- `servings_default` (INTEGER, NOT NULL, DEFAULT 1) - Standaard aantal porties
- `kcal_target` (INTEGER, NULL) - Dagelijks caloriedoel (optioneel)
- `allergies` (TEXT[], NOT NULL, DEFAULT '{}') - Array van allergieën
- `dislikes` (TEXT[], NOT NULL, DEFAULT '{}') - Array van producten die niet lekker gevonden worden
- `variety_window_days` (INTEGER, NOT NULL, DEFAULT 7) - Aantal dagen voor variatie window
- `onboarding_completed` (BOOLEAN, NOT NULL, DEFAULT false) - Flag of onboarding is voltooid
- `onboarding_completed_at` (TIMESTAMPTZ, NULL) - Timestamp wanneer onboarding is voltooid
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

**Constraints:**
- Primary key op `user_id`
- Foreign key naar `auth.users(id)` met CASCADE DELETE
- Automatische `updated_at` trigger

### Tabel: `user_diet_profiles`

Bevat dieetprofielen met start/eind datums voor historisch overzicht.

**Key Fields:**
- `id` (UUID, PK, DEFAULT gen_random_uuid())
- `user_id` (UUID, NOT NULL, FK naar `auth.users`)
- `starts_on` (DATE, NOT NULL, DEFAULT CURRENT_DATE) - Startdatum van dit profiel
- `ends_on` (DATE, NULL) - Einddatum (NULL = actief profiel)
- `strictness` (INTEGER, NOT NULL, DEFAULT 5) - Striktheid niveau (1-10)
- `diet_type_id` (UUID, NULL) - Referentie naar toekomstige `diet_types` tabel
- `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT NOW())

**Constraints:**
- Primary key op `id`
- Foreign key naar `auth.users(id)` met CASCADE DELETE
- Check constraint: `strictness >= 1 AND strictness <= 10`
- Automatische `updated_at` trigger

**Logica:**
- Alleen één actief profiel per gebruiker (`ends_on IS NULL`)
- Bij nieuwe onboarding: update bestaand actief profiel of create nieuw
- Historische profielen blijven behouden voor analytics

## API / Server Actions Contract

### `loadOnboardingStatusAction()`

Laadt de huidige onboarding status voor de ingelogde gebruiker.

**Input:** Geen (gebruikt authenticated user context)

**Output:**
```typescript
ActionResult<OnboardingStatus>

// Success:
{
  data: {
    completed: boolean;
    completedAt: string | null;
    summary: {
      dietTypeId?: string;
      maxPrepMinutes?: number;
      servingsDefault?: number;
      kcalTarget?: number | null;
      strictness?: "strict" | "flexible";
      varietyLevel?: "low" | "std" | "high";
    };
  };
}

// Error:
{
  error: string;
}
```

**Gebruik:**
- Checken of onboarding voltooid is
- Tonen van huidige voorkeuren in UI
- Pre-fill van formulier bij herstart onboarding

### `saveOnboardingAction(input: OnboardingInput)`

Slaat onboarding data op voor de ingelogde gebruiker.

**Input:**
```typescript
{
  dietTypeId: string;              // Required: UUID van gekozen dieettype
  strictness?: "strict" | "flexible"; // Optional: Striktheid niveau
  allergies: string[];              // Required: Array van allergieën (max 50)
  dislikes: string[];               // Required: Array van dislikes (max 50)
  maxPrepMinutes: number;           // Required: 15, 30, 45, of 60
  servingsDefault: number;          // Required: 1-6
  kcalTarget?: number | null;       // Optional: 800-6000 of null
  varietyLevel?: "low" | "std" | "high"; // Optional: Variety niveau
}
```

**Output:**
```typescript
ActionResult<OnboardingStatus>  // Zelfde als loadOnboardingStatusAction
```

**Side Effects:**
- Upsert `user_preferences` op `user_id`
- Update of create actief `user_diet_profiles` record
- Zet `onboarding_completed = true` en `onboarding_completed_at = NOW()`
- Revalidate `/onboarding` path

**Error Handling:**
- Validatiefouten retourneren als `{ error: string }`
- Database errors worden getoond met duidelijke foutmeldingen
- Consistent error shape met andere server actions

## Validatieregels

### `maxPrepMinutes`
- **Type:** `number`
- **Waarden:** `15`, `30`, `45`, of `60`
- **Foutmelding:** "maxPrepMinutes moet een van de volgende waarden zijn: 15, 30, 45, 60"

### `servingsDefault`
- **Type:** `number`
- **Range:** `1` tot en met `6`
- **Foutmelding:** "servingsDefault moet tussen 1 en 6 liggen"

### `kcalTarget`
- **Type:** `number | null`
- **Range (indien niet null):** `800` tot en met `6000`
- **Foutmelding:** "kcalTarget moet tussen 800 en 6000 liggen (of null zijn)"

### `allergies`
- **Type:** `string[]`
- **Max items:** `50`
- **Foutmelding:** "allergies mag maximaal 50 items bevatten"

### `dislikes`
- **Type:** `string[]`
- **Max items:** `50`
- **Foutmelding:** "dislikes mag maximaal 50 items bevatten"

### `dietTypeId`
- **Type:** `string` (UUID)
- **Required:** Ja
- **Validatie:** Moet bestaan in dieettype lijst (momenteel hardcoded, later via `diet_types` tabel)

## RLS / Policies

### `user_preferences`

**Row Level Security:** Enabled

**Policies:**
1. **SELECT:** `auth.uid() = user_id`
   - Gebruikers kunnen alleen hun eigen voorkeuren zien

2. **INSERT:** `auth.uid() = user_id`
   - Gebruikers kunnen alleen voorkeuren voor zichzelf aanmaken

3. **UPDATE:** `auth.uid() = user_id` (USING + WITH CHECK)
   - Gebruikers kunnen alleen hun eigen voorkeuren updaten

**Geen DELETE policy:** Voorkeuren worden niet verwijderd, alleen geüpdatet.

### `user_diet_profiles`

**Row Level Security:** Enabled

**Policies:**
1. **SELECT:** `auth.uid() = user_id`
   - Gebruikers kunnen alleen hun eigen dieetprofielen zien

2. **INSERT:** `auth.uid() = user_id`
   - Gebruikers kunnen alleen dieetprofielen voor zichzelf aanmaken

3. **UPDATE:** `auth.uid() = user_id` (USING + WITH CHECK)
   - Gebruikers kunnen alleen hun eigen dieetprofielen updaten

4. **DELETE:** `auth.uid() = user_id`
   - Gebruikers kunnen hun eigen dieetprofielen verwijderen (voor edge cases)

## UX Flow

### Stap 1: Dieettype Selectie
- **Component:** `Step1DietType`
- **Input:** Dropdown met beschikbare dieettypes
- **Validatie:** Verplicht veld
- **Data:** Hardcoded lijst (tijdelijk, later via `diet_types` query)

### Stap 2: Allergieën & Voorkeuren
- **Component:** `Step2AllergiesDislikes`
- **Input:** Tag input voor allergieën en dislikes
- **Features:**
  - Enter toevoegen
  - X-knop om te verwijderen
  - Quick-add suggesties voor veelvoorkomende items
- **Validatie:** Optioneel (max 50 items per array)

### Stap 3: Praktische Voorkeuren
- **Component:** `Step3Practical`
- **Input:**
  - Dropdown voor maximale bereidingstijd (15/30/45/60 min)
  - Dropdown voor standaard aantal porties (1-6)
- **Validatie:** Beide verplicht

### Stap 4: Doelen & Voorkeuren
- **Component:** `Step4Goal`
- **Input:**
  - Optioneel: Caloriedoel (800-6000)
  - Radio buttons: Variety niveau (low/std/high)
  - Radio buttons: Striktheid (flexible/strict)
- **Validatie:** Alle velden optioneel

### Navigatie
- **Progress Indicator:** Toont huidige stap en percentage
- **Back Button:** Beschikbaar vanaf stap 2, disabled op stap 1
- **Next Button:** Disabled totdat verplichte velden zijn ingevuld
- **Save Button:** Op laatste stap, roept `saveOnboardingAction` aan
- **Loading States:** Toont "Opslaan..." tijdens server action

### Redirect Flow
- Na succesvol opslaan: Redirect naar `/dashboard`
- Bij fout: Toon error message, blijf op huidige stap

## Onboarding Gating

### Implementatie
Onboarding gating gebeurt op twee niveaus:

1. **Layout Level (`src/app/(app)/layout.tsx`):**
   - Checkt `onboarding_completed` flag voor alle (app) routes
   - Redirect naar `/onboarding` als niet voltooid
   - Alleen voor authenticated users

2. **Onboarding Page (`src/app/(app)/onboarding/page.tsx`):**
   - Safety check: als al voltooid, redirect naar `/dashboard`
   - Voorkomt redirect loops

### Routes
- **Gated routes:** Alle routes onder `(app)` behalve `/onboarding` zelf
- **Excluded routes:** Auth routes (`(auth)`), public routes
- **Redirect target:** `/onboarding` (niet `/login`)

### Performance
- Lightweight query: alleen `onboarding_completed` flag wordt opgehaald
- Geen zware joins of complexe queries in layout
- Caching via Next.js layout caching

## Mapping Functions

### Variety Level ↔ Days
```typescript
"low"  → 3 dagen
"std"  → 7 dagen (default)
"high" → 14 dagen
```

### Strictness ↔ Number
```typescript
"flexible" → 2 (1-5 range)
"strict"   → 9 (6-10 range)
default    → 5 (middle)
```

**Reverse mapping:**
- `1-5` → `"flexible"`
- `6-10` → `"strict"`

## Next Steps - Richting Meal Plan Generator

### Directe Integratie Punten

1. **User Preferences Query:**
   ```typescript
   // In meal plan generator
   const { data: prefs } = await supabase
     .from("user_preferences")
     .select("*")
     .eq("user_id", user.id)
     .single();
   ```

2. **Active Diet Profile:**
   ```typescript
   const { data: profile } = await supabase
     .from("user_diet_profiles")
     .select("*")
     .eq("user_id", user.id)
     .is("ends_on", null)
     .single();
   ```

3. **Filtering Logic:**
   - Gebruik `max_prep_minutes` om recepten te filteren
   - Gebruik `allergies` en `dislikes` om ingrediënten uit te sluiten
   - Gebruik `strictness` voor dieet compliance checks
   - Gebruik `variety_window_days` voor meal plan variatie

### Uitbreidingen (Post-MVP)

1. **Diet Types Tabel:**
   - Vervang hardcoded lijst met database tabel
   - Support voor custom dieettypes
   - Dieettype-specifieke regels en constraints

2. **Onboarding Analytics:**
   - Track completion rate
   - Analyseer welke stappen gebruikers overslaan
   - A/B test verschillende flows

3. **Onboarding Updates:**
   - Laat gebruikers voorkeuren aanpassen na onboarding
   - Versie historie van voorkeuren
   - Compare tool voor "voor/na" wijzigingen

4. **Meal Plan Preview:**
   - Toon preview van eerste week tijdens onboarding
   - Laat gebruikers direct aanpassingen maken
   - Real-time validatie tegen voorkeuren

## Best Practices

### Server Actions
- ✅ Alle business logic in server actions, niet in UI
- ✅ Consistent error handling pattern
- ✅ Type-safe met TypeScript
- ✅ Revalidate paths na mutaties

### Database
- ✅ Gebruik upsert voor idempotentie
- ✅ Transacties voor multi-table updates (indien nodig)
- ✅ RLS policies voor security
- ✅ Indexes op foreign keys en query patterns

### UI/UX
- ✅ Progress indicator voor duidelijkheid
- ✅ Validatie feedback per stap
- ✅ Loading states tijdens async operations
- ✅ Error messages zijn user-friendly
- ✅ Geen hardcoded strings zonder i18n markers

## Troubleshooting

### Redirect Loops
**Symptoom:** Gebruiker blijft redirecten tussen `/onboarding` en `/dashboard`

**Oplossing:**
- Check of `onboarding_completed` flag correct wordt gezet
- Verify dat onboarding page zelf niet redirect naar dashboard als niet voltooid
- Check middleware configuratie

### Missing Preferences
**Symptoom:** `user_preferences` record bestaat niet na onboarding

**Oplossing:**
- Check server action error logs
- Verify RLS policies staan correct
- Check of upsert correct wordt uitgevoerd

### Diet Profile Not Active
**Symptoom:** Geen actief dieetprofiel na onboarding

**Oplossing:**
- Check of `ends_on` NULL is voor nieuwe profielen
- Verify update logic voor bestaande profielen
- Check database constraints
