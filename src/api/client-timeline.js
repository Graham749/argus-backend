const { query, cacheGet, cacheSet } = require('../lib/db');

const BENCH_TTL = 4 * 60 * 60 * 1000;

async function getBenchmark() {
  const cached = cacheGet('timeline_benchmark');
  if (cached) return cached;

  const [zdB, phB, pbB, caseB, oppB] = await Promise.all([
    query(`
      WITH org_monthly AS (
        SELECT
          CAST(TRY_CAST(organization_id AS BIGINT) AS VARCHAR(20)) AS org_id,
          FORMAT(TRY_CAST(created_at AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS cnt
        FROM zd_notebook_tickets
        WHERE TRY_CAST(created_at AS datetime2) >= DATEADD(month, -3, GETDATE())
          AND organization_id IS NOT NULL AND status != 'deleted'
        GROUP BY
          CAST(TRY_CAST(organization_id AS BIGINT) AS VARCHAR(20)),
          FORMAT(TRY_CAST(created_at AS datetime2), 'yyyy-MM')
      ),
      org_avg AS (
        SELECT org_id, AVG(CAST(cnt AS float)) AS avg_mo
        FROM org_monthly GROUP BY org_id
      ),
      pcts AS (
        SELECT
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p90
        FROM org_avg
      )
      SELECT TOP 1 p25, p50, p75, p90 FROM pcts
    `),
    query(`
      WITH t_monthly AS (
        SELECT
          tenant,
          FORMAT(date_event, 'yyyy-MM') AS mo,
          COUNT(DISTINCT person_id) AS cnt
        FROM posthog_notebook_events
        WHERE date_event >= DATEADD(month, -3, GETDATE())
          AND tenant IS NOT NULL AND LEN(tenant) > 2
          AND tenant NOT LIKE '%@%'
          AND date_event IS NOT NULL
        GROUP BY tenant, FORMAT(date_event, 'yyyy-MM')
      ),
      t_avg AS (
        SELECT tenant, AVG(CAST(cnt AS float)) AS avg_mo
        FROM t_monthly GROUP BY tenant
      ),
      pcts AS (
        SELECT
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p90
        FROM t_avg
      )
      SELECT TOP 1 p25, p50, p75, p90 FROM pcts
    `),
    query(`
      WITH co_monthly AS (
        SELECT
          nr.target_id,
          FORMAT(TRY_CAST(n.created_at AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS cnt
        FROM pb_notebook_notes n
        INNER JOIN pb_notebook_note_relationships nr ON nr.note_id = n.note_id
        WHERE nr.target_type = 'company'
          AND TRY_CAST(n.created_at AS datetime2) >= DATEADD(month, -3, GETDATE())
          AND (n.archived IS NULL OR n.archived = 0)
        GROUP BY nr.target_id, FORMAT(TRY_CAST(n.created_at AS datetime2), 'yyyy-MM')
      ),
      co_avg AS (
        SELECT target_id, AVG(CAST(cnt AS float)) AS avg_mo
        FROM co_monthly GROUP BY target_id
      ),
      pcts AS (
        SELECT
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p90
        FROM co_avg
      )
      SELECT TOP 1 p25, p50, p75, p90 FROM pcts
    `),
    query(`
      WITH mo AS (
        SELECT
          account_id,
          FORMAT(TRY_CAST(created_date AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS cnt
        FROM v_silver_sf_cases
        WHERE TRY_CAST(created_date AS datetime2) >= DATEADD(month, -3, GETDATE())
          AND account_id IS NOT NULL
        GROUP BY account_id, FORMAT(TRY_CAST(created_date AS datetime2), 'yyyy-MM')
      ),
      avg_mo AS (SELECT account_id, AVG(CAST(cnt AS float)) AS avg_mo FROM mo GROUP BY account_id),
      pcts AS (
        SELECT
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p90
        FROM avg_mo
      )
      SELECT TOP 1 p25, p50, p75, p90 FROM pcts
    `),
    query(`
      WITH mo AS (
        SELECT
          AccountId,
          FORMAT(TRY_CAST(CreatedDate AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS cnt
        FROM bronze_sfapi_opportunity
        WHERE TRY_CAST(CreatedDate AS datetime2) >= DATEADD(month, -3, GETDATE())
          AND IsDeleted = 'false'
          AND AccountId IS NOT NULL
        GROUP BY AccountId, FORMAT(TRY_CAST(CreatedDate AS datetime2), 'yyyy-MM')
      ),
      avg_mo AS (SELECT AccountId, AVG(CAST(cnt AS float)) AS avg_mo FROM mo GROUP BY AccountId),
      pcts AS (
        SELECT
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p25,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY avg_mo) OVER () AS p90
        FROM avg_mo
      )
      SELECT TOP 1 p25, p50, p75, p90 FROM pcts
    `)
  ]);

  const bench = {
    support: { p25: Number(zdB[0]?.p25||0),   p50: Number(zdB[0]?.p50||1),   p75: Number(zdB[0]?.p75||3),   p90: Number(zdB[0]?.p90||8)  },
    usage:   { p25: Number(phB[0]?.p25||2),   p50: Number(phB[0]?.p50||8),   p75: Number(phB[0]?.p75||22),  p90: Number(phB[0]?.p90||55) },
    product: { p25: Number(pbB[0]?.p25||0),   p50: Number(pbB[0]?.p50||0.3), p75: Number(pbB[0]?.p75||1.2), p90: Number(pbB[0]?.p90||4)  },
    cases:   { p25: Number(caseB[0]?.p25||0), p50: Number(caseB[0]?.p50||0.5),p75: Number(caseB[0]?.p75||1.5),p90: Number(caseB[0]?.p90||4)},
    opps:    { p25: Number(oppB[0]?.p25||0),  p50: Number(oppB[0]?.p50||0.3), p75: Number(oppB[0]?.p75||1),  p90: Number(oppB[0]?.p90||3) }
  };

  cacheSet('timeline_benchmark', bench, BENCH_TTL);
  return bench;
}

function buildMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return months;
}

module.exports = async function clientTimeline(req, res) {
  const accountName = (req.query.account || '').trim();
  if (!accountName) return res.status(400).json({ error: 'account query param required' });

  const esc = accountName.replace(/'/g, "''");

  try {
    // Step 1: MDM lookup
    const mdmRows = await query(`
      SELECT TOP 1
        sf_account_id, zd_org_id, pb_company_id,
        has_zd_org, has_pb_company
      FROM v_silver_mdm_account
      WHERE sf_account_name = '${esc}'
    `);

    const mdm = mdmRows?.[0];
    if (!mdm) return res.status(404).json({ error: 'Account not found in MDM' });

    const { sf_account_id, zd_org_id, pb_company_id } = mdm;
    const sfEsc = (sf_account_id || '').replace(/'/g, "''");
    const zdEsc = (zd_org_id    || '').replace(/'/g, "''");
    const pbEsc = (pb_company_id|| '').toLowerCase().replace(/'/g, "''");

    // Step 2: PH tenant lookup
    const phRows = await query(`
      SELECT TOP 1 ph_tenant FROM v_gold_mdm_posthog WHERE sf_account_id = '${sfEsc}'
    `);
    const phTenant = phRows?.[0]?.ph_tenant || null;
    const phEsc = (phTenant || '').replace(/'/g, "''");

    // Step 3: parallel per-account queries + benchmark
    const [zdMonthly, phMonthly, pbMonthly, caseMonthly, oppMonthly, subRows, subTypeRows, bench] = await Promise.all([

      zd_org_id ? query(`
        SELECT
          FORMAT(TRY_CAST(created_at AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS tickets
        FROM zd_notebook_tickets
        WHERE CAST(TRY_CAST(organization_id AS BIGINT) AS VARCHAR(20)) = '${zdEsc}'
          AND created_at IS NOT NULL AND status != 'deleted'
        GROUP BY FORMAT(TRY_CAST(created_at AS datetime2), 'yyyy-MM')
        ORDER BY mo
      `) : Promise.resolve([]),

      phTenant ? query(`
        SELECT
          FORMAT(date_event, 'yyyy-MM') AS mo,
          COUNT(DISTINCT person_id) AS users,
          COUNT(*) AS events
        FROM posthog_notebook_events
        WHERE tenant = '${phEsc}' AND date_event IS NOT NULL
        GROUP BY FORMAT(date_event, 'yyyy-MM')
        ORDER BY mo
      `) : Promise.resolve([]),

      pb_company_id ? query(`
        SELECT
          FORMAT(TRY_CAST(n.created_at AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS notes
        FROM pb_notebook_notes n
        INNER JOIN pb_notebook_note_relationships nr ON nr.note_id = n.note_id
        WHERE nr.target_id = '${pbEsc}'
          AND nr.target_type = 'company'
          AND n.created_at IS NOT NULL
          AND (n.archived IS NULL OR n.archived = 0)
        GROUP BY FORMAT(TRY_CAST(n.created_at AS datetime2), 'yyyy-MM')
        ORDER BY mo
      `) : Promise.resolve([]),

      sf_account_id ? query(`
        SELECT
          FORMAT(TRY_CAST(created_date AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS cases
        FROM v_silver_sf_cases
        WHERE account_id = '${sfEsc}'
          AND created_date IS NOT NULL
        GROUP BY FORMAT(TRY_CAST(created_date AS datetime2), 'yyyy-MM')
        ORDER BY mo
      `) : Promise.resolve([]),

      sf_account_id ? query(`
        SELECT
          FORMAT(TRY_CAST(CreatedDate AS datetime2), 'yyyy-MM') AS mo,
          COUNT(*) AS opps
        FROM bronze_sfapi_opportunity
        WHERE AccountId = '${sfEsc}'
          AND IsDeleted = 'false'
          AND CreatedDate IS NOT NULL
        GROUP BY FORMAT(TRY_CAST(CreatedDate AS datetime2), 'yyyy-MM')
        ORDER BY mo
      `) : Promise.resolve([]),

      query(`
        SELECT
          MIN(TRY_CAST(NULLIF(TRIM(Original_Start_Date__c), '') AS date)) AS original_start,
          MIN(TRY_CAST(NULLIF(TRIM(Start_Date__c), '')          AS date)) AS earliest_start,
          MAX(TRY_CAST(NULLIF(TRIM(End_Date__c), '')            AS date)) AS latest_end,
          SUM(TRY_CAST(NULLIF(TRIM(Current_Price_Per_Year__c), '') AS float)) AS arr,
          COUNT(*) AS sub_count
        FROM bronze_sfapi_subscripton__c
        WHERE Account__c = '${sfEsc}'
          AND IsDeleted = 'false'
          AND NULLIF(TRIM(End_Date__c), '') IS NOT NULL
          AND TRY_CAST(NULLIF(TRIM(End_Date__c), '') AS date) >= CAST(GETDATE() AS date)
          AND Status__c IN ('Active', 'Termination in Progress')
      `),

      sf_account_id ? query(`
        SELECT
          COALESCE(NULLIF(TRIM(Service_Type__c), ''), 'Other') AS service_type,
          COUNT(*) AS cnt,
          SUM(CAST(arr_gbp AS float)) AS arr_gbp
        FROM v_silver_sf_subscriptions
        WHERE account_id = '${sfEsc}'
        GROUP BY Service_Type__c
        ORDER BY SUM(CAST(arr_gbp AS float)) DESC
      `) : Promise.resolve([]),

      getBenchmark()
    ]);

    // Build 13-month grid
    const months = buildMonths(13);
    const PH_DATA_START = '2026-04';

    const zdMap   = {}; zdMonthly.forEach(r   => { zdMap[r.mo]   = Number(r.tickets); });
    const phMap   = {}; phMonthly.forEach(r   => { phMap[r.mo]   = Number(r.users);   });
    const pbMap   = {}; pbMonthly.forEach(r   => { pbMap[r.mo]   = Number(r.notes);   });
    const caseMap = {}; caseMonthly.forEach(r  => { caseMap[r.mo] = Number(r.cases);   });
    const oppMap  = {}; oppMonthly.forEach(r   => { oppMap[r.mo]  = Number(r.opps);    });

    const support      = months.map(m => zdMap[m]   !== undefined ? zdMap[m]   : 0);
    const usage        = months.map(m => m < PH_DATA_START ? null : (phMap[m] !== undefined ? phMap[m] : 0));
    const product      = months.map(m => pbMap[m]   !== undefined ? pbMap[m]   : 0);
    const cases        = months.map(m => caseMap[m]  !== undefined ? caseMap[m]  : 0);
    const opportunities = months.map(m => oppMap[m]  !== undefined ? oppMap[m]  : 0);

    // Subscription details
    const sub = subRows?.[0];
    let subscription = null;
    if (sub?.latest_end) {
      const startDate = sub.original_start || sub.earliest_start;
      const endDate   = new Date(sub.latest_end);
      const start     = startDate ? new Date(startDate) : endDate;
      const now       = new Date();
      const total     = endDate - start;
      const elapsed   = now - start;
      const pct       = total > 0 ? Math.max(0, Math.min(100, Math.round(elapsed / total * 100))) : 0;
      const daysToRenewal = Math.round((endDate - now) / 86400000);

      const fmtDate = d => {
        if (!d) return null;
        const dt = (d instanceof Date) ? d : new Date(d);
        return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
      };
      subscription = {
        startDate:      fmtDate(startDate),
        endDate:        fmtDate(sub.latest_end),
        arr:            sub.arr ? Math.round(Number(sub.arr)) : null,
        count:          Number(sub.sub_count) || 0,
        daysToRenewal,
        percentThrough: pct
      };
    }

    const subscriptionTypes = (subTypeRows || []).map(r => ({
      service_type: r.service_type || 'Other',
      cnt:          Number(r.cnt) || 0,
      arr_gbp:      r.arr_gbp ? Math.round(Number(r.arr_gbp)) : 0
    }));

    res.json({
      months,
      support,
      usage,
      product,
      cases,
      opportunities,
      subscription,
      subscriptionTypes,
      benchmark: bench,
      hasZd: !!zd_org_id,
      hasPh: !!phTenant,
      hasPb: !!pb_company_id,
      hasSf: !!sf_account_id
    });

  } catch (err) {
    console.error('[client-timeline]', err.message);
    res.status(500).json({ error: err.message });
  }
};
