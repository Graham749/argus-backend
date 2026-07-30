const { query } = require('../lib/db');

const cache = {};
const CACHE_TTL = 10 * 60 * 1000;

module.exports = async function sfOpportunities(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = cache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const esc = account.replace(/'/g, "''");

    const sfIdRows = await query(`
      SELECT TOP 1 sf_account_id FROM v_silver_mdm_account WHERE sf_account_name = '${esc}'
    `);
    const sfId = sfIdRows?.[0]?.sf_account_id;
    if (!sfId) return res.json({ matched: false, summary: null, opportunities: [] });

    const sfEsc = sfId.replace(/'/g, "''");

    const rows = await query(`
      SELECT
        Id, Name, StageName, Type,
        TRY_CAST(NULLIF(TRIM(Amount), '') AS float) AS amount,
        IsWon, IsClosed,
        CreatedDate, CloseDate
      FROM bronze_sfapi_opportunity
      WHERE AccountId = '${sfEsc}'
        AND IsDeleted = 'false'
      ORDER BY TRY_CAST(CreatedDate AS datetime2) DESC
    `);

    if (!rows.length) return res.json({ matched: true, summary: null, opportunities: [] });

    const isClosed = r => r.IsClosed === 'true' || r.IsClosed === true || r.IsClosed === 1;
    const isWon    = r => r.IsWon   === 'true' || r.IsWon   === true  || r.IsWon   === 1;
    const open = rows.filter(r => !isClosed(r) && !isWon(r));
    const won  = rows.filter(r => isWon(r));
    const lost = rows.filter(r => isClosed(r) && !isWon(r));

    const pipeline = open.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const wonVal   = won.reduce((s, r)  => s + (Number(r.amount) || 0), 0);

    // Stage breakdown (open only)
    const byStage = {};
    open.forEach(r => { const st = r.StageName || 'Unknown'; byStage[st] = (byStage[st] || 0) + 1; });
    const stageBreakdown = Object.entries(byStage)
      .sort((a, b) => b[1] - a[1])
      .map(([stage, cnt]) => ({ stage, cnt }));

    const payload = {
      matched: true,
      summary: {
        total:     rows.length,
        open:      open.length,
        won:       won.length,
        lost:      lost.length,
        pipeline:  Math.round(pipeline),
        wonValue:  Math.round(wonVal),
        stageBreakdown,
      },
      opportunities: rows.map(r => ({
        id:          r.Id,
        name:        r.Name,
        stage:       r.StageName,
        type:        r.Type,
        amount:      Number(r.amount) || 0,
        isWon:       r.IsWon  === 'true'  || r.IsWon  === true,
        isClosed:    r.IsClosed === 'true' || r.IsClosed === true,
        createdDate: r.CreatedDate,
        closeDate:   r.CloseDate,
      })),
    };

    cache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[sf-opportunities]', err.message);
    res.status(500).json({ error: err.message });
  }
};
