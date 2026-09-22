# Design tokens

Every token Magpi declares for itself, why it exists, and the rules that keep
the vendored Supabase system intact underneath it.

`DESIGN.md` at the repository root states the visual system for the `impeccable`
skill. This file is the token-level record: what is in
`web/styles/tokens.css`, where the rest comes from, and what the gate rejects.

## Where the tokens come from

Magpi uses the Supabase design system itself, vendored out of the public
`supabase/supabase` repository. The actual token files, copied byte for byte out
of the repository the Supabase design team already maintains.

That repository is a pnpm monorepo on Tailwind v4, CSS first, with no
`tailwind.config.js`. Its shared packages are private, unpublished, and
versioned `workspace:*`, so they cannot be imported from outside that workspace
and this repository never tries. Copying the CSS is the only route.

`scripts/sync-tokens.mjs` does the copying. It takes a path to a local checkout
of `supabase/supabase`, copies a fixed list of 15 files into
`web/styles/supabase/` preserving their relative paths, reads the checkout's
`HEAD` with `git rev-parse`, and writes `web/styles/supabase/UPSTREAM` with that
SHA, the date, and the file count. The current vendor is commit
`83c33e903c920aa40cfc811e2a5bd81c40e0412d`, synced 2026-09-09.

Running it again against a newer checkout overwrites the same 15 files, which
produces a reviewable diff in `git status`. That is how upstream changes are
taken: deliberately, in a commit, with the new SHA written down.

Two rules follow, and both are absolute:

**A vendored file is never hand-edited.** Not to fix a value, not to delete a
line that looks unused, not to add a comment. A hand edit is invisible in the
next sync's diff and is silently reverted by it, so the fix disappears and
nobody knows when. If a vendored value is wrong for Magpi, it gets overridden
in `web/styles/tokens.css`. If it is wrong for Supabase, it gets fixed upstream.

**`packages/ui/build/` is copied verbatim.** Despite the directory name, it is
checked into git upstream and hand-edited there. There is no build step to run
and nothing to generate. The sync script copies it as it finds it.

## Load order

`web/styles/globals.css` is two imports and three `@source` directives:

```css
@import './supabase/packages/config/tailwind.config.css';
@import './tokens.css';

@source '../app';
@source '../components';
@source '../lib';
```

The vendored entry point loads first and Magpi's own tokens load last, so a
Magpi override wins on ordering rather than on specificity. Nothing in
`tokens.css` needs `!important` and nothing in it should ever need a longer
selector.

Inside the vendored entry point, `tailwind.config.css` imports in an order that
is not alphabetical and is not safe to sort. Two lines in it will cost a day
each if they move.

**`unset-tw-colors.css` before `colors.css`.** Tailwind v4 ships its own default
color palette as `--color-*` custom properties. `unset-tw-colors.css` clears
them, and `colors.css` then declares the Radix and Supabase brand values into the
same names. Reverse the two and Tailwind's defaults shadow the Radix palette:
`--color-amber-500` resolves to Tailwind's amber rather than Supabase's, the app
still compiles, and every warning state is the wrong yellow.

**`@custom-variant dark` in `variants.css`.** Dark mode here is not Tailwind's
default `dark` variant, because the theme is selected by a `data-theme`
attribute that `next-themes` writes on `<html>` and that carries three values,
`dark`, `light` and `classic-dark`. The variant is defined as:

```css
@custom-variant dark (&:where([data-theme*='dark'] *, [data-theme*='dark']));
```

Without that line, every `dark:` utility in the codebase compiles to nothing and
emits no error. The app renders, the class is in the markup, and the style is
absent. The `:where()` wrapper keeps specificity at zero so a dark utility does
not outrank an unrelated rule.

Tailwind v4 also has no content globs. Any directory whose class names must be
generated needs an `@source` line in `globals.css`. A new top-level directory
under `web/` with components in it gets a fourth line, or its classes are
silently missing from the build.

## The tokens

Every token declared in `web/styles/tokens.css`. Nothing goes in that file that
the upstream system already answers.

