const { query } = require('../lib/db');
const { getMdmRow } = require('../lib/mdm-cache');

const cache = {};
const CACHE_TTL = 10 * 60 * 1000;

module.exports = async function sfOpportunities(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = cache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const mdm = await getMdmRow(account);
    const sfId = mdm?.sf_account_id;
    if (!sfId) return res.json({ matched: false, summary: null, opportunities: [] });

    const sfEsc = sfId.replace(/'/g, "''");

    const rows = await query(`
      SELECT
        opportunity_id, opportunity_name, stage, opportunity_type,
        amount, is_won, is_closed, currency,
        created_date, close_date
      FROM dbo.gold_sf_opportunities
      WHERE account_id = '${sfEsc}'
      ORDER BY created_date DESC
    `);

    if (!rows.length) return res.json({ matched: true, summary: null, opportunities: [] });

    const isClosed = r => r.is_closed === 1 || r.is_closed === true;
    const isWon    = r => r.is_won    === 1 || r.is_won    === true;
    const open = rows.filter(r => !isClosed(r) && !isWon(r));
    const won  = rows.filter(r => isWon(r));
    const lost = rows.filter(r => isClosed(r) && !isWon(r));

    const pipeline = open.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const wonVal   = won.reduce((s, r)  => s + (Number(r.amount) || 0), 0);

    const byStage = {};
    open.forEach(r => { const st = r.stage || 'Unknown'; byStage[st] = (byStage[st] || 0) + 1; });
    const stageBreakdown = Object.entries(byStage)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, cnt]) => ({ stage, cnt }));

    const payload = {
      matched: true,
      summary: {
        total:    rows.length,
        open:     open.length,
        won:      won.length,
        lost:     lost.length,
        pipeline: Math.round(pipeline),
        wonValue: Math.round(wonVal),
        stageBreakdown,
      },
      opportunities: rows.map(r => ({
        id:          r.opportunity_id,
        name:        r.opportunity_name,
        stage:       r.stage,
        type:        r.opportunity_type,
        amount:      Number(r.amount) || 0,
        isWon:       r.is_won    === 1 || r.is_won    === true,
        isClosed:    r.is_closed === 1 || r.is_closed === true,
        createdDate: r.created_date,
        closeDate:   r.close_date,
      })),
    };

    cache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[sf-opportunities]', err.message);
    res.status(500).json({ error: err.message });
  }
};
