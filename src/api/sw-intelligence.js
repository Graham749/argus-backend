const { query } = require('../lib/db');

const CACHE = {};
const CACHE_TS = {};
const CACHE_TTL = 15 * 60 * 1000;
const EUR_GBP_RATE = 0.8557;

const SW_ORDER  = ['Chronos', 'Amun', 'Origin', 'Lumus', 'Solaris'];
const MKT_PALETTE = [
  '#1e40af','#854d0e','#166534','#6b21a8','#0f766e','#b45309',
  '#9f1239','#1d4ed8','#065f46','#7c3aed','#c2410c','#047857',
];

// Targets in £k (will be GBP-converted from EUR base at EUR_GBP_RATE)
// Markets must match Energy_Market__c values from v_silver_sf_products
const TARGETS = {
  'France:Amun': 245.0,    'France:Lumus': 12.1,    'France:Origin': 97.9,
  'France:Solaris': 34.0,  'France:Chronos': 0.0,
  'Iberia:Amun': 216.5,    'Iberia:Chronos': 1020.0, 'Iberia:Lumus': 17.8,
  'Iberia:Origin': 270.7,  'Iberia:Solaris': 54.8,
  'Italy:Amun': 45.8,      'Italy:Chronos': 734.7,  'Italy:Lumus': 36.4,
  'Italy:Origin': 154.2,   'Italy:Solaris': 0.0,
};

function kGbp(v) { return Math.round((v / 1000) * 10) / 10; }

function getTargets() {
  const t = {};
  Object.keys(TARGETS).forEach(k => {
    t[k] = Math.round(TARGETS[k] * EUR_GBP_RATE * 10) / 10;
  });
  return t;
}

