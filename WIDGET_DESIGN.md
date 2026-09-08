# Argus Widget Design & Interaction Spec

This document is the ground truth for all health-card widgets in `Argus.dc.html`. Every new widget must follow these patterns exactly. Do not drift.

---

## Visual language

| Token | Value |
|---|---|
| Brand teal | `#288184` |
| Brand teal light bg | `#e6f4f4` |
| Body text | `#3c3c3b` |
| Secondary text | `#6d6d6c` |
| Muted text | `#9d9d9d` |
| Border | `#e6e6e5` |
| Surface bg | `#f7f7f6` |
| Track bg | `#f0f0ef` |
| Font stack | `Lato, Helvetica Neue, Arial, sans-serif` |
| Card radius | `12px` |
| Card shadow | `0 1px 3px rgba(60,60,59,0.07)` |
| Card padding | `20px` |
| Card margin-bottom | `8px` |

---

## Card anatomy

Every card follows this top-to-bottom structure:

```
[Header]        icon tile + title + live dot + chevron
[Compact badge] hc-compact — shown when card is collapsed
[Body]          everything below the header
  [Loading]     italic spinner text
  [No-data]     grey pill
  [Chart row]   ALWAYS VISIBLE — never hidden by drill
  [Summary]     filter pills / stat tiles / metadata
  [Drill panel] appears BELOW chart+summary, hidden by default
```

The chart row and summary NEVER hide. The drill panel is a separate element that appears below.

---

## Bar chart (SF-style, two-pass render)

The bar chart must match the Salesforce renewal timeline style:

- **Never** use `preserveAspectRatio="none"` — text stretches
- **Always** use two-pass render: inject an empty `<div id="...Chart">` in HTML, then call `renderBarChart(id, pts, color)` inside `requestAnimationFrame` so `offsetWidth` is real
- Track background: `#f0f0ef`, `rx:2` behind every bar column
- Bar fill: brand color, `opacity:0.88`, `rx:2`; hover → `opacity:1`
- Count label above bar: `font-size:7`, `fill:#6d6d6c`
- Month label below: `font-size:7`, `fill:#9d9d9d`; abbreviated (`'25` for Jan, `3` for Mar, etc.)
- Label density: every 1 month if ≤12 pts, every 2 if ≤18, every 3 if >18
- Height: `88px` standard (Engagement Pulse compact can use same)
- Clickable chart wrapper: `onclick="window.xyzToggleDrill('type')"`, `cursor:pointer`, `border-radius:6px`, `background:#f7f7f6`, `padding:6px 6px 2px`
- Hint text below chart: `"Click to expand detail"`, `font-size:9px`, `color:#b8b8b6`

```javascript
// Standard renderBarChart signature:
var renderBarChart = function(mountId, pts, color) { ... }
// pts: [{v: Number, label: 'YYYY-MM'}, ...]
```

---

## Filter controls

### Button filters (categorical — e.g. product type)

- Placed in a flex row above the chart, `margin-left:auto` to right-align
- Style: `padding:4px 9px; border-radius:5px; border:1px solid; font-size:10px; font-weight:600`
- Active: `background:#288184; color:#fff; border-color:#288184`
- Inactive: `background:#f0f0ef; color:#3c3c3b; border-color:#d0d0d0`
- Transition: `background .12s, color .12s`

### Dropdown filter (many options — e.g. product list)

- `font-size:10px; padding:4px 8px; border-radius:5px; border:1px solid #d0d0d0; background:#f0f0ef; color:#3c3c3b`
- Always include "All products" / "All" as first option

### Filter behaviour — MANDATORY

Filters must update **both** the bar chart AND the drill table:

```javascript
window.xyzFilter = function(value) {
  // 1. Update button/dropdown visual state
  // 2. Filter drill rows
  var rows = value === 'All' ? allRows : allRows.filter(r => r.field === value);
  // 3. Re-render bar chart
  //    - 'All' → use full API trend data (window.__xyzPts)
  //    - filtered → derive pts from filtered drill rows (drillToPts)
  renderBarChart('xyzChart', value === 'All' ? window.__xyzPts : drillToPts(rows), color);
  // 4. Re-render drill table body
  renderDrillRows('Xyz', rows);
};

// Derive monthly pts from drill rows (for filtered chart)
var drillToPts = function(rows) {
  var byMonth = {};
  rows.forEach(r => { var m = r.date.slice(0,7); byMonth[m] = (byMonth[m]||0)+1; });
  return Object.keys(byMonth).sort().map(m => ({v: byMonth[m], label: m}));
};
```

