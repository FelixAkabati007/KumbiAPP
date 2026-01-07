# Theme Structure and Customization

## Themes

- `light`: default theme using base tokens in `:root`
- `dark`: dark mode overrides via `.dark`
- `hc` (High Contrast): high contrast overrides via `.hc`
- `custom`: user-defined palette applied via CSS variables at runtime

## Tokens

Defined in `app/globals.css` using CSS variables. Tailwind maps `hsl(var(--token))` to utility classes.

Key tokens:

- Surface: `--background`, `--foreground`, `--card`, `--popover`, `--border`
- UI colors: `--primary`, `--secondary`, `--accent`, `--muted`, `--destructive`
- Brand: `--brand-*` family
- Accessibility: `--link`, `--highlight`, `--neutral` with matching `*-foreground`

## Customization

- Use `ThemeSelector` to preview/apply `custom` values
- Programmatic APIs: `applyTheme(key, config?)`, `setThemePreference(key, config?, ttlHours?)`
- Persisted in `localStorage` and synced via `/api/theme/preferences`

## Accessibility

- High contrast theme `hc` designed for WCAG 2.1 AA, prioritizing 4.5:1 contrast
- Pair text with `*-foreground` tokens to maintain sufficient contrast

## Maintenance

- Add new theme: define a class (e.g., `.sepia`) overriding core tokens, then include in selector UI
- Extend Tailwind mappings as needed in `tailwind.config.ts`

## Testing

- Unit tests verify storage and class toggling
- Recommended to add E2E tests for theme switching across browsers
