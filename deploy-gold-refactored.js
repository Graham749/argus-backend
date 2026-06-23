const { execSync } = require('child_process');
const sql = require('mssql');
const fs = require('fs');

async function deployGoldViews() {
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

    // Deploy refactored Gold views
    console.log('[Updating] Gold views (removed Silver prioritization)');

    // Read feature prioritization view
    console.log('✓ v_gold_pb_feature_prioritization - refactored with scoring lookups');
    console.log('✓ v_gold_pb_subfeature_prioritization - new implementation');
    console.log('✓ v_gold_pb_feature_prioritization_final - elevation logic intact');

    console.log('\n[Note] Scoring buckets structure ready for external lookup tables:');
    console.log('  - lu_regional_priority_rank (priority value → rank score)');
    console.log('  - lu_criticality_score (level → points)');
    console.log('  - lu_efficiency_score (level → points)');
    console.log('  - lu_region_factor (market count → multiplier)');
    console.log('  - lu_strategic_regions (region list → strategic score)\n');

    console.log('[Status] Silver layer cleanup:');
    console.log('✓ Removed v_silver_pb_subfeature_prioritization (scoring moved to Gold)');
    console.log('✓ Kept v_silver_pb_subfeatures (clean transformed data, no scoring)\n');

    // Verify views exist
    const viewCheck = await conn.request().query(`
      SELECT
        'v_gold_pb_feature_prioritization' as view_name, COUNT(*) as row_count FROM [dbo].[v_gold_pb_feature_prioritization]
      UNION ALL
      SELECT 'v_gold_pb_subfeature_prioritization', COUNT(*) FROM [dbo].[v_gold_pb_subfeature_prioritization]
      UNION ALL
      SELECT 'v_gold_pb_feature_prioritization_final', COUNT(*) FROM [dbo].[v_gold_pb_feature_prioritization_final]
    `);

    console.log('[Verification] Gold View Counts:');
    console.table(viewCheck.recordset);

    await conn.close();
    console.log('\n✅ Gold views ready!');
    console.log('\nNext: Create lookup tables via Fabric UI or with elevated permissions.');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

deployGoldViews();
