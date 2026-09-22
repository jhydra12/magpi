# Magpi: the visual system

Magpi uses the Supabase design system. Not a system inspired by it, not a reinterpretation of it. The actual tokens, vendored from `supabase/supabase` and refreshed by `scripts/sync-tokens.mjs`. A Supabase designer should open this app and find the system they already maintain.

## Sources, in order

1. **The Supabase Library** for anything it already solves. Auth, upload, chat, avatars, infinite lists.
2. **Supabase design tokens** for everything visual. Color, spacing, radius, type.
3. **shadcn/ui** only where neither of those covers it, and only after its colors, radii, spacing and typography have been rewritten onto the Supabase semantic tokens.

If a Library block exists and we wrote our own, that is a refactor to do.

## Color

The palette is OKLCH, derived upstream from `--hue: 159`, `--chroma`, `--surface` and `--contrast`. Three themes ship: `dark` (default), `light`, and `classic-dark`. `next-themes` writes `data-theme` on `<html>`.

Dark mode is a custom variant, not Tailwind's default:

```css
@custom-variant dark (&:where([data-theme*='dark'] *, [data-theme*='dark']));
```

Semantic tokens only. `--color-background`, `--color-foreground`, `--color-border`, `--color-brand-*`, `--color-destructive-*`, `--color-warning-*`. Never a raw hex, never a Tailwind default palette class like `bg-slate-800`. `scripts/check-raw-color.mjs` fails the gate on either.

Overrides local to Magpi live in `web/styles/tokens.css`, which loads last and is documented in `docs/design.md` with a justification per token.

## Type

- `--font-sans`: Inter
- `--font-heading`: Manrope
- `--font-mono`: Source Code Pro

Loaded through `next/font/google`. The upstream scale overrides apply, including `--text-base: 0.9375rem` and `--font-weight-normal: 450`.

Body copy caps at 65 to 75 characters per line. Body text hits 4.5:1 contrast minimum, placeholders included.

## Layout

Clean and plain. The Supabase cues carry the personality, so the layout does not have to. When a screen feels like it needs decoration, the information architecture is usually wrong.

The authenticated app is a full-viewport workspace. A persistent sidebar carries section navigation; the content pane fills the rest. Chat uses the full pane height with a centered transcript. Marketing keeps the centered `--measure-shell` rows.

Hierarchy runs page tabs first, subtabs outside cards, then peer content cards. Persistent navigation and filter controls live outside asynchronous content-state switches: a loading, empty or error state may replace the content below a tab strip, and must never move or remove the strip.

Every screen designs its empty state, its loading state and its error state. A knowledge base is empty on day one for every single user, so the empty state is the first thing most people see. It is a primary screen, not a fallback.

## Banned

- Cards as the default container. A card is used only when it is genuinely the best affordance. Nested cards are always wrong. A tab strip never goes inside a card.
- Side-stripe borders. A `border-left` or `border-right` thicker than 1px used as a colored accent on a card, list item, callout or alert.
- `border: 1px solid` paired with a soft wide `box-shadow` on the same element. Pick one.
- Gradient text, decorative glassmorphism, hero-metric templates, identical card grids.
- Tiny uppercase tracked eyebrows above every section. `01 / 02 / 03` scaffolding.
- Card radius above 16px. The scale tops out at `--radius-panel`.
- Raw hex outside the primitive scale.

## Motion

Every animation is intentional and every one has a `prefers-reduced-motion` alternative. Ease-out curves, no bounce. Durations come from the vendored `animations.css`.

Streaming chat is the one place motion carries information rather than polish: tokens arrive, the caret moves, citations resolve after the turn completes.

## Depth

A named z-index scale in `web/styles/tokens.css`. Never `999`.

```
--z-base: 0
--z-sticky: 10
--z-dropdown: 20
--z-overlay: 30
--z-modal: 40
--z-toast: 50
```

## Charts

Admin analytics follows the `dataviz` skill. One visual system, correct in both themes, accessible. No chart gets a color outside the token palette.

## Register

App surfaces are product register: design serves the task. The `(marketing)` route group is the only brand register surface in the repo.
