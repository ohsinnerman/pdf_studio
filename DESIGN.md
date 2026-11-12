---
version: 1
name: PDF Studio
description: >-
  A calm, paper-and-ink desktop editor. Warm cream chrome around bright white
  pages in light mode; warm charcoal around the same white pages in dark mode.
  One accent, signal orange, marks the primary action, the active tool and the
  current selection, and nothing else. Hairlines instead of shadows; the only
  shadow in the system belongs to the paper itself.

colors:
  light:
    canvas: '#f7f7f4' # app chrome: toolbar, sidebar, status bar
    viewport: '#e9e8e2' # behind the pages, so white paper stands out
    surface: '#ffffff' # menus, dialogs, cards
    surface-sunken: '#efeee8' # hover fill, pressed toggle
    paper: '#ffffff'
    ink: '#26251e' # headings, primary text, icons
    body: '#5a5852' # secondary text
    muted: '#736f65' # captions, status bar (4.6:1 on canvas)
    faint: '#a09c92' # disabled
    hairline: '#e6e5e0'
    hairline-strong: '#cfcdc4'
    accent: '#c2410c' # signal orange: 5.2:1 with white text, 4.8:1 on canvas
    accent-hover: '#ad3a0b'
    accent-press: '#9a330a'
    on-accent: '#ffffff'
    accent-soft: '#fde7dc' # selected thumbnail fill
    danger: '#c62a47'
    success: '#1f8a65'
  dark:
    canvas: '#24211e'
    viewport: '#181614'
    surface: '#2d2925'
    surface-sunken: '#35302b'
    paper: '#ffffff' # pages stay white: it's the document, not the UI
    ink: '#f3f1ec'
    body: '#c9c5bc'
    muted: '#9a958b'
    faint: '#6f6a62'
    hairline: '#3a3530'
    hairline-strong: '#4d4741'
    accent: '#ff7a3d'
    accent-hover: '#ff8f5c'
    accent-press: '#f0661f'
    on-accent: '#1a1714'
    accent-soft: '#4a2c1d'
    danger: '#ff6b81'
    success: '#4cc38a'

typography:
  family-sans: "'Geist Variable', 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif"
  family-mono: "'Geist Mono Variable', 'Cascadia Mono', Consolas, monospace"
  title: { size: 15px, weight: 600, line: 1.3, tracking: -0.15px } # dialog titles, empty state
  display: { size: 28px, weight: 500, line: 1.15, tracking: -0.6px } # empty state headline only
  body: { size: 13px, weight: 400, line: 1.45 } # default UI text (desktop density)
  label: { size: 12.5px, weight: 500, line: 1.2 } # buttons, menu items
  caption: { size: 11.5px, weight: 400, line: 1.3 } # status bar, thumbnail numbers
  mono: { size: 12px, weight: 400, line: 1.4 } # page sizes, zoom %, numbers that change

rounded:
  xs: 4px # tags, small chips
  sm: 6px # buttons, inputs, icon buttons
  md: 8px # menus, popovers, thumbnails
  lg: 12px # dialogs, the empty-state card
  pill: 9999px

spacing: { 1: 4px, 2: 8px, 3: 12px, 4: 16px, 5: 20px, 6: 24px, 8: 32px, 12: 48px }

sizes:
  toolbar-height: 44px
  statusbar-height: 26px
  sidebar-width: 208px
  control-height: 30px # buttons and icon buttons
  icon: 17px # lucide icons, stroke 1.75
  page-gap: 20px

motion: # from taste-skill's motion layer
  hover-in: 150ms
  hover-out: 120ms
  press: 90ms
  panel: 200ms
  ease: cubic-bezier(0.2, 0, 0, 1)
---

# PDF Studio — design system

This file is the single source of truth for how PDF Studio looks. The tokens above are mirrored in `src/styles/tokens.css`; change both together.

## Sources

