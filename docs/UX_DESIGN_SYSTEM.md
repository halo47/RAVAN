# UX & DESIGN SYSTEM — RAVAN

## 1. Design Direction

**Modern Glassmorphism — Clean, Premium, Professional**
- **Clarity Over Decoration:** Every screen prioritizes operational legibility, scannable financial figures, and clear status hierarchy over decorative clutter.
- **Single-Elevation Discipline:** Containers use a flat surface or subtle single-layer translucent panel (`rgba(20, 36, 56, 0.82)` with `1px solid rgba(170, 183, 199, 0.14)`). Cards are never nested inside cards.

---

## 2. Color Tokens

| Token Name | Hex / Value | Usage |
| :--- | :--- | :--- |
| `--bg-canvas` | `#0A101A` | Primary application background (60% dominant canvas) |
| `--bg-panel` | `#142438` | Structural workspace panels, sidebar, table headers (30% surface) |
| `--accent-blue` | `#547DA8` | Secondary interactive states, borders, structural highlights |
| `--accent-gold` | `#C8A76A` | High-intent primary CTAs, active navigation markers (10% accent budget) |
| `--text-primary` | `#F4F7FB` | Primary headings, body copy, and table data (WCAG AA compliant) |
| `--text-secondary` | `#AAB7C7` | Secondary labels, captions, and metadata separators |
| Semantic Nominal | `#16A34A` | Approved / Active / Completed (always paired with text + icon) |
| Semantic Warning | `#D97706` | Pending / Trialing / Low Seats (always paired with text + icon) |
| Semantic Danger | `#DC2626` | Cancelled / Rejected / Suspended / Overdue |

---

## 3. Typography & Directionality

- **Kurdish (`ku`) & Arabic (`ar`) — RTL:** `Vazirmatn` (400, 500, 600, 700) for clear, high-legibility Arabic/Kurdish script rendering.
- **English (`en`) — LTR:** `Plus Jakarta Sans` (400, 500, 600, 700).
- **Numerals, Codes, Timestamps & Money:** `JetBrains Mono` with `font-variant-numeric: tabular-nums` so all `IQD` and `USD` amounts, booking codes, and capacity counters align vertically in tables.

---

## 4. Mandatory Component States

Every screen and data view in RAVAN implements:
1. **Loading State:** Skeleton rows matching table geometry.
2. **Empty State:** Domain explanation + direct primary CTA button (e.g., "Create First Trip").
3. **Error State:** Clear, sanitized message with a retry button.
4. **Permission-Aware Controls:** Action buttons automatically disable or explain required permissions when the active member role lacks a specific permission (e.g., `tour_guide` viewing Finance or Trip creation).
