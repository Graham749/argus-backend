const { query } = require('../lib/db');
const { getMdmRow } = require('../lib/mdm-cache');

const cache = {};
const CACHE_TTL = 10 * 60 * 1000;

module.exports = async function sfCases(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  const cached = cache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return res.json(cached.data);

  try {
    const mdm = await getMdmRow(account);
    const sfId = mdm?.sf_account_id;
    if (!sfId) return res.json({ matched: false, summary: null, cases: [] });

    const sfEsc = sfId.replace(/'/g, "''");

    const rows = await query(`
      SELECT
        case_number, subject, case_type, status,
        is_closed, is_escalated, is_chargeable,
        created_date, closed_date,
        TRY_CAST(aurora_hours   AS float) AS aurora_hours,
        TRY_CAST(case_duration  AS float) AS case_duration,
        person_responsible
      FROM dbo.gold_sf_cases
      WHERE account_id = '${sfEsc}'
      ORDER BY TRY_CAST(created_date AS datetime2) DESC
    `);

    if (!rows.length) return res.json({ matched: true, summary: null, cases: [] });

    const open      = rows.filter(r => r.is_closed === false || r.is_closed === 0);
    const closed    = rows.filter(r => r.is_closed === true  || r.is_closed === 1);
    const escalated = rows.filter(r => r.is_escalated === true || r.is_escalated === 1);

    const withHours = closed.filter(r => Number(r.aurora_hours) > 0);
    const avgHours  = withHours.length
      ? Math.round(withHours.reduce((s, r) => s + Number(r.aurora_hours), 0) / withHours.length * 10) / 10
      : null;

    const byType = {};
    rows.forEach(r => {
      const t = r.case_type || 'Other';
      byType[t] = (byType[t] || 0) + 1;
    });
    const typeBreakdown = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, cnt]) => ({ type, cnt }));

    const payload = {
      matched: true,
      summary: {
        total: rows.length,
        open:      open.length,
        closed:    closed.length,
        escalated: escalated.length,
        avgHours,
        typeBreakdown,
      },
      cases: rows.map(r => ({
        caseNumber:   r.case_number,
        subject:      r.subject,
        type:         r.case_type || 'Other',
        status:       r.status,
        isClosed:     r.is_closed    === true || r.is_closed    === 1,
        isEscalated:  r.is_escalated === true || r.is_escalated === 1,
        isChargeable: r.is_chargeable === true || r.is_chargeable === 1,
        createdDate:  r.created_date,
        closedDate:   r.closed_date,
        auroraHours:  Number(r.aurora_hours) || 0,
        assignee:     r.person_responsible,
      })),
    };

    cache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[sf-cases]', err.message);
    res.status(500).json({ error: err.message });
  }
};
