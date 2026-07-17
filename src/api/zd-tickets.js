const { query: queryLakehouse } = require('../lib/db');

// Per-account result cache — avoids repeated Fabric round-trips
const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function zdTickets(req, res) {
  const account = (req.query.account || '').trim();
  if (!account) return res.status(400).json({ error: 'account query param required' });

  // Serve from cache if fresh
  const cached = resultCache[account];
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const escaped = account.replace(/'/g, "''");

    // Single query: resolve org from MDM and fetch tickets in one round-trip
    const ticketRows = await queryLakehouse(`
      WITH org AS (
        SELECT TOP 1
          CAST(TRY_CAST(zd_org_id AS BIGINT) AS VARCHAR(20)) AS zd_org_id,
          zd_org_name
        FROM v_silver_mdm_account
        WHERE sf_account_name = '${escaped}'
          AND has_zd_org = 1
          AND zd_org_id IS NOT NULL
      )
      SELECT
        o.zd_org_id,
        o.zd_org_name,
        t.id,
        t.subject,
        t.status,
        t.priority,
        t.created_at,
        t.updated_at,
        t.support_type,
        m.full_resolution_time_calendar,
        m.requester_wait_time_calendar,
        m.reply_time_calendar,
        m.reply_time_business,
        m.replies,
        m.reopens,
        m.solved_at,
        TRY_CAST(ts.time_spent_value AS INT) AS time_spent_minutes,
        TRY_CAST(cr.num_credits_value AS INT) AS num_credits
      FROM org o
      JOIN zd_notebook_tickets t
        ON CAST(TRY_CAST(t.organization_id AS BIGINT) AS VARCHAR(20)) = o.zd_org_id
      LEFT JOIN zd_notebook_ticket_metrics m ON CAST(m.ticket_id AS BIGINT) = t.id
      OUTER APPLY (
        SELECT TOP 1 cf.[value] AS time_spent_value
        FROM OPENJSON(
          REPLACE(REPLACE(REPLACE(REPLACE(t.custom_fields,'''','"'),': None',': null'),': True',': true'),': False',': false')
        ) WITH (id BIGINT '$.id', [value] NVARCHAR(100) '$.value') cf
        WHERE cf.id = 4803428506271
      ) ts
      OUTER APPLY (
        SELECT TOP 1 cf.[value] AS num_credits_value
        FROM OPENJSON(
          REPLACE(REPLACE(REPLACE(REPLACE(t.custom_fields,'''','"'),': None',': null'),': True',': true'),': False',': false')
        ) WITH (id BIGINT '$.id', [value] NVARCHAR(100) '$.value') cf
        WHERE cf.id = 5220732777631
      ) cr
      WHERE t.status != 'deleted'
      ORDER BY t.created_at DESC
    `);

    if (!ticketRows || ticketRows.length === 0) {
      return res.json({ zdOrgId: null, zdOrgName: null, summary: null, tickets: [], closed: null });
    }

    const zdOrgId   = ticketRows[0].zd_org_id;
    const zdOrgName = ticketRows[0].zd_org_name;

    const open    = ticketRows.filter(t => t.status === 'open' || t.status === 'new');
    const pending = ticketRows.filter(t => t.status === 'pending');
    const solved  = ticketRows.filter(t => t.status === 'solved');
    const closed  = ticketRows.filter(t => t.status === 'closed');

    // Avg time spent (logged minutes) — closed tickets only
    const withTimeSpent = ticketRows.filter(t => t.status === 'closed' && Number(t.time_spent_minutes) > 0);
    const avgResolutionDays = withTimeSpent.length
      ? Math.round(withTimeSpent.reduce((s, t) => s + Number(t.time_spent_minutes), 0) / withTimeSpent.length)
      : null;

    // Avg first reply — business hours, all tickets
    const withReply = ticketRows.filter(t => Number(t.reply_time_business) > 0);
    const avgReplyHours = withReply.length
      ? Math.round(withReply.reduce((s, t) => s + Number(t.reply_time_business), 0) / withReply.length / 60 * 10) / 10
      : null;

    // All tickets for all statuses — drilldown needs the full list
    const activeTickets = [...open, ...pending, ...solved, ...closed]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(t => ({
        id:               t.id,
        subject:          t.subject,
        status:           t.status,
        priority:         t.priority || 'normal',
        createdAt:        t.created_at,
        replies:          Number(t.replies) || 0,
        reopens:          Number(t.reopens) || 0,
        resolutionMinutes:    Number(t.full_resolution_time_calendar) || 0,
        waitMinutes:          Number(t.requester_wait_time_calendar) || 0,
        timeSpentMinutes:     Number(t.time_spent_minutes) || 0,
        replyBusinessMinutes: Number(t.reply_time_business) || 0,
        numCredits:           Number(t.num_credits) || 0,
      }));

    const payload = {
      zdOrgId,
      zdOrgName,
      summary: {
        open:    open.length,
        pending: pending.length,
        solved:  solved.length,
        closed:  closed.length,
        total:   ticketRows.length,
      },
      avgResolutionDays,
      avgReplyHours,
      tickets: activeTickets,
    };

    resultCache[account] = { ts: Date.now(), data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[zd-tickets]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = zdTickets;
