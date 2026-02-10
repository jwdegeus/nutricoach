# Grocery Stores-module – analyse en bouwplan

## Doel

Een nieuwe module **Supermarkten / Favoriete winkels** waarmee gebruikers:

1. **Nu:** hun favoriete winkels aanmaken (naam, optioneel adres/notities).
2. **Later:** ingrediënten koppelen aan winkels (bijv. "melk koop ik bij Albert Heijn", "noten bij Jumbo").

Dit sluit aan bij de bestaande **Pantry**- en **Boodschappenlijst**-flow: straks kan de boodschappenlijst per winkel gefilterd worden of ingrediënten tonen waar je ze koopt.

---

## Codebase-patterns (samenvatting)

### 1. User-owned entiteiten

| Entiteit       | Tabel            | Eigenaar        | Patroon                       |
| -------------- | ---------------- | --------------- | ----------------------------- |
| Pantry items   | `pantry_items`   | `user_id`       | Direct `auth.uid() = user_id` |
| Family members | `family_members` | `user_id`       | Direct `auth.uid() = user_id` |
| Households     | `households`     | `owner_user_id` | Owner-only RLS                |

**Aanbeveling voor grocery stores:**  
Eigenaar = **user** (niet household). Eén gebruiker beheert zijn eigen favoriete winkels. Eventueel later uitbreiden naar “gedeeld binnen huishouden” als producteis wordt.

### 2. App-structuur (route + actions + client)

- **Route:** `src/app/(app)/<module>/page.tsx` (server component: auth, metadata, data load).
- **Actions:** `src/app/(app)/<module>/actions/*.ts` – `'use server'`, `createClient()`, `getUser()`, `AppError` of `ActionResult<T>`.
- **Client UI:** `src/app/(app)/<module>/components/*Client.tsx` – lijst, dialogen (Catalyst), `useToast()` voor feedback.
- **Schemas/types:** ofwel in `src/lib/<module>/` (zoals `pantry.schemas.ts`, `pantry.types.ts`) ofwel lokaal in de module.

### 3. Database-conventies

- Tabellen: `snake_case`, PK `id UUID DEFAULT gen_random_uuid()`.
- Timestamps: `created_at`, `updated_at` + trigger `handle_updated_at()`.
- RLS op alle tabellen; policies: `auth.uid() = user_id` (of via FK naar user-owned tabel).
- Index op foreign keys en veelgebruikte filters.

### 4. UI-conventies (AGENTS.md)

- **Catalyst** voor alle UI (Button, Dialog, Input, Fieldset, etc.).
- **Heroicons** (`@heroicons/react/16/solid`).
- Feedback via **toasts** (`useToast()` uit `ToastContext`), geen alleen-revalidate.
- Geen zware borders; shadow + `bg-muted/20` voor cards.

### 5. Vertalingen

- `messages/nl.json` en `messages/en.json`: namespace per module (bijv. `groceryStores` of `stores`).
- Nav: `nav.groceryStores` (NL: "Supermarkten", EN: "Grocery stores").

---

## Data-model (fase 1: alleen winkels)

### Tabel: `user_grocery_stores` (of `grocery_stores`)

| Kolom        | Type        | Constraints                                 | Opmerking                    |
| ------------ | ----------- | ------------------------------------------- | ---------------------------- |
| `id`         | UUID        | PK, default gen_random_uuid()               |                              |
| `user_id`    | UUID        | NOT NULL, FK → auth.users ON DELETE CASCADE | Eigenaar                     |
| `name`       | TEXT        | NOT NULL                                    | Bijv. "Albert Heijn Centrum" |
| `address`    | TEXT        | NULL                                        | Optioneel adres              |
| `notes`      | TEXT        | NULL                                        | Vrije notities               |
| `sort_order` | INTEGER     | NOT NULL DEFAULT 0                          | Volgorde in lijst            |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW()                      |                              |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW()                      | Trigger                      |

- **Uniek:** geen constraint op (user_id, name); gebruikers mogen twee keer "Jumbo" hebben (andere vestiging).
- **Index:** `idx_user_grocery_stores_user_id`, eventueel `(user_id, sort_order)` voor gesorteerde lijst.

### RLS

- SELECT/INSERT/UPDATE/DELETE: `auth.uid() = user_id`.

---

## Uitbreiding later: ingrediënt ↔ winkel

Voor “ingrediënt X koop ik bij winkel Y”:

- **Optie A – koppeltabel:**  
  `user_grocery_store_ingredients (user_id?, grocery_store_id, nevo_code of ingredient_id, preferred boolean)`  
  Gebruiker koppelt NEVO/ingrediënt aan een winkel; meerdere winkels per ingrediënt mogelijk (bijv. voorkeur + backup).

- **Optie B – voorkeur op pantry_item:**  
  Kolom op `pantry_items`: `preferred_store_id UUID NULL FK → user_grocery_stores(id)`.  
  Eenvoudiger als je alleen “waar koop ik dit” per voorraaditem wilt.

- **Optie C – op boodschappenlijst-niveau:**  
  Boodschappenlijst regels groeperen/filteren op winkel (zonder expliciete koppeling ingrediënt↔winkel).  
  Dan volstaat fase 1: winkels zijn alleen labels voor groepering.

