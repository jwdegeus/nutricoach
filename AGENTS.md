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

#### 11. Documentation References

When implementing UI components:

1. **ALWAYS** consult: https://catalyst.tailwindui.com/docs
2. Check component examples in `/components/catalyst/` directory
3. Follow Catalyst's API patterns and prop structures
4. Maintain Catalyst's accessibility standards (keyboard navigation, screen readers)

#### 12. Enforcement

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
