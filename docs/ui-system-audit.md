# UI System Audit & Refactor Playbook

Compact, actionable reference for NutriCoach UI consistency. Use when auditing routes or refactoring pages.

---

## 1. Design System Rules (Source of Truth)

| Rule                   | Do                                                                                                   | Don't                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Component library**  | Catalyst from `@/components/catalyst/*`                                                              | Shadcn, Radix, custom duplicates                                       |
| **Layout inspiration** | Tailwind UI / Tailwind Plus patterns                                                                 | Ad-hoc grids, inconsistent spacing                                     |
| **Semantic tokens**    | `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `ring-ring` | `bg-zinc-950`, `dark:lg:bg-zinc-950`, `text-gray-900`, `ring-blue-500` |
| **Page wrappers**      | `bg-background`, semantic tokens                                                                     | `dark:bg-zinc-950`, `bg-white`, hardcoded grays                        |
| **Separation**         | Shadow + background contrast (`shadow-sm`, `bg-muted/30`)                                            | Heavy borders, thick rings                                             |
| **Feedback**           | `useToast()` from ToastContext                                                                       | Inline banners only, page reload                                       |

**Defined in:** `src/app/globals.css` — semantic tokens in `@theme` and `.dark`.

---

## 2. Surface Ladder & Outline Policy

### Surface hierarchy (darkest → lightest)

1. **`bg-background`** — Page base, main content area
2. **`bg-card`** — Cards, modals, sidebar, elevated content
3. **`bg-muted`** / **`bg-muted/20`** / **`bg-muted/30`** — Subtle separation, striped rows, hover

### Outline policy (AGENTS 4.0)

- **Default:** Shadow + background contrast, no heavy borders.
- **Light outlines when needed:** `outline outline-1 -outline-offset-1 outline-border/50` (or `outline-white/10` for dark).
- **Avoid:** `border-2`, `ring-2`, dark prominent outlines on cards.
- **Dividers:** `border-b border-border/50`, `divide-y divide-white/10` (light contrast only).

---

## 3. Component Standards

### Form controls

| Element                 | Standard                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| Input, Select, Textarea | `h-10` (Input/Select), `px-3 py-2`, `rounded-lg`                   |
| Focus                   | `focus-within:ring-2 focus-within:ring-ring` (semantic ring token) |
| Text                    | `text-foreground`, `placeholder:text-muted-foreground`             |
| Border                  | `border-border`                                                    |

**Source:** `components/catalyst/input.tsx`, `select.tsx`, `textarea.tsx`

### Cards

| Property | Value                                                          |
| -------- | -------------------------------------------------------------- |
| Surface  | `bg-card text-card-foreground`                                 |
| Edge     | `outline outline-1 -outline-offset-1 outline-border/50`        |
| Radius   | `rounded-lg`                                                   |
| Shadow   | `shadow-sm`                                                    |
| Padding  | `CardBody p-6`; `CardHeader px-6 pt-6`; `CardFooter px-6 pb-6` |

**Source:** `components/catalyst/card.tsx`

### Tables

| Use case                        | Pattern                                                   |
| ------------------------------- | --------------------------------------------------------- |
| Standalone (outside card/modal) | `<Table outlined>` — wraps in `bg-card` + outline         |
| Inside card/modal               | `<Table>` without `outlined`                              |
| Row height                      | `py-3` (default), `dense` → `py-2.5`                      |
| Hover/striped                   | `striped` → `even:bg-muted/20`; rows: `hover:bg-muted/30` |

**Source:** `components/catalyst/table.tsx`

### Header stack

| Layer                   | Placement    | Classes                                                                             |
| ----------------------- | ------------ | ----------------------------------------------------------------------------------- |
| Topbar (navbar)         | Sticky       | `sticky top-0 z-20`, `h-16`, `bg-background/80 backdrop-blur`                       |
| Tabs (account/settings) | Below navbar | `sticky top-16 z-10`, `border-b border-border/50`, `bg-background/80 backdrop-blur` |
| Breadcrumbs             | Normal flow  | Non-sticky, `py-3` wrapper                                                          |

**Source:** `components/catalyst/sidebar-layout.tsx`; `src/components/app/ApplicationLayout.tsx`; `AccountSectionTabs.tsx`

### PageHeader

| Prop        | Usage                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| `title`     | `h1` — `text-2xl font-semibold tracking-tight sm:text-3xl text-foreground` |
| `subtitle?` | `mt-2 text-sm text-muted-foreground sm:text-base`                          |
| `actions?`  | Mobile: under title; Desktop: right-aligned (`sm:ml-auto`)                 |

**Source:** `src/components/app/PageHeader.tsx`

```tsx
import { PageHeader } from '@/src/components/app/PageHeader';

