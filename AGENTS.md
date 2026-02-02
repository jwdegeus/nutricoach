# Agent Guidelines - NutriCoach Project

## UI Component Library: Catalyst by Tailwind CSS

**STRICT RULE**: This project **EXCLUSIVELY** uses **Catalyst UI Kit** by Tailwind CSS as the default and only UI component library.

### Primary Reference

- **Documentation**: https://catalyst.tailwindui.com/docs
- **Official Site**: https://tailwindcss.com/plus/ui-kit
- **Component Location**: `/components/catalyst/`

### Critical Guidelines

#### 1. Component Usage

- **ALWAYS** use Catalyst components from `@/components/catalyst/*`
- **NEVER** use Shadcn UI, Radix UI primitives, or any other UI library
- **NEVER** create custom UI components that duplicate Catalyst functionality
- **NEVER** install or reference Shadcn UI components

#### 2. Available Catalyst Components

All components are located in `/components/catalyst/`:

- `Alert` - Alert messages and notifications
- `Avatar` - User avatars
- `Badge` - Status badges and labels
- `Button` - All button variants (solid, outline, plain, etc.)
- `Checkbox` - Form checkboxes
- `Combobox` - Autocomplete/combobox inputs
- `DescriptionList` - Key-value description lists
- `Dialog` - Modal dialogs and overlays
- `Divider` - Visual separators
- `Dropdown` - Dropdown menus
- `Fieldset` - Form field groups
- `Heading` - Typography headings
- `Input` - Text inputs
- `Link` - Navigation links (integrated with Next.js)
- `Listbox` - Select menus
- `Navbar` - Top navigation bars
- `Pagination` - Pagination controls
- `Radio` - Radio button groups
- `Select` - Select dropdowns
- `Sidebar` - Sidebar navigation
- `SidebarLayout` - Sidebar-based page layouts
- `StackedLayout` - Stacked page layouts
- `AuthLayout` - Authentication page layouts
- `Switch` - Toggle switches
- `Table` - Data tables
- `Text` - Typography text
- `Textarea` - Multi-line text inputs

#### 3. Icon Library

- **PRIMARY**: Use **Heroicons** from `@heroicons/react`
  - 16×16 icons: `@heroicons/react/16/solid` (for buttons, dropdowns, listboxes)
  - 20×20 icons: `@heroicons/react/20/solid` (for navbar, sidebar items)
- **SECONDARY**: `lucide-react` may be used temporarily but should be migrated to Heroicons
- **NEVER** use icon libraries that conflict with Catalyst design system

#### 4. Styling

- **Tailwind CSS v4** is the styling framework
- All Catalyst components use Tailwind utility classes
- Customize components by modifying classes directly in component files
- Follow Catalyst's design patterns and spacing scale
- Use default Tailwind theme configuration (Catalyst is built around defaults)

#### 5. Dependencies

**Required** (already installed):

- `@headlessui/react` - Headless UI primitives (used by Catalyst)
- `@heroicons/react` - Icon library
- `motion` - Animation library
- `clsx` - Class name utility
- `tailwind-merge` - Tailwind class merging

**FORBIDDEN** (must never be installed):

- `shadcn/ui` or any Shadcn packages
- `@radix-ui/*` packages (except those required by Headless UI)
- `class-variance-authority` (Shadcn-specific)
- Any other UI component libraries

#### 6. Component Customization

- Catalyst components are **your code** - modify them directly in `/components/catalyst/`
- All styling is done with Tailwind utility classes in the component markup
- No configuration variables or complex CSS to manage
- Customize freely while maintaining Catalyst design principles

#### 7. Framework Integration

- Catalyst is integrated with **Next.js** via the `Link` component
- The `Link` component in `/components/catalyst/link.tsx` uses Next.js `Link`
- All navigation should use Catalyst's `Link` component

#### 8. When Adding New Components

1. **FIRST**: Check if Catalyst has a component that fits your need
2. **SECOND**: Check Catalyst documentation for patterns and examples
3. **THIRD**: If Catalyst doesn't have it, create a custom component following Catalyst patterns
4. **NEVER**: Install alternative UI libraries

#### 9. Code Examples

**Correct - Using Catalyst:**

