---
name: widget-audit
description: Audit any Argus health-card widget for correct chart style, filter behaviour, drill interaction, and EP integration. Run this before reporting a widget complete.
---

You are auditing a widget in `public/Argus.dc.html` against the Argus design system. Read `WIDGET_DESIGN.md` first, then check each rule below. Report every violation. Fix anything you can fix directly; flag anything that needs a backend change.

## Checklist

### 1. Bar chart rendering (SF-style, two-pass)
- [ ] Chart mount is an **empty `<div id="...Chart">`** injected as HTML string — NOT an SVG string
- [ ] `renderBarChart(mountId, pts, color)` is called inside `requestAnimationFrame` AFTER `innerHTML` is set
- [ ] Uses `mount.offsetWidth || 500` for pixel-accurate width (not a fixed viewBox)
- [ ] Uses `createElementNS` to build SVG elements (same pattern as `renderRenewalTimeline` in `#sfCard`)
- [ ] Every column has a **track background** rect: `fill:'#f0f0ef'`, `rx:2`, full `BAR_AREA` height
- [ ] Bars: `opacity:0.88` default, `1` on hover; `rx:2`
- [ ] Count label above each bar: `font-size:7`, `fill:#6d6d6c`
- [ ] Month labels below: abbreviated (Jan → `'yy`, other months → number); `font-size:7`, `fill:#9d9d9d`
- [ ] Label density: every 1 month if ≤12 pts, every 2 if ≤18, every 3 if >18
- [ ] **Does NOT use `preserveAspectRatio="none"`** — text must not stretch

### 2. Filter → chart + drill (critical — most common violation)
- [ ] Filter buttons/dropdown update the **bar chart** (not just the drill table)
- [ ] Filter buttons/dropdown update the **drill table body**
- [ ] When 'All' selected: chart uses full API trend (`window.__widgetPts`)
- [ ] When a product filter is active: chart uses `drillToPts(filteredRows, window.__widgetPts)` — NOT raw `drillToPts(filteredRows)`
- [ ] `drillToPts` signature: `function(rows, fullPts)` — maps over `fullPts` and zeros months not in filtered set
- [ ] **Zero months still show as empty track columns** — they are NEVER dropped from the chart

```javascript
// CORRECT drillToPts
var drillToPts = function(rows, fullPts) {
  var byMonth = {};
  rows.forEach(function(r){ var m = r.date.slice(0,7); if (m) byMonth[m] = (byMonth[m]||0)+1; });
  return (fullPts||[]).map(function(p){ return { v: byMonth[p.label]||0, label: p.label }; });
};
// WRONG — drops zero months:
// return Object.keys(byMonth).sort().map(...)
```

### 3. Drill panel interaction
- [ ] Drill panel is a **separate div below the chart** — chart is NEVER hidden
- [ ] Drill panel starts `display:none`; toggled by clicking chart wrapper
- [ ] Chart wrapper: `onclick="window.xyzToggleDrill('type')"`, `cursor:pointer`
- [ ] Collapse button: `← Collapse` (not "← Back to Summary"); collapses drill only
- [ ] Table has `position:sticky; top:0` thead and `max-height:360px` scrollable tbody
- [ ] Toggle function caps/un-caps correctly: `'runs'` → `eosRunsDrill`, `'downloads'` → `eosDownloadsDrill`

### 4. Engagement Pulse integration (if widget provides EP charts)
- [ ] EP charts injected into `#eosEpTrends` inside `fetchEngagementTimeline` or `fetchEosEngagement`
- [ ] EP charts are **two separate full-width rows** (NOT a 2-column grid)
- [ ] Section label style **matches EP card**: `font-size:10px; font-weight:700; color:#6d6d6c; letter-spacing:0.04em; text-transform:uppercase`
- [ ] Chart mount has **NO outer box/background** (`background:#f7f7f6; border-radius; padding` are WRONG here)
- [ ] Mount div style: `width:100%` only — the chart renders directly into the card's space
- [ ] A thin `border-top:1px solid #f0f0ef` separator follows the last EP row before the main timeline
- [ ] EP charts are **read-only** (no onclick, no filter, no drill) — the full interactive experience is in the widget's own card

### 5. Card anatomy
- [ ] Chart row is **outside** any summary/drill toggle — it cannot be hidden
- [ ] `window.__widgetPts` stores full API trend data for chart reset after 'All' filter
- [ ] `window.__widgetDrill` stores drill rows for filter operations

## How to fix violations

- **Wrong drillToPts**: Replace `Object.keys(byMonth).sort().map(...)` return with `(fullPts||[]).map(p => ({v: byMonth[p.label]||0, label:p.label}))` and add `fullPts` param. Pass `window.__xyzPts` as second arg in filter functions.
- **Filter only updates drill**: Add `renderBarChart(...)` call alongside `renderDrillRows(...)` in filter functions.
- **Chart is SVG string (not two-pass)**: Replace with empty `<div id="...Chart">` in HTML, then `requestAnimationFrame(() => renderBarChart(...))` after `innerHTML` set.
- **EP charts have box styling**: Remove `background`, `border-radius`, `padding` from the mount div. Match the label style above.
- **EP charts in 2-col grid**: Switch to sequential `makeEpRow` calls, each full-width.

## Reference implementations
- **Bar chart renderer**: `renderBarChart` in `fetchEosEngagement` (~line 6095)
- **SF widget chart (gold standard)**: `renderRenewalTimeline` in `ArgusSubscriptions` class (~line 6740)
- **EP section label style**: `epCardHeader` — `font-size:12px; font-weight:700; color:#3c3c3b; letter-spacing:0.04em; text-transform:uppercase`
- **Filter → chart + drill**: `window.eosRunsFilter` in `fetchEosEngagement`
