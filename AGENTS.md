# Agent rules

## Icons

Always use Hugeicons from `@hugeicons/core-free-icons`. Never add another icon set (Remix Icon,
Font Awesome, Heroicons, Lucide, …) and never hand-draw a glyph.

- Import the definition, not an element: `import { Add01Icon } from '@hugeicons/core-free-icons'`.
- BoardUI components take the definition directly:
  `<Button leadingIcon={Add01Icon}>Add</Button>`.
- Rendering an icon yourself goes through `IconGlyph` (`@xbase/ui/utils/icon`), which also lets a
  component such as `Spinner` stand in:
  `<IconGlyph icon={Add01Icon} className="size-4" aria-hidden />`.
- Keep icons decorative unless they carry a meaning of their own: pass `aria-hidden` and let the
  surrounding text name the action.
- Brand marks (X, LinkedIn, Google, …) stay the official assets in `social-button`; they are not
  Hugeicons.