```tsx
import { Button } from '@/components/catalyst/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { PlusIcon } from '@heroicons/react/16/solid';

function MyComponent() {
  return (
    <Dialog>
      <DialogTitle>Add Item</DialogTitle>
      <DialogBody>
        <DialogDescription>Enter item details</DialogDescription>
        {/* form content */}
      </DialogBody>
      <DialogActions>
        <Button>
          <PlusIcon />
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

**Incorrect - Using Shadcn or other libraries:**

```tsx
// ❌ NEVER DO THIS
import { Button } from '@/components/ui/button';
import { Dialog } from '@radix-ui/react-dialog';
import { Plus } from 'lucide-react';
```

#### 10. Migration Notes

- All Shadcn UI components have been removed from this project
- `components.json` (Shadcn config) has been deleted
- Shadcn-specific dependencies have been removed
- All UI components should now use Catalyst exclusively

#### 11. User feedback (notifications)

- **ALWAYS** show success and error feedback as **global notifications** (toasts), not as inline banners or page reloads.
- Use the global toast API: `useToast()` from `@/src/components/app/ToastContext` → `showToast({ type: 'success' | 'error', title: string, description?: string })`.
- Notifications are rendered by `ToastProvider` in the app layout; no page reload. Style reference: [Tailwind UI Notifications](https://tailwindcss.com/plus/ui-blocks/application-ui/overlays/notifications).
- **NEVER** rely on `revalidatePath` or full-page navigation as the only way to show "saved" or error feedback; always call `showToast` after server actions for user-visible outcomes.

#### 12. Documentation References

When implementing UI components:

1. **ALWAYS** consult: https://catalyst.tailwindui.com/docs
2. Check component examples in `/components/catalyst/` directory
3. Follow Catalyst's API patterns and prop structures
4. Maintain Catalyst's accessibility standards (keyboard navigation, screen readers)

#### 13. Enforcement

- **Code reviews**: Reject any PRs that introduce Shadcn or alternative UI libraries
- **Linting**: Consider adding ESLint rules to prevent imports from `@/components/ui` or Shadcn packages
- **Documentation**: Always reference Catalyst documentation in code comments when using components

---

## Summary

**This project uses Catalyst UI Kit exclusively. No exceptions.**

- ✅ Use: Catalyst components from `/components/catalyst/`
- ✅ Use: Heroicons from `@heroicons/react`
- ✅ Use: Tailwind CSS v4
- ❌ Never use: Shadcn UI
- ❌ Never use: Radix UI primitives (except via Headless UI)
- ❌ Never use: Other UI component libraries

For questions or component needs, always refer to: **https://catalyst.tailwindui.com/docs**

# Agent Guidelines — NutriCoach (Cursor)

These rules apply to **all UI work** in this repo (Next.js pages/layouts/components, styles, and UI-related logic). If you touch UI, you **must** follow this document.

---

## 1) UI system of record

### Catalyst UI Kit (Tailwind CSS Plus)

**STRICT RULE**: This project uses **Catalyst UI Kit** by Tailwind CSS (**TailwindCSS Plus**) as the **primary and default** UI component library.

- **Docs**: https://catalyst.tailwindui.com/docs
- **Tailwind Plus UI Kit**: https://tailwindcss.com/plus/ui-kit
- **Local components**: `@/components/catalyst/*` (directory: `/components/catalyst/`)

### Headless UI

- **Allowed only as an implementation detail** via Catalyst components.
- **Do not** import `@headlessui/react` directly in feature UI unless there is no Catalyst equivalent **and** you follow Catalyst patterns.

---

## 2) Non‑negotiables

### 2.1 Component usage

- **ALWAYS** prefer Catalyst components from `@/components/catalyst/*`.
- **NEVER** use Shadcn UI, Radix UI primitives (directly), or any other UI component library.
- **NEVER** create bespoke components that duplicate existing Catalyst components.

### 2.2 Styling rules (TailwindCSS Plus conventions)

- Layout and spacing must follow TailwindCSS Plus patterns:
  - Consistent spacing scale: `gap-4/6`, `p-4/6`, `space-y-4/6`
  - Mobile-first responsiveness: `sm:`, `md:`, `lg:`
  - Container patterns: `mx-auto`, `max-w-*`, `px-4 sm:px-6 lg:px-8`
  - Clear typography hierarchy (Headings/Text components, not ad-hoc)

### 2.3 Theme tokens over hard-coded palettes

To avoid theme drift across breakpoints (especially mobile), prefer **semantic tokens** over hard-coded grays/blues.

- Prefer tokens (examples):
  - `bg-background`, `text-foreground`, `text-muted-foreground`
  - `border-border`, `bg-accent`, `text-accent-foreground`
  - `ring-ring`, `focus-visible:ring-ring`
- Avoid introducing hard-coded palette utilities like:
  - `bg-white`, `text-gray-900`, `border-gray-200`, `ring-blue-500`

**Exception**: If the Catalyst component source already uses specific palette utilities, match that existing pattern instead of inventing a new one.

### 2.4 User feedback as notifications (no page reload)

- **ALWAYS** show success/error feedback via the **global notification** system: `useToast()` from `@/src/components/app/ToastContext` → `showToast({ type, title, description? })`.
- **NEVER** use only inline banners or page reload/revalidate as the primary way to confirm saves or show errors; always trigger a toast so feedback is visible app-wide without navigation.
- Reference: [Tailwind UI Notifications](https://tailwindcss.com/plus/ui-blocks/application-ui/overlays/notifications).

### 2.5 States and accessibility are required

Any interactive UI must account for:

- **States**: `loading`, `empty`, `error`, and `success` where relevant.
- **A11y**: labels, focus styles, keyboard navigation, and `aria-*` attributes where applicable.

### 2.6 No new UI libraries

Do not add or introduce:

- MUI, Chakra, Mantine, AntD, Bootstrap, etc.
- New CSS frameworks/resets

---

## 3) Component inventory

All Catalyst components live in `/components/catalyst/` (import via `@/components/catalyst/...`).

- `Alert` — alert messages/notifications
- `Avatar` — user avatars
- `Badge` — status badges
- `Button` — solid/outline/plain variants
- `Checkbox` — form checkboxes
- `Combobox` — autocomplete
- `DescriptionList` — key/value lists
- `Dialog` — modals and overlays
- `Divider` — separators
- `Dropdown` — menus
- `Fieldset` — grouped form fields
- `Heading` — typographic headings
- `Input` — text inputs
- `Link` — navigation links (Next.js integrated)
- `Listbox` — select menus
- `Navbar` — top navigation
- `Pagination` — pagination controls
- `Radio` — radio groups
- `Select` — select dropdowns
- `Sidebar` — sidebar navigation
- `SidebarLayout` — sidebar-based layouts
- `StackedLayout` — stacked layouts
- `AuthLayout` — auth page layouts
- `Switch` — toggle switches
- `Table` — data tables
- `Text` — typography
- `Textarea` — multi-line inputs

If you need something new:

1. Check Catalyst docs
2. Check `/components/catalyst/` for an existing pattern
3. Only then create a small custom component that follows Catalyst conventions

---

## 4) Icons

- **Primary**: Heroicons (`@heroicons/react`)
  - 16×16: `@heroicons/react/16/solid` (buttons, dropdowns, listboxes)
  - 20×20: `@heroicons/react/20/solid` (navbar, sidebar items)
- **Secondary**: `lucide-react` is tolerated temporarily but should be migrated to Heroicons.

---

## 5) Cursor workflow rules (atomic prompts)

### 5.1 Use the codebase first

Before implementing UI changes, you must search and reuse existing patterns:

- Use `@codebase` to find similar screens/components.
- Match existing Catalyst usage and token patterns.

### 5.2 Atomic changes only

Each Cursor step must:

- Have **one** clear goal (one feature or one fix)
- Touch **1–3 files** where possible
- Be small enough to review quickly
- Avoid scope creep (“and also…”)

### 5.3 Prompt series must be 1‑by‑1

If a feature requires multiple steps:

- Do **Step 1** only, then stop.
- Incorporate feedback/corrections.
- Only then continue with the next step.

---

## 6) Enforcement recommendations

- Reject PRs that introduce non-Catalyst UI libs.
- Add ESLint rules to ban imports from `@/components/ui/*` and common UI libraries.
- Consider a CI grep check to prevent new hard-coded palette classes (e.g., `text-gray-`, `bg-white`, `ring-blue-`).

---

## 7) Quick examples

### Correct (Catalyst)

```tsx
import { Button } from '@/components/catalyst/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog';
import { PlusIcon } from '@heroicons/react/16/solid';

export function Example() {
  return (
    <Dialog>
      <DialogTitle>__TODO__</DialogTitle>
      <DialogBody>
        <DialogDescription>__TODO__</DialogDescription>
      </DialogBody>
      <DialogActions>
        <Button>
          <PlusIcon />
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

### Incorrect (forbidden libraries)

```tsx
// ❌ NEVER
import { Button } from '@/components/ui/button';
import { Dialog } from '@radix-ui/react-dialog';
import { Plus } from 'lucide-react';
```

---

## Summary

**Catalyst is the UI system of record.**

- ✅ Use: Catalyst components from `/components/catalyst/`
- ✅ Use: TailwindCSS Plus layout conventions
- ✅ Use: theme tokens over hard-coded palette utilities
- ✅ Use: global notifications (`useToast()` from `ToastContext`) for all success/error feedback; no page reload
- ❌ Never use: Shadcn UI
- ❌ Never use: Radix primitives directly
- ❌ Never add: other UI component libraries
- ❌ Never use only inline banners or revalidate as the sole feedback for saves/errors

When in doubt: consult Catalyst docs and mirror patterns already present in the codebase.
