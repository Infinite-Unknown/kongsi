# Kongsi — design

Mode: **Operate** (a tool people use at the table, on a phone or a laptop, right after a meal).

## World

Warm thermal-paper receipts on a cool kopitiam marble-tile table, deep
"kopitiam tile" green as the brand and action colour, saffron (kaya / teh tarik) as the one
highlight. Amounts set in a monospace because they are data in columns, like a printed receipt.
The receipt is the hero: it is the thing that fills up while you talk.

Light only: the use scene is a bright restaurant or a desk, and one finished theme beats two half ones.

## Tokens

| Role | Token | Value |
|---|---|---|
| Page background (kopitiam marble-tile mint, so the warm receipt paper stands out) | `--paper` | `#e3ebe6` |
| Receipt / card surface | `--card` | `#fffdf8` |
| Ink (text) | `--ink` | `#1f1b16` |
| Secondary text | `--muted` | `#675e53` (AA on both surfaces) |
| Hairlines | `--line` | `#e2d8c6` |
| Brand / primary action | `--green` | `#0d5b48` (white text 7.9:1) |
| Pressed / hover | `--green-dark` | `#0a4537` |
| Highlight | `--saffron` | `#e3a422` (never text on light) |
| Highlight wash | `--saffron-soft` | `#fbefd2` |
| Focus ring (deep kaya; saffron fails 3:1 on paper) | `--focus` | `#9a6a00` (4.7:1 on card, 3.9:1 on mint) |
| Error / destructive | `--red` | `#a3302a` |

Person colours (split bar and share chips, in order): green `#0d5b48`, saffron `#e3a422`,
clay `#c0623b`, teal `#2f8f9d`, plum `#7d4e7a`, olive `#7a8b3a`, then repeat.

Type:
- Display: **Bricolage Grotesque** 700/800 (warm, slightly quirky grotesque), sizes 56 / 40 / 28 / 22.
- Text: **Hanken Grotesk** 400/500/600, 16 px body, 14 px secondary, 12 px labels.
- Figures: **JetBrains Mono** 500 with tabular numerals — amounts only.
- Loaded from Google Fonts with system fallbacks; the page stays usable if they fail.

Radius: 8 (controls) / 14 (cards) / 999 (chips). Shadow: one soft, offset paper shadow
`0 1px 0 var(--line), 0 18px 40px -24px rgba(31,27,22,.35)` for the receipt; cards are flat with a hairline.

## Spacing scale (4/8)

`--s1 4px · --s2 8px · --s3 12px · --s4 16px · --s5 24px · --s6 32px · --s7 48px · --s8 64px`.
Gutters 24 px (16 px under 680 px). Section separation 64 px; inside cards 24 px; tight groups 8–12 px.

## Screens

| Screen / region | Hero | Primary action |
|---|---|---|
| First viewport (1440×900) | The receipt, right column, with its split bar | Describe the meal in the chat ("Try the example" fills the input). With no AI key yet: **Set up the AI model** in the status callout |
| Edit by hand | — (secondary, recedes: flat cards, smaller headings) | Add item |
| For agent sites | Network URL block | Open `agent-manifest.json` |

## Motion plan

Easing tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`.

| What | How | Duration |
|---|---|---|
| First load | Heading, lede, chat card and receipt rise 12 px + fade, staggered 60 ms | 420 ms ease-out |
| New receipt line | Prints in: `clip-path` reveal from the top + 6 px drop, staggered 50 ms per new line | 320 ms ease-out |
| Changed amount (totals, shares) | Number rolls from old to new value (rAF, tabular figures, no layout shift) | 450 ms ease-out |
| Share rows appearing | Fade + 8 px rise, staggered 40 ms | 260 ms ease-out |
| Buttons | `scale(.97)` on press; hover colour only on hover-capable pointers | 140 ms |
| Dialog | fade + scale from .96 | 200 ms ease-out |
| New chat message | rise 8 px + fade, once per message | 240 ms ease-out |
| Consent card (caller site) | rise 8 px + scale from .98 + fade | 280 ms ease-out |
| Settings disclosure chevron | rotate 90° | 200 ms ease-out |
| **Signature: "the split clicks together"** | Under the total, a bar made of one coloured segment per person. When the bill changes, segments slide/resize (transform only) to their new shares; when they meet exactly, a check mark draws itself (stroke-dashoffset) beside "adds up to the total". | 520 ms ease-in-out, check 300 ms |

Reduced motion: no movement, no clip reveals, no number rolling (values swap instantly), the check appears without drawing; opacity fades of ≤150 ms remain.

## Assistant panel (runtime UI themed from the page)

The runtime files are unchanged; `styles.css` themes them and `site.js` removes glyph icons from
their labels.

- One heading row: "Ask Kongsi" left; model state pill and Developer toggle right. The runtime's
  own title is visually hidden (it repeats the heading).
- Status: a quiet dot + line when connected (green) or failed (red); with no key, a saffron-wash
  callout with the one primary button **Set up the AI model** (opens the settings, focuses the key).
- Agents: a one-line strip above the messages (the Kongsi mark for this page's agent, a drawn globe
  for a partner). The Developer view gets its own column; the strip is hidden under 680 px.
- Chat full width; bubbles 14 px radius with a 4 px tail corner; input in the editor's field style.
- AI model settings: page type, 8 px radius fields with the green focus wash, drawn chevrons,
  provider links as quiet tiles. **Save and start** is the one solid button; Connect buttons are
  outlined.
- Model state pill: key missing = saffron wash, working model = green wash, unverified = sand.

The example caller (`examples/caller/`) keeps its own world (Georgia, maroon `#7a2e1f` on warm
paper) with the same structure: themed consent card with **Allow** as the one primary,
**Always allow** outlined, **Decline** as a text button.

## Browser surfaces

`::selection` saffron wash, `caret-color` green, focus ring 3 px `--focus` with 2 px offset (saffron on the green masthead),
thin scrollbars in `--line`/`--muted`, `font-variant-numeric: tabular-nums` on every amount.