- **[awesome-design-md](https://github.com/VoltAgent/awesome-design-md)**: the light theme adapts the _Cursor_ DESIGN.md (warm cream canvas, warm near-black ink, a single orange voltage, hairline-only depth). The dark theme adapts _Warp_ (a warm charcoal a tint above black, never cold blue-grey). Both are editor products, which is what PDF Studio is. Their marketing-site parts (hero type, 80 px section rhythm) don't apply to an app and aren't used.
- **[taste-skill](https://github.com/Leonxlnx/taste-skill)**: we use its system rules (one button family, one radius scale, one link look, no violet), its motion layer (timings, a 1 px hover step, a press sink, an instant focus ring, reduced motion) and its copy rules (buttons are a verb and an object, plain words, no filler). Its page-level rules (hero, one section per screen, photographs, shader effects) and its browser checker are for marketing websites and don't apply to a desktop editor.

## Principles

1. **The document is the hero.** Chrome is quiet and warm so the white page reads as the brightest thing on screen. Pages stay white in dark mode, because they are the document, not the UI.
2. **One accent, used three ways only:** the primary action (Open PDF, Save), the active or selected thing (selected thumbnail, pressed toggle), and the focus ring. Never decoration, never violet.
3. **Hairlines, not shadows.** Panels separate with 1 px `hairline`. The only shadow is the page's paper shadow (`0 1px 2px` plus `0 4px 16px`, both low-alpha ink) and the dialog's lift.
4. **Desktop density.** 13 px body, 30 px controls, 44 px toolbar. This is a tool you use for hours, not a landing page.
5. **Numbers in mono.** Page counts, zoom percentages and page sizes use Geist Mono with tabular figures so they don't jitter as they change.
6. **Fonts are bundled.** Geist and Geist Mono ship inside the app (OFL licence). There are no web font requests, because the app is offline.

## Components

**Button.** Height 30, radius `sm`, `label` type, padding 0 12px, icon 16px with 6px gap.

- `primary`: `accent` fill, `on-accent` text. Used once per view at most.
- `secondary`: `surface` fill, 1 px `hairline-strong` border, `ink` text.
- `ghost`: no fill; hover fills `surface-sunken`.

**IconButton.** 30 × 30, radius `sm`, ghost style, icon 17px in `ink`. It always has an accessible name, and its tooltip shows the name plus the shortcut. A toggled-on button shows `accent-soft` fill with an `accent` icon.

**Toolbar.** `canvas` background, bottom `hairline`, 44 px tall. Groups are separated by 8 px of space and a 1 × 18 px `hairline-strong` divider. Left to right: file name with dirty dot, page actions, spacer, undo/redo, zoom, Save.

**Tools bar.** A second 40 px row under the toolbar: tool groups on the left (select and edit · text markup · drawing · inserting · cover and redact), each tool with a single-letter shortcut. On the right, the properties of the active tool or the selected annotation: 7 colour swatches (18 px circles, selected = accent ring), width, fill, font and size selects. Destructive document actions (Apply redactions) use a danger-outlined button, never the primary fill.

**Page overlays.** Selection is a 1.5 px accent outline with 9 px square handles on a surface fill. Previews while dragging are dashed accent outlines. Inline editors (text lines, text boxes) cover the paper with `--paper` and a 2 px accent ring. Form fields are see-through with a faint accent tint and dashed outline until focused.

**Sidebar (thumbnails).** `canvas` background, right `hairline`. Thumbnails have radius `md`, a `paper` fill and a 1 px `hairline` border. Selected: a 2 px `accent` ring with 2 px offset, `accent-soft` behind the page number. The page number sits underneath in `caption` mono.

**Viewport.** `viewport` background. Pages are centred with `page-gap` between them, carry the paper shadow, and have no radius (paper is square).

**Status bar.** `canvas`, top `hairline`, 26 px, `caption` type in `muted`. Shows page _n_ of _N_, page size in mm, zoom %, and notices such as "Repaired on open".

**Dialog.** `surface`, radius `lg`, 1 px `hairline`, lift shadow, max width 420 px, `title` type for the heading, 20 px padding. Buttons sit right-aligned with the primary on the right.

**Empty state.** A centred card in the viewport: the app mark, `display` headline "Open a PDF to start", one line of `body`, a primary "Open PDF" button, and a hint "or drop a file anywhere · Ctrl+O". A final `caption` line reads "Files never leave this computer." The whole viewport is the drop target; while dragging over it, a 2 px dashed `accent` outline appears inset 12 px.

## Motion

| What                      | How                                                        | Timing                  |
| ------------------------- | ---------------------------------------------------------- | ----------------------- |
| Button / IconButton hover | fill steps toward `ink` (≈14%), lifts 1px                  | 150ms in, 120ms out     |
| Press                     | sinks to 1px below rest, scale .985                        | 90ms                    |
| Focus                     | 2 px `accent` ring, 2 px offset, appears instantly         | none                    |
| Menu / dialog open        | fade + 4 px rise                                           | 200ms                   |
| Thumbnail drag            | the dragged item lifts with the paper shadow; others slide | dnd-kit default (200ms) |

Hover movement only happens for a fine pointer (`(hover: hover) and (pointer: fine)`). With `prefers-reduced-motion`, nothing moves: colours still change, and press shows as a deeper tone.

## Copy

- Buttons are a verb and an object: **Open PDF**, **Save**, **Rotate left**, **Delete pages**, **Insert blank page**, **Insert PDF…** ("…" means a dialog follows).
- Errors say what happened and what to do: "This file isn't a PDF. Choose a file ending in .pdf." Never "Oops" or "Something went wrong".
- No exclamation marks, no "simply", no "just".

## Don't

- No violet or lavender anywhere in the UI.
- No gradients, glows, glass or blur.
- No second accent colour for decoration. Danger red is only for destructive confirmations.
- Don't round the pages, and don't tint the paper in dark mode.
- No animation that moves content because something scrolled.