| Token                  | Value                                                                          | Justification                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--font-sans`          | `var(--font-inter), ui-sans-serif, system-ui, sans-serif`                      | Inter is the Supabase body face, and `--font-inter` is the variable `next/font/google` writes, so the font loads through Next's font pipeline rather than a render-blocking stylesheet request.     |
| `--font-heading`       | `var(--font-manrope), var(--font-inter), ui-sans-serif, system-ui, sans-serif` | Manrope is the Supabase heading face, with Inter ahead of the system stack so a failed heading font falls back to the body face instead of to a system default with different metrics.              |
| `--font-mono`          | `var(--font-source-code-pro), ui-monospace, SFMono-Regular, monospace`         | Source Code Pro is the Supabase mono face, used for model ids, chunk ids, error detail and code inside cited documents.                                                                             |
| `--text-base`          | `0.9375rem`                                                                    | The override from `apps/www`, taken because Tailwind's 1rem default reads a shade too large in an application this dense, where a chat turn, a citation list and a source panel share one viewport. |
| `--font-weight-normal` | `450`                                                                          | The override from `apps/www`. Inter at 400 goes thin against the dark theme's background, and 450 is upstream's correction for it.                                                                  |
| `--z-base`             | `0`                                                                            | The floor of the named depth scale, so ordinary page content has a name rather than an absent value.                                                                                                |
| `--z-sticky`           | `10`                                                                           | Sticky headers and the conversation sidebar, which must clear scrolling content and nothing else.                                                                                                   |
| `--z-dropdown`         | `20`                                                                           | Menus, comboboxes and the space picker, above sticky chrome and below anything modal.                                                                                                               |
| `--z-overlay`          | `30`                                                                           | Scrims and backdrops, one step below the thing they dim.                                                                                                                                            |
| `--z-modal`            | `40`                                                                           | Dialogs, sheets and the command menu, above their own overlay.                                                                                                                                      |
| `--z-toast`            | `50`                                                                           | Ingest failures and connection status changes, which must be visible above a dialog because they report something that happened outside it.                                                         |
| `--measure-prose`      | `68ch`                                                                         | `DESIGN.md` caps body copy at 65 to 75 characters per line, and 68ch is the middle of that range. Applied to answer text, digests and document bodies.                                              |
| `--measure-shell`      | `72rem`                                                                        | One shell width for every row of the marketing site, header and footer included.                                                                                                                    |
| `--measure-sidebar`    | `16.5rem`                                                                      | The authenticated app sidebar. Wide enough for an icon, a label and a selected state, narrow enough that the content pane stays the stage.                                                          |

The six `--z-*` tokens are one decision, stated as six values. A stacking
problem is then a question about where a component belongs on a named scale,
with an answer in this table. Nothing in the codebase uses a numeric `z-index`
literal, and `999` never appears.

## Chart palette validation

Every mark in every chart reads its color from `CHART_COLORS` in
`web/components/charts/palette.ts`, which holds `var(--color-*)` references and
nothing else. What those references resolve to, and what the `dataviz` validator
said about them, is recorded here rather than in that file. The raw-color check
does not read comments, on purpose: a checker that skipped them would be a
checker anyone could get a literal past by writing it above the line instead of
on it.

**The form is emphasis, not categorical.** One accent series carries the story
and its companion recedes to a gray. A validated categorical palette needs hues
the Supabase token set does not expose, and a two-series chart where one series
is the point does not need one. `--color-brand-600` is the accent,
`--color-border-stronger` is the companion, `--color-border` draws the hairline
grid, and `--color-warning-600` and `--color-destructive-600` are reserved for
meter severity, where they always appear beside a word saying the same thing.

Checked on 2026-09-09 with `scripts/validate_palette.js` from the `dataviz`
skill, fed the resolved values of both slots over each theme's own surface.

| Theme | Accent, `--color-brand-600` | Companion, `--color-border-stronger` | Surface   |
| ----- | --------------------------- | ------------------------------------ | --------- |
| Light | `#097c4f`                   | `#a0a09c`                            | `#fcfcfc` |
| Dark  | `#85e0ba`                   | `#6e6e6a`                            | `#1c1c1c` |

| Check               | Light                      | Dark                       |
| ------------------- | -------------------------- | -------------------------- |
| Lightness band      | pass                       | fail, accent at L 0.839    |
| Chroma floor        | fail, companion at C 0.006 | fail, companion at C 0.006 |
| CVD separation      | pass, worst dE 16.3 protan | pass, worst dE 30.1 deutan |
| Normal-vision floor | pass, worst dE 21.8        | pass, worst dE 31.8        |
| Contrast vs surface | warn, companion at 2.56    | pass                       |

WCAG contrast against the surface, measured separately: light accent 5.11,
light companion 2.56, dark accent 10.85, dark companion 3.33.

Both themes clear the two checks that decide whether a reader can tell the
series apart. Three results are marked and accepted, and each one is a decision
rather than an oversight.

- **Chroma floor, both themes.** The companion is achromatic by design. Sitting
  below the floor is what makes it read as context rather than as a second
  subject, which is the whole point of the emphasis form. The validator scores a
  categorical palette, where a gray slot is a mistake; here it is the brief.
