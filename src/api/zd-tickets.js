const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

// Per-account result cache — avoids repeated Fabric round-trips
const resultCache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 60000) return cachedToken;
  const token = execSync(
    'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  cachedToken = token;
  tokenExpiry = now + 55 * 60 * 1000;
  return token;
}

async function queryLakehouse(query) {
  const token = await getAccessToken();
  const conn = new sql.ConnectionPool({
    server: process.env.FABRIC_SERVER || 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
    authentication: { type: 'azure-active-directory-access-token', options: { token } },
    requestTimeout: 120000,
    connectionTimeout: 30000,
    options: { encrypt: true, trustServerCertificate: false }
  });
  try {
    await conn.connect();
    const result = await conn.request().query(query);
    return result.recordset;
  } catch (err) {
    if (err.message && (err.message.includes('Could not login') || err.message.includes('token'))) {
      cachedToken = null; tokenExpiry = null;
    }
    throw err;
  } finally {
    await conn.close();
  }
}

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

    // Resolve ZD org ID from MDM view
    const orgRows = await queryLakehouse(`
      SELECT TOP 1 zd_org_id, zd_org_name
      FROM v_silver_mdm_account
      WHERE sf_account_name = '${escaped}'
        AND has_zd_org = 1
        AND zd_org_id IS NOT NULL
    `);

    if (!orgRows || orgRows.length === 0) {
      return res.json({ zdOrgId: null, zdOrgName: null, summary: null, tickets: [], closed: null });
    }

    const zdOrgId = orgRows[0].zd_org_id;
    const zdOrgName = orgRows[0].zd_org_name;

    // Tickets + metrics for this org
    const ticketRows = await queryLakehouse(`
      SELECT
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
      FROM zd_notebook_tickets t
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
      WHERE CAST(TRY_CAST(t.organization_id AS BIGINT) AS VARCHAR(20)) = '${zdOrgId}'
        AND t.status != 'deleted'
      ORDER BY t.created_at DESC
    `);

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
