# Probis 2.0 Theme System

## Direction

Probis 2.0 uses a light theme by default with a carefully matched dark mode.
The visual language should feel calm, current, and research-oriented:

- Crisp white or near-white surfaces.
- Restrained borders.
- Strong typography hierarchy.
- Limited use of saturated color.
- Outcome colors used consistently.
- Compact spacing without visual crowding.

Avoid:

- Dark terminal styling as the default.
- Blue-gray monotony.
- Purple-heavy gradients.
- Decorative glow effects.
- Excessive pills and rounded containers.
- Marketing-style visual composition inside the product.

## Theme Modes

### Light Theme

Light theme is the default for first visit.

| Token | Suggested value | Use |
| --- | --- | --- |
| `background` | `#F8FAFC` | Application background |
| `surface` | `#FFFFFF` | Primary content surfaces |
| `surface-subtle` | `#F1F5F9` | Toolbars, muted bands |
| `foreground` | `#111827` | Primary text |
| `foreground-muted` | `#64748B` | Secondary labels |
| `border` | `#E2E8F0` | Dividers and controls |
| `border-strong` | `#CBD5E1` | Active boundaries |
| `focus-ring` | `#2563EB` | Accessible focus |

### Dark Theme

Dark mode should preserve contrast and hierarchy without becoming a wall of
slate.

| Token | Suggested value | Use |
| --- | --- | --- |
| `background` | `#0B1020` | Application background |
| `surface` | `#111827` | Primary content surfaces |
| `surface-subtle` | `#172033` | Toolbars, muted bands |
| `foreground` | `#F8FAFC` | Primary text |
| `foreground-muted` | `#94A3B8` | Secondary labels |
| `border` | `#24324A` | Dividers and controls |
| `border-strong` | `#334155` | Active boundaries |
| `focus-ring` | `#60A5FA` | Accessible focus |

## Outcome Colors

Outcome colors communicate market state, not success or failure.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `outcome-yes` | `#0F766E` | `#2DD4BF` | YES lines, bars, labels |
| `outcome-no` | `#BE123C` | `#FB7185` | NO lines, bars, labels |
| `outcome-alt-1` | `#2563EB` | `#60A5FA` | Ranked multi-outcome series |
| `outcome-alt-2` | `#7C3AED` | `#A78BFA` | Ranked multi-outcome series |
| `outcome-alt-3` | `#C2410C` | `#FB923C` | Ranked multi-outcome series |

YES and NO colors must remain distinguishable in both themes. Text labels are
always present; color never carries meaning alone.

## Semantic Colors

Semantic colors communicate interface state.

| Semantic | Light | Dark | Use |
| --- | --- | --- | --- |
| `success` | `#15803D` | `#4ADE80` | Completed action, healthy state |
| `warning` | `#B45309` | `#FBBF24` | Attention required |
| `danger` | `#B91C1C` | `#F87171` | Destructive action, error |
| `info` | `#1D4ED8` | `#60A5FA` | Informational emphasis |
| `neutral` | `#64748B` | `#94A3B8` | Ordinary status and metadata |

Lifecycle state mapping:

- Open: neutral or subtle success tint.
- Paused: warning.
- Closed: neutral.
- Resolved: info.
- Archived: muted neutral.

Do not use danger styling for a market merely because its probability moved
down.

## Chart Colors

Charts should remain analytical, not decorative.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `chart-grid` | `#E2E8F0` | `#24324A` | Subtle grid lines |
| `chart-axis` | `#94A3B8` | `#64748B` | Axis labels |
| `chart-tooltip-bg` | `#111827` | `#F8FAFC` | Tooltip background |
| `chart-tooltip-fg` | `#F8FAFC` | `#111827` | Tooltip text |
| `chart-volume` | `#2563EB` | `#60A5FA` | Volume bars |
| `chart-open-interest` | `#7C3AED` | `#A78BFA` | Open-interest line |