<PageHeader
  title="Dashboard"
  subtitle="Welcome back"
  actions={<Button>Action</Button>}
/>;
```

---

## 4. Route Audit Checklist

Per route, verify:

### Breakpoints

| Size    | Width  | Checks                                                        |
| ------- | ------ | ------------------------------------------------------------- |
| Desktop | 1440px | Layout not too wide, sidebar + content balanced               |
| Tablet  | 768px  | Cards/bento stack correctly, no horizontal scroll             |
| Mobile  | 375px  | Text readable, buttons tappable (min 44px), PageHeader stacks |

### Theme

- [ ] Light: tokens render correctly, no zinc/white overrides on main content
- [ ] Dark: neutral night ramp, no green/blue tint on surfaces

### States (check presence, not implementation)

- [ ] Empty
- [ ] Loading
- [ ] Error

### Visual smells

- [ ] No double borders (card + inner border same color)
- [ ] Icons aligned (consistent size, `size-5` / `size-6` usage)
- [ ] Spacing consistent (`gap-4` / `gap-6`, `p-4` / `p-6`)
- [ ] No hardcoded zinc/gray on page wrappers

---

## 5. Migration Guide (Hardcoded → Semantic)

### Find candidates

```bash
# Hardcoded backgrounds
rg "bg-zinc-|bg-white\b|bg-gray-" src/

# Hardcoded text
rg "text-zinc-|text-gray-|text-white\b" src/

# Dark-specific overrides that bypass tokens
rg "dark:bg-zinc-|dark:text-zinc-" src/
```

### Replace patterns

| Old                          | New                          |
| ---------------------------- | ---------------------------- |
| `bg-white`                   | `bg-background` or `bg-card` |
| `bg-zinc-50` / `bg-zinc-100` | `bg-muted` / `bg-muted/30`   |
| `bg-zinc-900` (dark card)    | `bg-card`                    |
| `text-zinc-900`              | `text-foreground`            |
| `text-zinc-500`              | `text-muted-foreground`      |
| `border-zinc-200`            | `border-border`              |
| `ring-blue-500`              | `ring-ring`                  |

### Per-page steps

1. Replace page wrapper: `bg-zinc-*` → `bg-background`.
2. Replace card-like elements: use Catalyst `<Card>` or `bg-card outline-border/50`.
3. Replace text: `text-foreground`, `text-muted-foreground`.
4. Verify focus: `ring-ring`.
5. Check light + dark in dev.

---

## 6. Definition of Done (UI Work)

Before merging UI changes:

- [ ] Checked at **3 breakpoints**: 375, 768, 1440
- [ ] Verified **light + dark** themes
- [ ] No **hardcoded zinc/gray** on page-level wrappers
- [ ] Used **semantic tokens** (`text-foreground`, `bg-card`, `border-border`, `ring-ring`)
- [ ] Used **Catalyst primitives** where applicable (Card, Table, PageHeader, etc.)

---

## Quick Reference

| Primitive       | Location                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| PageHeader      | `src/components/app/PageHeader.tsx` (import: `@/src/components/app/PageHeader`) |
| Card            | `components/catalyst/card.tsx`                                                  |
| Table           | `components/catalyst/table.tsx` (incl. `outlined` prop)                         |
| Semantic tokens | `src/app/globals.css`                                                           |
| Header stack    | SidebarLayout + ApplicationLayout + AccountSectionTabs                          |
