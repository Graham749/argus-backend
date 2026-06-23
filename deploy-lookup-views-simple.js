const { execSync } = require('child_process');
const sql = require('mssql');
const fs = require('fs');

async function deployLookupViews() {
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
    console.log('[Deploy] Connected to Fabric');

    // Deploy each view individually
    const views = [
      {
        name: 'v_silver_lookup_regional_priority_rank',
        sql: `CREATE OR ALTER VIEW [dbo].[v_silver_lookup_regional_priority_rank] AS
              SELECT 1 AS priority_min, 3 AS priority_max, 10 AS rank_score UNION ALL
              SELECT 4, 6, 7 UNION ALL
              SELECT 7, 10, 3 UNION ALL
              SELECT 11, 999, 1;`
      },
      {
        name: 'v_silver_lookup_criticality_score',
        sql: `CREATE OR ALTER VIEW [dbo].[v_silver_lookup_criticality_score] AS
              SELECT 'BLOCKER' AS criticality_level, 4 AS score_points UNION ALL
              SELECT 'HIGH', 2 UNION ALL
              SELECT 'MEDIUM', 1 UNION ALL
              SELECT 'LOW', 0 UNION ALL
              SELECT 'LOW/NA', 0 UNION ALL
              SELECT '', 0;`
      },
      {
        name: 'v_silver_lookup_efficiency_score',
        sql: `CREATE OR ALTER VIEW [dbo].[v_silver_lookup_efficiency_score] AS
              SELECT 'HIGH' AS efficiency_level, 4 AS score_points UNION ALL
              SELECT 'MEDIUM', 2 UNION ALL
              SELECT 'LOW', 0 UNION ALL
              SELECT '', 0;`
      },
      {
        name: 'v_silver_lookup_region_factor',
        sql: `CREATE OR ALTER VIEW [dbo].[v_silver_lookup_region_factor] AS
              SELECT 16 AS region_count_min, 999 AS region_count_max, 1.5 AS factor_multiplier UNION ALL
              SELECT 6, 15, 1.3 UNION ALL
              SELECT 2, 5, 1.2 UNION ALL
              SELECT 1, 1, 1.0 UNION ALL
              SELECT 0, 0, 1.0;`
      },
      {
        name: 'v_silver_lookup_strategic_regions',
        sql: `CREATE OR ALTER VIEW [dbo].[v_silver_lookup_strategic_regions] AS
              SELECT 'USA' AS region_code, 'United States' AS region_name, 2 AS strategic_score UNION ALL
              SELECT 'NORAM', 'North America', 2 UNION ALL
              SELECT 'JPN', 'Japan', 2 UNION ALL
              SELECT 'FRA', 'France', 2 UNION ALL
              SELECT 'BENE', 'Benelux', 2 UNION ALL
              SELECT 'NOD', 'Nordic', 2 UNION ALL
              SELECT 'POL', 'Poland', 2 UNION ALL
              SELECT 'IRX', 'Ireland', 2;`
      }
    ];

    console.log('[Deploy] Creating lookup views...');
    for (const view of views) {
      await conn.request().query(view.sql);
      console.log(`  ✅ ${view.name}`);
    }

    // Verify
    const result = await conn.request().query(`
      SELECT
        'v_silver_lookup_regional_priority_rank' as view_name, COUNT(*) as rows FROM [dbo].[v_silver_lookup_regional_priority_rank]
      UNION ALL
      SELECT 'v_silver_lookup_criticality_score', COUNT(*) FROM [dbo].[v_silver_lookup_criticality_score]
      UNION ALL
      SELECT 'v_silver_lookup_efficiency_score', COUNT(*) FROM [dbo].[v_silver_lookup_efficiency_score]
      UNION ALL
      SELECT 'v_silver_lookup_region_factor', COUNT(*) FROM [dbo].[v_silver_lookup_region_factor]
      UNION ALL
      SELECT 'v_silver_lookup_strategic_regions', COUNT(*) FROM [dbo].[v_silver_lookup_strategic_regions]
    `);

    console.log('\nVerification:');
    console.table(result.recordset);

    await conn.close();
    console.log('\n✅ All lookup views deployed!');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

deployLookupViews();
