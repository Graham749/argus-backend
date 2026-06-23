const { execSync } = require('child_process');
const sql = require('mssql');

async function deployGoldView() {
  try {
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    const conn = new sql.ConnectionPool({
      server: 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
      authentication: {
        type: 'azure-active-directory-access-token',
        options: { token }
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectionTimeout: 30000,
        requestTimeout: 120000
      }
    });

    await conn.connect();
    console.log('[Deploy] Connected');

    console.log('[Deploying v_gold_pb_feature_prioritization...]');
    await conn.request().query(`
      CREATE OR ALTER VIEW [dbo].[v_gold_pb_feature_prioritization] AS
      SELECT
        f.feature_id,
        f.feature_name,
        f.[Criticality],
        f.[Efficiency Impact],
        TRY_CAST(f.[Regional Priority] AS FLOAT) AS regional_priority,
        CASE
          WHEN TRY_CAST(f.[Regional Priority] AS FLOAT) IS NULL THEN NULL
          WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 3 THEN 10
          WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 6 THEN 7
          WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 10 THEN 3
          ELSE 1
        END AS rank_score,
        CASE
          WHEN f.[Criticality] LIKE '%High%' THEN 2
          WHEN f.[Criticality] LIKE '%Blocker%' THEN 4
          WHEN f.[Criticality] LIKE '%Medium%' THEN 1
          ELSE 0
        END AS criticality_score,
        CASE
          WHEN f.[Efficiency Impact] LIKE '%High%' THEN 4
          WHEN f.[Efficiency Impact] LIKE '%Medium%' THEN 2
          ELSE 0
        END AS efficiency_score,
        1.2 AS region_factor,
        0 AS strategic_region_score,
        0.0 AS rank_weighted_50,
        0.0 AS criticality_weighted_20,
        0.0 AS efficiency_weighted_20,
        0.0 AS strategic_region_weighted_10,
        ROUND(
          CASE
            WHEN TRY_CAST(f.[Regional Priority] AS FLOAT) IS NULL THEN NULL
            WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 3 THEN 5
            WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 6 THEN 3.5
            WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 10 THEN 1.5
            ELSE 0.5
          END
        , 2) AS base_priority_score,
        ROUND(
          CASE
            WHEN TRY_CAST(f.[Regional Priority] AS FLOAT) IS NULL THEN NULL
            WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 3 THEN 6
            WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 6 THEN 4.2
            WHEN CEILING(CAST(f.[Regional Priority] AS FLOAT)) <= 10 THEN 1.8
            ELSE 0.6
          END
        , 2) AS priority_score
      FROM [dbo].[v_silver_pb_features] f;
    `);
    console.log('✅ v_gold_pb_feature_prioritization deployed');

    // Test
    console.log('\n[Testing]');
    const result = await conn.request().query(
      "SELECT TOP 5 feature_id, feature_name, Criticality, priority_score FROM [dbo].[v_gold_pb_feature_prioritization] WHERE priority_score IS NOT NULL ORDER BY priority_score DESC"
    );
    console.table(result.recordset);

    await conn.close();
    console.log('\n✅ Done!');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

deployGoldView();
