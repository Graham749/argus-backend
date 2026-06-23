const { execSync } = require('child_process');
const sql = require('mssql');
const fs = require('fs');

async function deployScoringLookups() {
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

    // Create lookup tables
    console.log('[Creating] Scoring lookup tables');
    const lookupScript = fs.readFileSync('../skills-for-fabric/sql/SCORING_LOOKUP_TABLES.sql', 'utf-8');
    const lookupStatements = lookupScript.split(';').filter(s => s.trim());

    for (const statement of lookupStatements) {
      if (statement.trim()) {
        try {
          await conn.request().query(statement);
        } catch (e) {
          if (!e.message.includes('already exists')) {
            throw e;
          }
        }
      }
    }
    console.log('✅ Lookup tables ready');

    // Verify lookup contents
    const counts = await conn.request().query(`
      SELECT
        'lu_regional_priority_rank' as table_name, COUNT(*) as row_count FROM [dbo].[lu_regional_priority_rank]
      UNION ALL
      SELECT 'lu_criticality_score', COUNT(*) FROM [dbo].[lu_criticality_score]
      UNION ALL
      SELECT 'lu_efficiency_score', COUNT(*) FROM [dbo].[lu_efficiency_score]
      UNION ALL
      SELECT 'lu_region_factor', COUNT(*) FROM [dbo].[lu_region_factor]
      UNION ALL
      SELECT 'lu_strategic_regions', COUNT(*) FROM [dbo].[lu_strategic_regions]
    `);

    console.log('\nLookup Table Contents:');
    console.table(counts.recordset);

    // Deploy refactored Gold views
    console.log('\n[Updating] Gold views to use scoring lookups');
    const viewScript = fs.readFileSync('../skills-for-fabric/sql/VIEW_DEFINITIONS.sql', 'utf-8');
    const goldViewStatements = viewScript.split(';').filter(s => s.includes('v_gold_pb') && s.trim());

    for (const statement of goldViewStatements.slice(0, 3)) {
      if (statement.trim()) {
        await conn.request().query(statement);
      }
    }
    console.log('✅ Gold views updated');

    // Verify
    const viewCount = await conn.request().query(`
      SELECT
        'v_gold_pb_feature_prioritization' as view_name, COUNT(*) as row_count FROM [dbo].[v_gold_pb_feature_prioritization]
      UNION ALL
      SELECT 'v_gold_pb_subfeature_prioritization', COUNT(*) FROM [dbo].[v_gold_pb_subfeature_prioritization]
      UNION ALL
      SELECT 'v_gold_pb_feature_prioritization_final', COUNT(*) FROM [dbo].[v_gold_pb_feature_prioritization_final]
    `);

    console.log('\nGold View Row Counts:');
    console.table(viewCount.recordset);

    await conn.close();
    console.log('\n✅ Done!');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

deployScoringLookups();