- **Lightness band, dark theme.** `--color-brand-600` resolves above the band in
  dark. It is a fixed Supabase token, and restepping it to satisfy a chart check
  would put the charts on a green the rest of the product does not use.
  Identity preservation wins, and the pair passes CVD separation at dE 30.1
  regardless.
- **Contrast warning, light theme.** The companion at 2.56 is below 3:1, which
  the validator says obligates relief rather than being dismissable. The relief
  is built: every chart carries a table view of the same numbers behind a
  disclosure, both series are named in a legend, and the accent series is
  directly labelled. No value in any chart is reachable only by looking at a
  gray line.

An earlier attempt used a companion at the same lightness as the accent. It
failed the normal-vision floor at dE 11.9, meaning a full-color reader could not
reliably separate a dark green line from a dark gray one. Separating the two on
lightness rather than on hue is what fixed it, and it is why the companion is a
border token rather than a foreground one.

## The banned patterns, as a review checklist

Restated from `DESIGN.md` so a reviewer can run down them against a diff. Each
line is a yes or no about the code in front of you.

- [ ] No card used as a default container. A card appears only where it is
      genuinely the best affordance for the content.
- [ ] No nested cards. A card inside a card is always wrong.
- [ ] No tab strip inside a card.
- [ ] No side-stripe border. A `border-left` or `border-right` thicker than 1px
      used as a colored accent on a card, list item, callout or alert. Use a
      full border, a background tint, a leading icon, or nothing.
- [ ] No `border: 1px solid` paired with a soft wide `box-shadow` on the same
      element. One or the other.
- [ ] No card radius above 16px. `--radius-panel` is the ceiling.
- [ ] No gradient text.
- [ ] No decorative glassmorphism.
- [ ] No hero-metric template.
- [ ] No identical card grids.
- [ ] No tiny uppercase tracked eyebrow above a section.
- [ ] No `01 / 02 / 03` scaffolding.
- [ ] No raw hex, and no Tailwind default palette class such as `bg-slate-800`.
      Semantic tokens only.
- [ ] No numeric `z-index` literal. The named scale above, always.
- [ ] Body text and placeholder text at 4.5:1 contrast minimum.
- [ ] Line length capped at 65 to 75 characters.
- [ ] Every animation has a `prefers-reduced-motion` alternative, uses an
      ease-out curve, and does not bounce.
- [ ] Persistent navigation and filter controls sit outside asynchronous
      content-state switches. A loading, empty or error state may replace the
      content below a tab strip and must never move or remove the strip.
- [ ] Empty, loading and error states are designed for this screen, not
      inherited by default.
- [ ] A shadcn component was rewritten onto the Supabase semantic tokens before
      it entered the tree. Where a shadcn default fights a Supabase token, the
      token wins and the component gets edited.
- [ ] No chart color outside the token palette.

## The raw-color test

`scripts/check-raw-color.mjs` runs in the light gate and fails the build on a
color literal outside the primitive scale. Another agent writes it. This section
records what it has to do.

**What it scans.** Every `.ts`, `.tsx` and `.css` file under `web/app/`,
`web/components/`, `web/lib/`, plus `web/styles/tokens.css` and
`web/styles/globals.css`.

**What it skips.** Everything under `web/styles/supabase/`, which is vendored
and full of legitimate `oklch()` and hex literals that are not ours to change.
Also `node_modules`, `.next`, and `web/public/`, since SVG assets carry their own
fills.

**What it rejects.**

- Hex literals in any length: `#abc`, `#aabbcc`, `#aabbccdd`.
- Color function literals written with numbers: `rgb(...)`, `rgba(...)`,
  `hsl(...)`, `hsla(...)`, `oklch(...)`, `color(...)`.
- Tailwind default palette utility classes, meaning any of `slate`, `gray`,
  `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`,
  `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`,
  `purple`, `fuchsia`, `pink` or `rose` followed by a numeric step, on a color
  utility prefix such as `bg-`, `text-`, `border-`, `ring-`, `fill-`,
  `stroke-`, `from-`, `via-` or `to-`.

**What it allows.**

- Any `var(--...)` reference, which is how every legitimate color is written.
- The Supabase semantic and Radix utility classes generated from `theme.css`.
- `currentColor`, `transparent`, `inherit`, `initial`, `unset`, `none`.
- `#` inside a url, a route path or a fragment identifier, so a string like
  `href="#main"` does not trip it. Not comments: a hex literal in a docblock
  fails the same as one in a class name, so a recorded color measurement belongs
  in this file rather than above the line it describes.

**What it reports.** File path, line number, the matched text, and the token to
use instead where the mapping is obvious. It exits non-zero on the first file
with a violation and lists every violation rather than stopping at one, because a
gate that reports a single error per run turns a ten-minute fix into ten runs.
