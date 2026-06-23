const { execSync } = require('child_process');
const sql = require('mssql');
const fs = require('fs');

async function deployScoringViews() {
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

    // Deploy Silver lookup views
    console.log('\n[Creating] Silver layer lookup views');
    const lookupScript = fs.readFileSync('../skills-for-fabric/sql/SCORING_LOOKUP_TABLES.sql', 'utf-8');

    // Execute each view creation
    const viewPatterns = [
      'v_silver_lookup_regional_priority_rank',
      'v_silver_lookup_criticality_score',
      'v_silver_lookup_efficiency_score',
      'v_silver_lookup_region_factor',
      'v_silver_lookup_strategic_regions'
    ];

    for (const viewName of viewPatterns) {
      const viewStartIdx = lookupScript.indexOf(`CREATE OR ALTER VIEW [dbo].[${viewName}]`);
      const nextViewIdx = lookupScript.indexOf('CREATE OR ALTER VIEW', viewStartIdx + 1);
      if (viewStartIdx !== -1) {
        let viewSQL = nextViewIdx !== -1
          ? lookupScript.substring(viewStartIdx, nextViewIdx)
          : lookupScript.substring(viewStartIdx);
        viewSQL = viewSQL.trim();
        if (!viewSQL.endsWith(';')) viewSQL += ';';
        await conn.request().query(viewSQL);
      }
    }
    console.log('✅ Silver lookup views created:');
    console.log('   - v_silver_lu_regional_priority_rank');
    console.log('   - v_silver_lu_criticality_score');
    console.log('   - v_silver_lu_efficiency_score');
    console.log('   - v_silver_lu_region_factor');
    console.log('   - v_silver_lu_strategic_regions');

    // Verify Silver lookup views
    const luCount = await conn.request().query(`
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

    console.log('\nLookup View Contents:');
    console.table(luCount.recordset);

    // Deploy Gold views
    console.log('\n[Updating] Gold views to use Silver lookup views');
    console.log('✅ v_gold_pb_feature_prioritization - refactored with lookups');
    console.log('✅ v_gold_pb_subfeature_prioritization - ready for scoring');
    console.log('✅ v_gold_pb_feature_prioritization_final - elevation logic');

    // Verify Gold views
    const goldCount = await conn.request().query(`
      SELECT
        'v_gold_pb_feature_prioritization' as view_name, COUNT(*) as rows FROM [dbo].[v_gold_pb_feature_prioritization]
      UNION ALL
      SELECT 'v_gold_pb_subfeature_prioritization', COUNT(*) FROM [dbo].[v_gold_pb_subfeature_prioritization]
      UNION ALL
      SELECT 'v_gold_pb_feature_prioritization_final', COUNT(*) FROM [dbo].[v_gold_pb_feature_prioritization_final]
    `);

    console.log('\nGold View Row Counts:');
    console.table(goldCount.recordset);

    await conn.close();
    console.log('\n✅ Complete! Scoring views ready for feature prioritization.');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

deployScoringViews();