Note: when filtering from drill rows (max 100), the chart only reflects those 100 rows. This is acceptable and consistent — the table and chart always show the same data slice.

---

## Drill panel

The drill panel appears **below** the chart. The chart is never hidden.

```
[Chart wrapper — always visible]
[Hint text]
[Drill panel — hidden by default]
  [Drill header: ← Collapse button + title]
  [Table: sticky thead, scrollable tbody max-height:360px]
```

### Collapse button

```css
padding:4px 10px; border-radius:5px; border:1px solid #e6e6e5;
background:#fff; color:#288184; font-size:11px; font-weight:700; cursor:pointer
```

Text: `← Collapse`

### Toggle function

```javascript
window.xyzToggleDrill = function(type) {
  var el = document.getElementById('xyz'+cap(type)+'Drill');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};
```

### Table style

- `border:1px solid #e6e6e5; border-radius:8px; overflow:hidden`
- `thead`: `position:sticky; top:0; background:#f7f7f6; z-index:1; border-bottom:1px solid #e6e6e5`
- `th`: `padding:8px 10px; font-size:11px; font-weight:700; color:#3c3c3b`
- `td`: `padding:7px 10px; font-size:11px`; truncate long strings with `max-width + text-overflow:ellipsis`
- Row separator: `border-bottom:1px solid #f0f0ef`
- Status cells: green `#2e7d32` / amber `#c2600f` / grey `#6d6d6c`

---

## Card header

```html
<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;cursor:pointer;user-select:none;" onclick="[toggle body]">
  <!-- Icon tile -->
  <div style="width:44px;height:44px;flex-shrink:0;background:#e6f4f4;border-radius:8px;
               display:flex;align-items:center;justify-content:center;">
    <svg .../>
  </div>
  <!-- Title + subtitle -->
  <div style="flex:1;">
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="font-size:13px;font-weight:700;">[Title]</div>
      <div style="font-size:10px;color:#00be86;font-weight:600;">●Live data</div>
    </div>
    <div id="xyzSubtitle" style="font-size:11px;color:#9d9d9d;margin-top:2px;">[Subtitle]</div>
  </div>
  <span id="xyzChev" style="font-size:16px;color:#9d9d9d;flex-shrink:0;margin-left:8px;">▾</span>
</div>
```

---

## Which widget does what

| Widget | Chart type | Filter → chart? | Filter → drill? | Drill trigger |
|---|---|---|---|---|
| **Salesforce** (`#sfCard`) | SVG stacked bar (18mo renewals) | Yes — filter buttons hide/show risk cards; chart re-renders | Yes | Click a bar month |
| **Zendesk** (`#zdTicketsCard`) | Mini sparklines in stat tiles | No chart filter | N/A | Click stat tile → shows table below |
| **PostHog** (`#phInsightsCard`) | EVENT TREND area chart | No — chart always shows full | N/A | Click stat tile → drill view below |
| **Engagement History** (`#eosEngCard`) | Full-width bar (24mo) | **Yes** — button/dropdown updates chart + drill | **Yes** | Click chart wrapper → drill below |
| **Engagement Pulse** (`#epCard`) | Full-width bar (read-only) | No | No | None — visual only |

---

## Engagement Pulse bar charts

The EP card shows the same runs/downloads bar charts as **visual-only** trend indicators (no drill, no filter). They are injected into `#eosEpTrends` by `fetchEosEngagement`. Each chart is a full-width row:

```
[Row label + total 3m]
[Full-width bar chart, same renderBarChart function]
```

EP charts are not clickable. The full interactive experience lives in Engagement History.

---

## Adding a new widget — checklist

1. Follow card anatomy: header + compact + body (loading / no-data / chart / summary / drill)
2. Chart: always two-pass (inject mount div → `requestAnimationFrame` → `renderBarChart`)
3. Filters: always update **both** chart and drill (not just one)
4. Drill toggle: chart stays visible; drill panel slides in below
5. Collapse button text: `← Collapse` (not "Back to Summary" — that implies chart hides)
6. Table: sticky thead, `max-height:360px`, scrollable tbody
7. Store full API data in `window.__widgetPts`; derive filtered pts via `drillToPts(filteredRows)`
8. Commit after every change. Push every 1–2 hours.
