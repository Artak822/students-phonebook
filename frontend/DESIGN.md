---
title: АСПиРС CRM
register: product
colorStrategy: restrained
themeScene: "Сотрудник общежития за ноутбуком в светлом офисе, дневной свет, множество вкладок. Светлая тема единственный ответ."
version: "2.0"
source: "Extracted from Sirius University LKS (lks.siriusuniversity.ru) HTML"
---

## Color

**Strategy:** Restrained — indigo accent on ≤10% of surface. Everything else white and neutral with subtle indigo tint.

**Base palette (OKLCH equivalents of Sirius Tailwind tokens):**

| Token | OKLCH | Hex origin | Usage |
|---|---|---|---|
| `--bg` | `oklch(96.8% 0.007 264)` | `#EBF4FF` indigo-50 | Page background |
| `--surface` | `oklch(100% 0 0)` | `#FFFFFF` | Panels, sidebar, cards |
| `--surface-muted` | `oklch(97.5% 0.006 264)` | `#F5F8FF` | Zebra rows, secondary surfaces |
| `--border` | `oklch(91.5% 0.008 264)` | `#E5E7EB` gray-200 | Default borders |
| `--border-focus` | `oklch(50.5% 0.230 264)` | `#4F46E5` indigo-600 | Focus rings |
| `--border-error` | `oklch(72.0% 0.120 27)` | — | Error borders |
| `--accent` | `oklch(50.5% 0.230 264)` | `#4F46E5` indigo-600 | Primary buttons, active state |
| `--accent-hover` | `oklch(45.0% 0.230 264)` | `#4338CA` indigo-700 | Hover on accent |
| `--accent-bg` | `oklch(93.5% 0.025 264)` | `#E0E7FF` indigo-100 | Active nav item bg, tinted bg |
| `--accent-text` | `oklch(50.5% 0.230 264)` | `#4F46E5` indigo-600 | Active nav text, links |
| `--text-primary` | `oklch(20.0% 0.012 260)` | `#111827` gray-900 | Main headings, labels |
| `--text-secondary` | `oklch(40.0% 0.014 260)` | `#4B5563` gray-600 | Secondary text |
| `--text-muted` | `oklch(52.0% 0.012 260)` | `#6B7280` gray-500 | Placeholders, captions |
| `--text-on-accent` | `oklch(100% 0 0)` | `#FFFFFF` | Text on indigo buttons |
| `--error` | `oklch(52.0% 0.210 27)` | — | Error messages |
| `--error-bg` | `oklch(97.0% 0.018 27)` | — | Error backgrounds |

**Shadow system:**
- Panels/sidebar: `0 1px 3px oklch(0% 0 0 / 0.08), 0 1px 2px oklch(0% 0 0 / 0.05)` — the Sirius "shadow" utility
- Elevated (dialogs): `0 4px 24px oklch(0% 0 0 / 0.12)`

## Typography

**Font:** Open Sans, subsets latin + cyrillic, weights 400/500/600/700.

```css
--font-open-sans: "Open Sans", ui-sans-serif, system-ui, sans-serif;
body { font-family: var(--font-open-sans); }
```

**Scale:**
- Page title: 18px / 600 / letter-spacing -0.02em
- Panel heading: 16px / 600 / letter-spacing -0.01em
- Table header: 11.5px / 500 / uppercase / letter-spacing 0.05em / `--text-muted`
- Body / table cell: 13.5px / 400 / `--text-primary`
- Meta / caption: 12–13px / 400 / `--text-muted`

Line-length cap on readable prose: 65–75ch.

## Elevation

Three tiers:

| Tier | Where | Recipe |
|---|---|---|
| 0 | Page bg | `--bg` flat, no shadow |
| 1 | Sidebar, panels, table wrap | `background: var(--surface); border-radius: 16px; box-shadow: 0 1px 3px oklch(0% 0 0/0.08), 0 1px 2px oklch(0% 0 0/0.05)` |
| 2 | Dialogs, dropdowns | `border-radius: 12px; box-shadow: 0 4px 24px oklch(0% 0 0/0.12)` |

Side panels (drawers) stay flat with `border-left` like the current design — they're not cards.

## Layout

- **Page padding:** `40px 40px` desktop
- **Sidebar width:** `240px` — slightly wider than current 220px for breathing room with rounded card
- **Sidebar shape:** floating card — `border-radius: 16px`, `margin: 12px 0 12px 12px`, `height: calc(100vh - 24px)`, `position: sticky`, `top: 12px`
- **Content area:** `min-width: 0; padding: 24px 32px`
- **Table row height:** 46px
- **Form panel width:** 440px

**Grid rhythm:** 4px base unit. Gaps in 4px steps (8, 12, 16, 24, 32, 40).

## Components

### Navigation item (sidebar)
```
height: 36px
padding: 0 12px
border-radius: 8px
font-size: 13.5px / weight 450
default: color --text-secondary, bg transparent
hover: bg oklch(97% 0.010 264), color --text-primary
active: bg --accent-bg (indigo-100), color --accent-text (indigo-600), weight 500
```
Active icon: `color: --accent-text`

### Buttons
```
Primary: bg --accent, color --text-on-accent, height 34px, border-radius 6px, px 14px, font-size 13.5px/500
Ghost: bg transparent, border 1px --border, color --text-primary, same sizing
Danger ghost: border --border-error, color --error
Icon button: 28×28px, border-radius 6px, bg transparent, color --text-muted
  hover: bg --surface-muted, color --text-secondary
  danger hover: bg --error-bg, color --error
```

### Form inputs
```
height: 36px
border: 1px solid --border
border-radius: 6px
focus: border --border-focus, box-shadow 0 0 0 3px oklch(50.5% 0.230 264 / 0.12)
font-size: 14px
```

### Table
```
wrap: bg --surface, border-radius 12px, border 1px --border, overflow hidden
header row: height 38px, font 11.5px/500 uppercase, color --text-muted
body row: height 46px, font 13.5px, border-bottom 1px --border
row hover: bg --surface-muted
last row: no border-bottom
```

### Badges / status pills
```
Inline text status with color coding — no pills unless width justifies it.
```

## Motion

Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quint) for panels/dialogs.  
Duration: 150ms fade, 200ms slide. No bounce. No elastic.

Sidebar nav transitions: `background 0.12s ease, color 0.12s ease`.
