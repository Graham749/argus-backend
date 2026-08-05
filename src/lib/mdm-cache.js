const { query } = require('./db');

const _cache = {};
const TTL = 10 * 60 * 1000;

async function getMdmRow(accountName) {
  const now = Date.now();
  const hit = _cache[accountName];
  if (hit && now - hit.ts < TTL) return hit.data;
  const esc = accountName.replace(/'/g, "''");
  const rows = await query(`SELECT TOP 1 * FROM dbo.gold_mdm_account WHERE sf_account_name = '${esc}'`);
  const data = rows?.[0] || null;
  _cache[accountName] = { ts: now, data };
  return data;
}

module.exports = { getMdmRow };