function process(rows) {
  const arrF = r => r.arr_gbp || 0;
  const T = getTargets();
  const TODAY  = new Date();
  const THREE_M = new Date(TODAY); THREE_M.setMonth(THREE_M.getMonth() + 3);
  const SIX_M   = new Date(TODAY); SIX_M.setMonth(SIX_M.getMonth() + 6);

  const active = rows.filter(r => r.stage === 'Active');
  const tip    = rows.filter(r => r.stage === 'Termination in Progress');

  // ── ARR snapshot: account × energy_market × service ──────────────────────
  const swSnap = {};
  for (const r of active) {
    if (!r.service || !r.market) continue;
    const key = `${r.account}||${r.market}||${r.service}`;
    if (!swSnap[key]) swSnap[key] = {
      account:        r.account,
      parent:         r.top_account !== r.account ? r.top_account : null,
      market:         r.market,
      region:         r.region,
      billing_market: r.billing_market,
      sw: r.service,
      arr: 0,
      count: 0,
    };
    swSnap[key].arr   += arrF(r);
    swSnap[key].count += 1;
  }
  const swSnapList = Object.values(swSnap);

  // ── Derive energy markets from data + any with defined targets ────────────
  const regionSet = new Set(swSnapList.map(r => r.market));
  Object.keys(T).forEach(k => regionSet.add(k.split(':')[0]));
  const allRegions = [...regionSet].filter(Boolean).sort();
  const mktCol = Object.fromEntries(
    allRegions.map((m, i) => [m, MKT_PALETTE[i % MKT_PALETTE.length]])
  );

  // ── ARR vs target ─────────────────────────────────────────────────────────
  const swOrd = Object.fromEntries(SW_ORDER.map((s, i) => [s, i]));
  const pairSet = new Set();
  swSnapList.forEach(r => pairSet.add(`${r.market}:${r.sw}`));
  Object.keys(T).forEach(k => pairSet.add(k));

  const arr_vs_target = [...pairSet].map(key => {
    const [mkt, sw_name] = key.split(':');
    const tgt      = T[key] !== undefined ? T[key] : null;
    const matching = swSnapList.filter(r => r.market === mkt && r.sw === sw_name);
    const totalGbp = matching.reduce((s, r) => s + r.arr, 0);
    const byAcct   = {};
    matching.forEach(r => { byAcct[r.account] = (byAcct[r.account] || 0) + r.arr; });
    const top_clients = Object.entries(byAcct)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, arr]) => ({ name, arr_k: kGbp(arr) }));
    return {
      market: mkt, sw: sw_name,
      actual_k: kGbp(totalGbp),
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
    return {
      market: mkt,
      arr_k: Math.round(at * 10) / 10,
      target_k: Math.round(tt * 10) / 10,
      pct, above, below80,
    };
  });

  // ── Terminations in progress ──────────────────────────────────────────────
  const tipCombos = {};
  const tipCountMap = {}; // subscription count per account||market||sw
  for (const r of tip) {
    if (!r.service || !r.market) continue;
    const key = `${r.account}||${r.market}||${r.service}`;
    if (!tipCombos[key]) tipCombos[key] = {
      account: r.account, market: r.market, sw: r.service,
      parent:  r.top_account !== r.account ? r.top_account : null,
      region:  r.region || '',
      billing_market: r.billing_market || '',
      termination_reason: r.termination_reason || null,
      arr_k: 0,
    };
    tipCountMap[key] = (tipCountMap[key] || 0) + 1;
  }
  for (const r of Object.values(tipCombos)) {
    const snap = swSnapList.find(s =>
      s.account === r.account && s.market === r.market && s.sw === r.sw
    );
    r.arr_k = snap ? kGbp(snap.arr) : 0;
  }
  const termination_in_progress = Object.values(tipCombos).sort((a, b) => b.arr_k - a.arr_k);
  const termination_count = new Set(Object.values(tipCombos).map(r => r.account)).size;
  // Total TIP subscription count (not unique accounts)
  const termination_sub_count = tip.filter(r => r.service && r.market).length;
  const tipSet = new Set(Object.keys(tipCombos));

  // ── Renewals ──────────────────────────────────────────────────────────────
  // allRenewals includes overdue so sw_lines carry end_date for health bucketing.
  // Active rows: include past-date as OVERDUE.
  // TIP rows with past end-date: also mark OVERDUE (termination date already passed).
  const allRenewals = [];
  for (const r of active) {
    const dateStr = r.end_date || r.renewal_date;
    if (!dateStr || !r.service || !r.market) continue;
    const endDate = new Date(dateStr);
    if (endDate > SIX_M) continue;
    const renewal_badge = endDate < TODAY ? 'OVERDUE' : (endDate <= THREE_M ? '3M' : '6M');
    allRenewals.push({
      account: r.account, market: r.market, billing_market: r.billing_market || '',
      sw: r.service, end_date: dateStr, arr_k: kGbp(arrF(r)),
      extension: 'No', renewal_badge,
      parent: r.top_account !== r.account ? r.top_account : null,
    });
  }
  // TIP subscriptions with past end-dates count as OVERDUE for health bucketing
  for (const r of tip) {
    const dateStr = r.end_date || r.renewal_date;
    if (!dateStr || !r.service || !r.market) continue;
    const endDate = new Date(dateStr);
    if (endDate >= TODAY) continue;
    allRenewals.push({
      account: r.account, market: r.market, billing_market: r.billing_market || '',
      sw: r.service, end_date: dateStr, arr_k: kGbp(arrF(r)),
      extension: 'No', renewal_badge: 'OVERDUE',
      parent: r.top_account !== r.account ? r.top_account : null,
    });
  }
  allRenewals.sort((a, b) => b.arr_k - a.arr_k);
  const renewals_due = allRenewals.filter(r => r.renewal_badge !== 'OVERDUE');
  const renewals_3m_count = new Set(renewals_due.filter(r => r.renewal_badge === '3M').map(r => r.account)).size;
  const renewals_6m_count = new Set(renewals_due.map(r => r.account)).size;

  const renewMap = {};
  const renewCountMap = {};
  allRenewals.forEach(r => {
    const rk = `${r.account}||${r.market}||${r.sw}`;
    renewMap[rk] = { badge: r.renewal_badge, end_date: r.end_date };
    renewCountMap[rk] = (renewCountMap[rk] || 0) + 1;
  });

  // ── Billing maps (keyed by account||billing_market||sw) ───────────────────
  const billingRenewMap = {}, billingRenewCountMap = {};
  allRenewals.forEach(r => {
    if (!r.billing_market) return;
    const rk = `${r.account}||${r.billing_market}||${r.sw}`;
    billingRenewMap[rk] = { badge: r.renewal_badge, end_date: r.end_date };
    billingRenewCountMap[rk] = (billingRenewCountMap[rk] || 0) + 1;
  });

  const billingTipCountMap2 = {}, billingTipSet2 = new Set();
  const billingTipParentMap = {};
  for (const r of tip) {
    if (!r.service || !r.billing_market) continue;
    const key = `${r.account}||${r.billing_market}||${r.service}`;
    billingTipCountMap2[key] = (billingTipCountMap2[key] || 0) + 1;
    billingTipSet2.add(key);
    if (!billingTipParentMap[`${r.account}||${r.billing_market}`])
      billingTipParentMap[`${r.account}||${r.billing_market}`] =
        r.top_account !== r.account ? r.top_account : null;
  }

  // ── Billing clients (all active SW subs, including null-energy-market) ────
  const billingRecs = {};
  for (const r of active) {
    if (!r.service || !r.billing_market) continue;
    const recKey = `${r.account}||${r.billing_market}`;
    if (!billingRecs[recKey]) billingRecs[recKey] = {
      account: r.account, parent: r.top_account !== r.account ? r.top_account : null,
      market: r.billing_market, billing_market: r.billing_market,
      sw_lines: {}, arr_k: 0,
    };
    const sw = r.service;
    const bKey = `${r.account}||${r.billing_market}||${sw}`;
    if (!billingRecs[recKey].sw_lines[sw]) billingRecs[recKey].sw_lines[sw] = {
      sw, arr_k: 0, sub_count: 0,
      tip_count:     billingTipCountMap2[bKey] || 0,
      renew_count:   billingRenewCountMap[bKey] || 0,
      terminating:   billingTipSet2.has(bKey),
      renewal_badge: billingRenewMap[bKey] ? billingRenewMap[bKey].badge : null,
      end_date:      billingRenewMap[bKey] ? billingRenewMap[bKey].end_date : null,
    };
    billingRecs[recKey].sw_lines[sw].arr_k += arrF(r) / 1000;
    billingRecs[recKey].sw_lines[sw].sub_count += 1;
    billingRecs[recKey].arr_k += arrF(r) / 1000;
  }
  // Inject TIP-only billing sw_lines
  for (const bKey of billingTipSet2) {
    const parts = bKey.split('||');
    const [acct, bMkt, sw] = parts;
    const recKey = `${acct}||${bMkt}`;
    if (!billingRecs[recKey]) billingRecs[recKey] = {
      account: acct, parent: billingTipParentMap[recKey] || null,
      market: bMkt, billing_market: bMkt,
      sw_lines: {}, arr_k: 0,
    };
    if (!billingRecs[recKey].sw_lines[sw]) {
      const rb = billingRenewMap[bKey];
      billingRecs[recKey].sw_lines[sw] = {
        sw, arr_k: 0, sub_count: 0,
        tip_count:     billingTipCountMap2[bKey] || 0,
        renew_count:   billingRenewCountMap[bKey] || 0,
        terminating:   true,
        renewal_badge: rb ? rb.badge : null,
        end_date:      rb ? rb.end_date : null,
      };
    }
  }
  const billing_clients = Object.values(billingRecs).map(rec => {
    const sw_lines = Object.values(rec.sw_lines)
      .sort((a, b) => SW_ORDER.indexOf(a.sw) - SW_ORDER.indexOf(b.sw));
    rec.arr_k = Math.round(rec.arr_k * 10) / 10;
    const products = sw_lines.map(l => l.sw);
    return {
      account: rec.account, parent: rec.parent,
      market: rec.market, billing_market: rec.billing_market,
      region: '', sw_lines, arr_k: rec.arr_k, products,
      flag_terminating: sw_lines.some(l => l.terminating),
      flag_renewal:     sw_lines.some(l => l.renewal_badge),
      flag_upsell:      products.length === 1 && rec.arr_k > 20,
    };
  }).sort((a, b) => b.arr_k - a.arr_k);

  // ── Client matrix (Account × Energy Market) ───────────────────────────────
  const records = {};
  for (const r of swSnapList) {
    const key = `${r.account}||${r.market}`;
    if (!records[key]) records[key] = {
      account:        r.account,
      parent:         r.parent,
      market:         r.market,
      region:         r.region,
      billing_market: r.billing_market,
      sw_lines: [], arr_k: 0,
    };
    const tipKey = `${r.account}||${r.market}||${r.sw}`;
    const rb = renewMap[tipKey];
    records[key].sw_lines.push({
      sw:            r.sw,
      energy_market: r.market,
      arr_k:         kGbp(r.arr),
      sub_count:     r.count || 0,
      tip_count:     tipCountMap[tipKey] || 0,
      renew_count:   renewCountMap[tipKey] || 0,
      terminating:   tipSet.has(tipKey),
      renewal_badge: rb ? rb.badge    : null,
      end_date:      rb ? rb.end_date : null,
    });
    records[key].arr_k += r.arr / 1000;
  }

  // Inject TIP-only sw_lines — accounts/products with no Active subscription
  // won't have a record or sw_line, making their TIP subs invisible to the frontend
  for (const [tipKey, td] of Object.entries(tipCombos)) {
    const recKey = `${td.account}||${td.market}`;
    if (!records[recKey]) {
      records[recKey] = {
        account: td.account, parent: td.parent,
        market:  td.market,  region: td.region,
        billing_market: td.billing_market,
        sw_lines: [], arr_k: 0,
      };
    }
    if (!records[recKey].sw_lines.find(l => l.sw === td.sw)) {
      const rb = renewMap[tipKey];
      records[recKey].sw_lines.push({
        sw:            td.sw,
        energy_market: td.market,
        arr_k:         0,
        sub_count:     0,
        tip_count:     tipCountMap[tipKey] || 0,
        renew_count:   renewCountMap[tipKey] || 0,
        terminating:   true,
        renewal_badge: rb ? rb.badge    : null,
        end_date:      rb ? rb.end_date : null,
      });
    }
  }

  const clients = Object.values(records).map(rec => {
    rec.sw_lines.sort((a, b) => SW_ORDER.indexOf(a.sw) - SW_ORDER.indexOf(b.sw));
    rec.arr_k    = Math.round(rec.arr_k * 10) / 10;
    rec.products = rec.sw_lines.map(l => l.sw);
    return {
      ...rec,
      total_runs:         null,
      runs_90d:           null,
      days_since_run:     null,
      arr_yoy:            null,
      movement:           'same',
      flag_no_recent_use: false,
      flag_upsell:        rec.sw_lines.length === 1 && rec.arr_k > 20,
      flag_terminating:   rec.sw_lines.some(l => l.terminating),
      flag_renewal:       rec.sw_lines.some(l => l.renewal_badge),
    };
  }).sort((a, b) => b.arr_k - a.arr_k);

  // ── Client list ───────────────────────────────────────────────────────────
  const clMap = {};
  for (const r of active) {
    if (!r.service || !r.market) continue;
    const key = `${r.account}||${r.market}`;
    if (!clMap[key]) clMap[key] = {
      account: r.account,
      parent:  r.top_account !== r.account ? r.top_account : null,
      market:  r.market, tier: r.tier,
      sw_products: new Set(), arr_k: 0,
    };
    clMap[key].sw_products.add(r.service);
    clMap[key].arr_k += arrF(r) / 1000;
  }
  const client_list = Object.values(clMap)
    .map(r => ({
      account: r.account, parent: r.parent, market: r.market, tier: r.tier,
      sw_products: [...r.sw_products].sort((a, b) => SW_ORDER.indexOf(a) - SW_ORDER.indexOf(b)),
      arr_k: Math.round(r.arr_k * 10) / 10,
    }))
    .sort((a, b) => b.arr_k - a.arr_k);

  const active_arr_k   = kGbp(active.reduce((s, r) => s + arrF(r), 0));
  const tip_arr_k      = kGbp(tip.reduce((s, r) => s + arrF(r), 0));
  const total_sub_count = rows.length;

  return {
    regions: allRegions,
    mkt_col: mktCol,
    region_map: Object.fromEntries(swSnapList.filter(r => r.market && r.region).map(r => [r.market, r.region])),
    currency: 'gbp',
    arr_as_of:    new Date().toISOString().slice(0, 7),
    usage_as_of:  'TBC',
    arr_vs_target,
    region_summary,
    arr_trend:           [],
    clients,
    client_list,
    dormant_detail:      [],
    dormant_client_count: 0,
    termination_in_progress,
    renewals_due,
    renewals_3m_count,
    renewals_6m_count,
    termination_count,
    termination_sub_count,
    active_arr_k,
    tip_arr_k,
    total_sub_count,
    billing_clients,
  };
}

