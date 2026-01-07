# Theme Color Palette – Complementary Variations

## New Tokens

- `--brand-secondary` / `--brand-secondary-foreground` – teal complement; buttons, badges, emphasis blocks
- `--brand-tertiary` / `--brand-tertiary-foreground` – purple accent; highlights, charts, secondary CTAs
- `--link` / `--link-foreground` – accessible link color; inline links and actions
- `--highlight` / `--highlight-foreground` – callouts and info panels
- `--neutral` / `--neutral-foreground` – neutral surfaces and subtle components

Light and dark variants are defined in `app/globals.css`. All colors meet or exceed WCAG 2.1 AA when used with their corresponding foregrounds.

## Usage Guidelines

- Prefer `brand-secondary` for secondary CTAs and badges to maintain hierarchy under `primary`
- Use `brand-tertiary` sparingly for accenting charts and status banners
- `link` should be reserved for inline textual actions; avoid non-link elements with link color
- `highlight` is intended for callouts, info notices, and onboarding hints
- `neutral` backgrounds for cards, panels, and dividers where reduced visual weight is desired

## Tailwind Mappings

Colors are available via Tailwind classes:

- `bg-brand-primary`, `bg-brand-secondary`, `bg-brand-tertiary`, `text-brand-*-foreground`
- `bg-link`, `text-link-foreground`
- `bg-highlight`, `text-highlight-foreground`
- `bg-neutral`, `text-neutral-foreground`

## Components

- Button variants: `brand`, `brandSecondary`, `brandTertiary`, `highlight`, `neutral`, `info`
- Badge variants: `brand`, `brandSecondary`, `brandTertiary`, `highlight`, `neutral`

## Visual Examples

```tsx
<Button variant="brand">Primary CTA</Button>
<Button variant="brandSecondary">Secondary CTA</Button>
<Badge variant="brandTertiary">New</Badge>
<div className="p-4 bg-highlight text-highlight-foreground rounded-xl">Callout</div>
<a className="text-link hover:underline" href="#">Learn more</a>
```

## Accessibility

- Use paired foreground tokens to ensure minimum 4.5:1 contrast for text
- For large text (>18pt), 3:1 contrast is acceptable; this palette exceeds AA for typical UI sizes
- Avoid placing saturated accents over noisy images without an overlay

## Testing

- Perform cross-browser checks (Chrome, Firefox, Safari, Edge) and devices
- Validate contrast with tooling (e.g., axe, Lighthouse)