**Aanbeveling:** Start met **alleen winkels** (fase 1). Koppeltabel of pantry-uitbreiding in een volgende iteratie, afhankelijk of je “waar koop ik X” (per ingrediënt) of alleen “mijn winkels + groepering boodschappenlijst” nodig hebt.

---

## Bouwplan (concreet)

### Stap 1 – Database

1. Migratie aanmaken: `supabase/migrations/YYYYMMDD_user_grocery_stores.sql`.
2. Tabel `user_grocery_stores` met kolommen hierboven.
3. Trigger `set_updated_at_user_grocery_stores` → `handle_updated_at()`.
4. RLS inschakelen + vier policies (SELECT/INSERT/UPDATE/DELETE) op `user_id = auth.uid()`.

### Stap 2 – Backend (types, schemas, actions)

1. **Types/schemas:**
   - `src/lib/grocery-stores/grocery-stores.types.ts` – type `GroceryStoreRow`.
   - `src/lib/grocery-stores/grocery-stores.schemas.ts` – Zod voor create/update (name verplicht, address/notes optioneel, sort_order).

2. **Actions:**
   - `src/app/(app)/grocery-stores/actions/grocery-stores.actions.ts`:
     - `listGroceryStoresAction()` → `{ ok: true, stores: GroceryStoreRow[] }`.
     - `createGroceryStoreAction({ name, address?, notes? })`.
     - `updateGroceryStoreAction(id, { name?, address?, notes?, sort_order? })`.
     - `deleteGroceryStoreAction(id)`.
   - Auth: `createClient()` + `getUser()`; bij geen user `AppError('UNAUTHORIZED', ...)` of `{ error: string }`.
   - Bij succes: `revalidatePath('/grocery-stores')` en toast vanuit client.

### Stap 3 – Route en navigatie

1. **Route:**
   - `src/app/(app)/grocery-stores/page.tsx` – server component, auth check, metadata (getTranslations), laad stores via `listGroceryStoresAction()`, render client component met `stores={...}`.

2. **Nav:**
   - In `src/lib/nav.ts`: nieuw item in `baseNavItems` (bijv. tussen Pantry en Calendar):  
     `href: '/grocery-stores'`, `translationKey: 'groceryStores'`, icon bijv. `BuildingStorefrontIcon` (Heroicons).
   - In `getPageTitle` en `getBreadcrumbs`: pad `/grocery-stores` herkennen.

3. **Vertalingen:**
   - `messages/nl.json`: `nav.groceryStores`: "Supermarkten"; sectie `groceryStores`: title, description, addStore, name, address, notes, deleteConfirm, etc.
   - `messages/en.json`: idem, "Grocery stores".

### Stap 4 – UI (Catalyst)

1. **Pagina-client:**
   - `src/app/(app)/grocery-stores/components/GroceryStoresPageClient.tsx`:
     - Lijst van winkels (kaarten of tabel), volgorde op `sort_order` + `created_at`.
     - Knop “Winkel toevoegen” opent Dialog (Catalyst).
     - Per winkel: bewerken (Dialog of inline), verwijderen (bevestiging).
     - Gebruik `useToast()` voor success/error na actions.

2. **Formulier in dialog:**
   - Velden: naam (verplicht), adres (optioneel), notities (optioneel).
   - Catalyst: Field, Label, Input, Textarea, Button, Dialog.

3. **Lege staat:**
   - Als `stores.length === 0`: korte uitleg + CTA “Eerste winkel toevoegen”.

### Stap 5 – Optioneel

- **Sorteren:** drag-and-drop of pijltjes om `sort_order` te wijzigen (kan later).
- **Validatie:** max length voor name/address/notes in schema.

---

## Bestandsstructuur (voorgesteld)

```
src/app/(app)/grocery-stores/
  page.tsx
  actions/
    grocery-stores.actions.ts
  components/
    GroceryStoresPageClient.tsx
    GroceryStoreFormDialog.tsx   (optioneel, uit te trekken uit client)

src/lib/grocery-stores/
  grocery-stores.types.ts
  grocery-stores.schemas.ts
```

---

## Afhankelijkheden

- Geen nieuwe npm-packages; bestaande stack (Next.js, Supabase, Catalyst, Zod).
- Pantry en boodschappenlijst blijven ongewijzigd in fase 1; koppeling ingrediënt↔winkel komt later.

---

## Samenvatting

| Onderdeel   | Keuze                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| Eigenaar    | User (`user_id` op `user_grocery_stores`)                                 |
| Route       | `/grocery-stores`                                                         |
| Nav         | Nieuw item "Supermarkten" / "Grocery stores"                              |
| CRUD        | Server actions in `grocery-stores.actions.ts`; lijst/create/update/delete |
| UI          | Catalyst (Dialog, Fieldset, Input, Button), toasts voor feedback          |
| Vertalingen | `nav.groceryStores` + namespace `groceryStores` in nl/en                  |
| Later       | Koppeltabel of pantry-kolom voor ingrediënt ↔ winkel                      |

Als je wilt, kan ik de volgende stap (migratie + types + actions) concreet uitwerken in code.