async function handler(req, res) {
  const cacheKey = 'gbp';
  try {
    if (CACHE[cacheKey] && Date.now() - CACHE_TS[cacheKey] < CACHE_TTL) {
      return res.json(CACHE[cacheKey]);
    }

    const [rows, fxRows] = await Promise.all([
      query(`
      SELECT
        sub.subscription_id,
        COALESCE(sub.top_account, sub.account_name)          AS top_account,
        sub.account_name                                      AS account,
        COALESCE(sub.energy_market, '')                       AS market,
        COALESCE(sub.energy_region, '')                       AS region,
        COALESCE(sub.tier, '')                                AS tier,
        sub.product_name,
        COALESCE(sub.Service__c, '')                          AS service,
        sub.status                                            AS stage,
        sub.currency,
        CAST(sub.arr     AS float)                            AS arr_native,
        CAST(sub.arr_gbp AS float)                            AS arr_gbp,
        COALESCE(sub.market, '')                              AS billing_market,
        CONVERT(varchar(10), sub.subscription_end_date, 120)  AS end_date,
        CONVERT(varchar(10), sub.renewal_date,          120)  AS renewal_date,
        sub.termination_reason,
        sub.contract_extension_negotiated
      FROM dbo.gold_sf_subscriptions sub
      WHERE sub.Service_Type__c = 'Software'
        AND sub.status IN ('Active', 'Termination in Progress')
        AND COALESCE(sub.is_deleted, 0) = 0
        AND sub.arr > 0
        AND (sub.status = 'Active' OR sub.renewal_date >= GETDATE())
    `),
      query(`SELECT currency_iso_code, CAST(1.0 / gbp_rate AS float) AS gbp_to_ccy FROM dbo.v_silver_lookup_fxrates`),
    ]);

    // fx_rates: GBP→currency multipliers for client-side display conversion
    const fx_rates = {};
    fxRows.forEach(r => { fx_rates[r.currency_iso_code] = Math.round(r.gbp_to_ccy * 10000000) / 10000000; });

    const data = { ...process(rows), fx_rates };
    CACHE[cacheKey]    = data;
    CACHE_TS[cacheKey] = Date.now();
    res.json(data);
  } catch (err) {
    console.error('[sw-intelligence] error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = handler;
