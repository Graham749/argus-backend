const { query } = require('../lib/db');

let _cache = null;
let _cacheTs = 0;
const CACHE_TTL = 15 * 60 * 1000;

const SW_ORDER  = ['Chronos', 'Amun', 'Origin', 'Lumus', 'Solaris'];
const SUB_ORDER = ['PRMF', 'Flex', 'Granular Data', 'Grid', 'Non-Standard'];
const MKT_PALETTE = [
  '#1e40af','#854d0e','#166534','#6b21a8','#0f766e','#b45309',
  '#9f1239','#1d4ed8','#065f46','#7c3aed','#c2410c','#047857',
];

const TARGETS = {
  'France:Amun': 245.0,    'France:Lumus': 12.1,    'France:Origin': 97.9,
  'France:Solaris': 34.0,  'France:Chronos': 0.0,
  'Iberia:Amun': 216.5,    'Iberia:Chronos': 1020.0, 'Iberia:Lumus': 17.8,
  'Iberia:Origin': 270.7,  'Iberia:Solaris': 54.8,
  'Italy:Amun': 45.8,      'Italy:Chronos': 734.7,  'Italy:Lumus': 36.4,
  'Italy:Origin': 154.2,   'Italy:Solaris': 0.0,
};

function mapSw(name) {
  if (!name) return null;
  const u = name.toUpperCase();
  if (u.includes('CHRONOS')) return 'Chronos';
  if (u.includes('AMUN'))    return 'Amun';
  if (u.includes('ORIGIN'))  return 'Origin';
  if (u.includes('LUMUS'))   return 'Lumus';
  if (u.includes('SOLARIS')) return 'Solaris';
  return null;
}

function mapSub(name) {
  if (!name) return null;
  const u = name.toUpperCase();
  if (u.includes('POWER & RENEWABLES'))                    return 'PRMF';
  if (u.includes('FLEXIBLE ENERGY'))                       return 'Flex';
  if (u.includes('GRANULAR DATA') && !u.includes('POWER')) return 'Granular Data';
  if (u.includes('GRID'))                                  return 'Grid';
  if (u.includes('NON-STANDARD'))                          return 'Non-Standard';
  return null;
}

function kEur(eur) { return Math.round((eur / 1000) * 10) / 10; }