Probability charts use outcome colors. Area fills use low opacity.

## Typography

### Typeface

Use a modern system-first sans stack. Introduce a bundled font only if it
materially improves polish without adding loading friction.

Recommended stack:

```text
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Use a mono stack only for identifiers, compact numeric tables when useful, and
debug-adjacent values:

```text
"JetBrains Mono", "SFMono-Regular", Consolas, monospace
```

### Hierarchy

| Role | Size | Weight | Line height | Use |
| --- | ---: | ---: | ---: | --- |
| Display | `32px` | `700` | `40px` | Landing product name only |
| Page title | `24px` | `700` | `32px` | Explorer and category headings |
| Detail title | `22px` | `700` | `30px` | Market question |
| Section title | `16px` | `600` | `24px` | Research sections |
| Body | `14px` | `400` | `22px` | General reading |
| Compact body | `13px` | `400` | `20px` | Cards and rows |
| Label | `12px` | `600` | `16px` | Metric labels and badges |
| Micro | `11px` | `500` | `16px` | Timestamps and secondary metadata |

Rules:

- Letter spacing remains `0`.
- Do not scale font size with viewport width.
- Keep market questions readable through wrapping.
- Reserve display size for the product name, not ordinary dashboard headings.

## Spacing System

Base unit: `4px`.

| Token | Value | Typical use |
| --- | ---: | --- |
| `space-1` | `4px` | Tight icon gap |
| `space-2` | `8px` | Compact internal gap |
| `space-3` | `12px` | Card internal grouping |
| `space-4` | `16px` | Standard padding |
| `space-5` | `20px` | Section inner rhythm |
| `space-6` | `24px` | Desktop section gap |
| `space-8` | `32px` | Major section separation |
| `space-10` | `40px` | Landing section separation |

Desktop page gutters:

- Compact: `20px`.
- Standard: `24px`.
- Wide workspace: `32px`.

Mobile page gutters:

- Standard: `16px`.
- Tight table or chart edge: `12px` only when required.

## Shape And Elevation

Border radius:

- Small controls: `4px`.
- Cards and panels: `6px`.
- Modals and sheets: `8px`.
- Avoid oversized rounded rectangles.

Elevation:

- Prefer borders and background contrast.
- Use shadows sparingly for popovers, sheets, and sticky overlays.
- Page sections remain unframed.
- Do not place cards inside cards.

## Control Sizing

| Control | Desktop height | Mobile height |
| --- | ---: | ---: |
| Compact icon button | `32px` | `40px` |
| Standard button | `36px` | `44px` |
| Search input | `40px` | `44px` |
| Segmented control | `32px` | `40px` |
| Filter row | `36px` | `44px` |

Stable dimensions prevent metric changes, hover states, and labels from
shifting layout.

## Density Modes

The product should support two visual densities through composition:

- Comfortable: landing, grid cards, mobile.
- Dense: desktop explorer list, search results, outcome tables.

Do not introduce a global density preference until user behavior demonstrates
the need.

## Iconography

- Use Lucide icons.
- Use familiar icons for search, filters, sort, grid/list, theme, back,
  watchlist, and chart range tools.
- Icon-only buttons require tooltips.
- Avoid custom SVG icons when a familiar Lucide symbol exists.

## Theme Behavior

- First visit defaults to light mode.
- User choice persists locally when implemented.
- Optional system-mode support may be offered, but it should not override an
  explicit choice.
- Charts, tooltips, skeletons, empty states, and focus styles must be checked
  in both modes.

## Future Intelligence Color Rules

Future overlays use the semantic palette and remain subordinate to outcome
colors.

- Signals: semantic severity colors.
- Smart money: restrained info or accent treatment.
- Narratives: neutral category-like chips.
- Regimes: compact semantic badges.

Do not introduce a new saturated color family for every intelligence layer.
Market probability remains the visual anchor.

