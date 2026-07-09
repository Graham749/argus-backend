const { execSync } = require('child_process');
const sql = require('mssql');

let cachedToken = null;
let tokenExpiry = null;

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
        m.reply_time_calendar,
        m.replies,
        m.reopens,
        m.solved_at
      FROM zd_notebook_tickets t
      LEFT JOIN zd_notebook_ticket_metrics m ON CAST(m.ticket_id AS BIGINT) = t.id
      WHERE CAST(TRY_CAST(t.organization_id AS BIGINT) AS VARCHAR(20)) = '${zdOrgId}'
        AND t.status != 'deleted'
      ORDER BY t.created_at DESC
    `);

    const open    = ticketRows.filter(t => t.status === 'open' || t.status === 'new');
    const pending = ticketRows.filter(t => t.status === 'pending');
    const solved  = ticketRows.filter(t => t.status === 'solved');
    const closed  = ticketRows.filter(t => t.status === 'closed');

    // Avg resolution time (minutes → days) for resolved tickets
    const resolved = [...solved, ...closed].filter(t => t.full_resolution_time_calendar > 0);
    const avgResolutionDays = resolved.length
      ? Math.round(resolved.reduce((s, t) => s + t.full_resolution_time_calendar, 0) / resolved.length / 1440 * 10) / 10
      : null;

    // Avg first reply time (minutes → hours) for tickets with reply data
    const withReply = ticketRows.filter(t => t.reply_time_calendar > 0);
    const avgReplyHours = withReply.length
      ? Math.round(withReply.reduce((s, t) => s + t.reply_time_calendar, 0) / withReply.length / 60 * 10) / 10
      : null;

    // All open + pending tickets (no cap — drilldown needs the full list)
    const activeTickets = [...open, ...pending]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(t => ({
        id:         t.id,
        subject:    t.subject,
        status:     t.status,
        priority:   t.priority || 'normal',
        createdAt:  t.created_at,
        replies:    Number(t.replies) || 0,
        reopens:    Number(t.reopens) || 0,
      }));

    res.json({
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
    });
  } catch (err) {
    console.error('[zd-tickets]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = zdTickets;