function process(rows) {
  const TODAY  = new Date();
  const THREE_M = new Date(TODAY); THREE_M.setMonth(THREE_M.getMonth() + 3);
  const SIX_M   = new Date(TODAY); SIX_M.setMonth(SIX_M.getMonth() + 6);

  const active   = rows.filter(r => r.stage === 'Active');
  const tip      = rows.filter(r => r.stage === 'Termination in Progress');
  const activeSw = active.filter(r => mapSw(r.product_name));

  // ── ARR snapshot: account × market × sw ──────────────────────────────────
  const swSnap = {};
  for (const r of activeSw) {
    const sw  = mapSw(r.product_name);
    const key = `${r.account}||${r.market}||${sw}`;
    if (!swSnap[key]) swSnap[key] = {
      account: r.account,
      parent:  r.top_account !== r.account ? r.top_account : null,
      market:  r.market,
      sw, arr: 0,
    };
    swSnap[key].arr += (r.arr_eur || 0);
  }
  const swSnapList = Object.values(swSnap);

  // ── Derive regions from data + any with defined targets ───────────────────
  const regionSet = new Set(swSnapList.map(r => r.market));
  Object.keys(TARGETS).forEach(k => regionSet.add(k.split(':')[0]));
  const allRegions = [...regionSet].sort();
  const mktCol = Object.fromEntries(allRegions.map((m, i) => [m, MKT_PALETTE[i % MKT_PALETTE.length]]));

  // ── ARR vs target ─────────────────────────────────────────────────────────
  const swOrd = Object.fromEntries(SW_ORDER.map((s, i) => [s, i]));

  // All (market, sw) pairs: ones with actual data + ones with defined targets
  const pairSet = new Set();
  swSnapList.forEach(r => pairSet.add(`${r.market}:${r.sw}`));
  Object.keys(TARGETS).forEach(k => pairSet.add(k));

  const arr_vs_target = [...pairSet].map(key => {
    const [mkt, sw_name] = key.split(':');
    const tgt     = TARGETS[key] !== undefined ? TARGETS[key] : null;
    const matching = swSnapList.filter(r => r.market === mkt && r.sw === sw_name);
    const totalEur  = matching.reduce((s, r) => s + r.arr, 0);
    const byAcct = {};
    matching.forEach(r => { byAcct[r.account] = (byAcct[r.account] || 0) + r.arr; });
    const top_clients = Object.entries(byAcct)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, arr]) => ({ name, arr_k: kEur(arr) }));
    return {
      market: mkt, sw: sw_name,
      actual_k: kEur(totalEur),
      target_k: tgt !== null ? tgt : 0,
      no_target: tgt === null || tgt === 0.0,
      client_count: matching.length,
      top_clients,
    };
  }).sort((a, b) => a.market.localeCompare(b.market) || swOrd[a.sw] - swOrd[b.sw]);

  // ── Region summary ────────────────────────────────────────────────────────
  const region_summary = allRegions.map(mkt => {
    const rs   = arr_vs_target.filter(r => r.market === mkt);
    const at   = rs.reduce((s, r) => s + r.actual_k, 0);
    const tt   = rs.filter(r => !r.no_target).reduce((s, r) => s + r.target_k, 0);
    const pct  = tt > 0 ? Math.round(at / tt * 1000) / 10 : null;
    const above   = rs.filter(r => r.actual_k > 0 && (r.no_target || r.actual_k >= r.target_k)).map(r => r.sw);
    const below80 = rs
      .filter(r => !r.no_target && r.target_k > 0 && r.actual_k / r.target_k < 0.8)
      .map(r => ({ sw: r.sw, pct: Math.round(r.actual_k / r.target_k * 100) }));
    return { market: mkt, arr_k: Math.round(at * 10) / 10, target_k: Math.round(tt * 10) / 10, pct, above, below80 };
  });

  // ── Terminations in progress ──────────────────────────────────────────────
  const tipCombos = {};
  for (const r of tip) {
    const sw = mapSw(r.product_name);
    if (!sw) continue;
    const key = `${r.account}||${r.market}||${sw}`;
    if (!tipCombos[key]) tipCombos[key] = {
      account: r.account, market: r.market, sw,
      parent:  r.top_account !== r.account ? r.top_account : null,
      termination_reason: r.termination_reason,
      arr_k: 0,
    };
  }
  for (const r of Object.values(tipCombos)) {
    const snap = swSnapList.find(s => s.account === r.account && s.market === r.market && s.sw === r.sw);
    r.arr_k = snap ? kEur(snap.arr) : 0;
  }
  const termination_in_progress = Object.values(tipCombos).sort((a, b) => b.arr_k - a.arr_k);
  const termination_count = new Set(Object.values(tipCombos).map(r => r.account)).size;
  const tipSet = new Set(Object.keys(tipCombos));

  // ── Renewals ──────────────────────────────────────────────────────────────
  const renewals_due = [];
  for (const r of activeSw) {
    if (!r.end_date) continue;
    const endDate = new Date(r.end_date);
    if (endDate < TODAY || endDate > SIX_M) continue;
    const sw = mapSw(r.product_name);
    renewals_due.push({
      account: r.account, market: r.market, sw,
      end_date: r.end_date,
      arr_k: kEur(r.arr_eur || 0),
      extension: r.contract_extension_negotiated === 'true' ? 'Yes' : 'No',
      renewal_badge: endDate <= THREE_M ? '3M' : '6M',
      parent: r.top_account !== r.account ? r.top_account : null,
    });
  }
  renewals_due.sort((a, b) => b.arr_k - a.arr_k);
  const renewals_3m_count = new Set(renewals_due.filter(r => r.renewal_badge === '3M').map(r => r.account)).size;
  const renewals_6m_count = new Set(renewals_due.map(r => r.account)).size;

  const renewMap = {};
  renewals_due.forEach(r => {
    renewMap[`${r.account}||${r.market}||${r.sw}`] = { badge: r.renewal_badge, end_date: r.end_date };
  });

  // ── Client matrix (Account view) ──────────────────────────────────────────
  const records = {};
  for (const r of swSnapList) {
    const key = `${r.account}||${r.market}`;
    if (!records[key]) records[key] = {
      account: r.account, parent: r.parent, market: r.market,
      sw_lines: [], arr_k: 0,
    };
    const tipKey = `${r.account}||${r.market}||${r.sw}`;
    const rb = renewMap[tipKey];
    records[key].sw_lines.push({
      sw: r.sw,
      arr_k: kEur(r.arr),
      terminating:   tipSet.has(tipKey),
      renewal_badge: rb ? rb.badge    : null,
      end_date:      rb ? rb.end_date : null,
    });
    records[key].arr_k += r.arr / 1000;
  }

  const clients = Object.values(records).map(rec => {
    rec.sw_lines.sort((a, b) => SW_ORDER.indexOf(a.sw) - SW_ORDER.indexOf(b.sw));
    rec.arr_k    = Math.round(rec.arr_k * 10) / 10;
    rec.products = rec.sw_lines.map(l => l.sw);
    return {
      ...rec,
      total_runs:       null,
      runs_90d:         null,
      days_since_run:   null,
      arr_yoy:          null,
      movement:         'same',
      flag_no_recent_use: false,
      flag_upsell:      rec.sw_lines.length === 1 && rec.arr_k > 20,
      flag_terminating: rec.sw_lines.some(l => l.terminating),
      flag_renewal:     rec.sw_lines.some(l => l.renewal_badge),
    };
  }).sort((a, b) => b.arr_k - a.arr_k);

  // ── Client list (full subscription view) ──────────────────────────────────
  const clMap = {};
  for (const r of active) {
    const sw  = mapSw(r.product_name);
    const sub = mapSub(r.product_name);
    if (!sw && !sub) continue;
    const key = `${r.account}||${r.market}`;
    if (!clMap[key]) clMap[key] = {
      account: r.account, parent: r.top_account !== r.account ? r.top_account : null,
      market: r.market, tier: r.tier,
      sw_products: new Set(), sub_products: new Set(),
      sw_arr_k: 0, sub_arr_k: 0,
    };
    if (sw)  { clMap[key].sw_products.add(sw);  clMap[key].sw_arr_k  += (r.arr_eur || 0) / 1000; }
    if (sub) { clMap[key].sub_products.add(sub); clMap[key].sub_arr_k += (r.arr_eur || 0) / 1000; }
  }
  const client_list = Object.values(clMap)
    .map(r => ({
      account: r.account, parent: r.parent, market: r.market, tier: r.tier,
      sw_products:  [...r.sw_products].sort((a, b) => SW_ORDER.indexOf(a)  - SW_ORDER.indexOf(b)),
      sw_arr_k:  Math.round(r.sw_arr_k  * 10) / 10,
      sub_products: [...r.sub_products].sort((a, b) => SUB_ORDER.indexOf(a) - SUB_ORDER.indexOf(b)),
      sub_arr_k: Math.round(r.sub_arr_k * 10) / 10,
    }))
    .sort((a, b) => (b.sw_arr_k + b.sub_arr_k) - (a.sw_arr_k + a.sub_arr_k));

  return {
    regions: allRegions,
    mkt_col: mktCol,
    arr_as_of:    new Date().toISOString().slice(0, 7),
    usage_as_of:  'TBC',
    arr_vs_target,
    region_summary,
    arr_trend:    [],  // TBC — requires historical monthly snapshots
    clients,
    client_list,
    dormant_detail:      [],   // TBC — requires Software Health data
    dormant_client_count: 0,   // TBC
    termination_in_progress,
    renewals_due,
    renewals_3m_count,
    renewals_6m_count,
    termination_count,
  };
}

async function handler(req, res) {
  try {
    if (_cache && Date.now() - _cacheTs < CACHE_TTL) return res.json(_cache);

    const rows = await query(`
      SELECT
        subscription_id, top_account, account, market, tier,
        product_name, stage, currency,
        CAST(arr_native AS float) AS arr_native,
        CAST(arr_eur    AS float) AS arr_eur,
        CONVERT(varchar(10), end_date,     120) AS end_date,
        CONVERT(varchar(10), renewal_date, 120) AS renewal_date,
        termination_reason,
        contract_extension_negotiated
      FROM dbo.gold_sf_sw_subscriptions
    `);

    const data = process(rows);
    _cache  = data;
    _cacheTs = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[sw-intelligence] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
