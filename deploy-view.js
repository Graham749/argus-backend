const { execSync } = require('child_process');
const sql = require('mssql');

async function deployView() {
  try {
    // Get token
    console.log('[Deploy] Getting access token...');
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    // Connect and deploy
    console.log('[Deploy] Connecting to Fabric...');
    const conn = new sql.ConnectionPool({
      server: 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
      authentication: {
        type: 'azure-active-directory-access-token',
        options: {
          token: token
        }
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectionTimeout: 30000,
        requestTimeout: 60000
      }
    });

    await conn.connect();
    console.log('[Deploy] Connected!');

    const createViewSQL = `
CREATE OR ALTER VIEW [dbo].[v_silver_pb_features] AS
SELECT
  f.id AS feature_id,
  f.name AS feature_name,
  f.description,
  MAX(CASE WHEN fc.field_name = 'Criticality' THEN ea.field_value END) AS criticality,
  MAX(CASE WHEN fc.field_name = 'Efficiency Impact' THEN ea.field_value END) AS efficiency_impact,
  MAX(CASE WHEN fc.field_name = 'Regional Priority' THEN TRY_CAST(ea.field_value AS FLOAT) END) AS regional_priority,
  MAX(CASE WHEN fc.field_name = 'Region (Market)' THEN ea.field_value END) AS region_market,
  f.status,
  f.owner
FROM [dbo].[bronze_pb_features] f
LEFT JOIN [dbo].[silver_pb_entity_attributes] ea
  ON f.id = ea.entity_id
  AND ea.entity_type = 'feature'
LEFT JOIN [dbo].[bronze_pb_entity_fields_config] fc
  ON ea.field_key = fc.field_id
  AND fc.entity_type = 'feature'
GROUP BY
  f.id,
  f.name,
  f.description,
  f.status,
  f.owner;
    `;

    console.log('[Deploy] Creating v_silver_pb_features view...');
    await conn.request().query(createViewSQL);
    console.log('[Deploy] ✅ View created successfully!');

    // Test the view
    console.log('\n[Test] Querying v_silver_pb_features...');
    const testResult = await conn.request().query(`
      SELECT TOP 5
        feature_id,
        feature_name,
        criticality,
        efficiency_impact,
        regional_priority,
        region_market
      FROM [dbo].[v_silver_pb_features]
      ORDER BY feature_id
    `);

    console.log('\n[Test] Sample results:');
    console.table(testResult.recordset);

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

deployView();
