const { execSync } = require('child_process');
const sql = require('mssql');

async function test() {
  try {
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    const conn = new sql.ConnectionPool({
      server: 'pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com',
      authentication: {
        type: 'azure-active-directory-access-token',
        options: { token: token }
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectionTimeout: 30000,
        requestTimeout: 60000
      }
    });

    await conn.connect();

    // Test the exact join logic for our target feature
    console.log('[Testing join for feature 7e925c37-7191-4fd3-a489-50c44ca2e2fe]');
    const result = await conn.request().query(`
      SELECT
        f.id,
        f.name,
        ea.field_key,
        fc.field_name,
        ea.field_value
      FROM [dbo].[bronze_pb_features] f
      LEFT JOIN [dbo].[silver_pb_entity_attributes] ea
        ON f.id = ea.entity_id
        AND ea.entity_type = 'feature'
      LEFT JOIN [dbo].[bronze_pb_entity_fields_config] fc
        ON ea.field_key = fc.field_id
        AND fc.entity_type = 'feature'
      WHERE f.id = '7e925c37-7191-4fd3-a489-50c44ca2e2fe'
      ORDER BY ea.field_key
    `);

    console.table(result.recordset);

    // Now test the aggregation
    console.log('\n[Testing aggregation for same feature]');
    const aggResult = await conn.request().query(`
      SELECT
        f.id,
        f.name,
        MAX(CASE WHEN fc.field_name = 'Criticality' THEN ea.field_value END) AS criticality,
        MAX(CASE WHEN fc.field_name = 'Efficiency Impact' THEN ea.field_value END) AS efficiency_impact,
        MAX(CASE WHEN fc.field_name = 'Regional Priority' THEN TRY_CAST(ea.field_value AS FLOAT) END) AS regional_priority,
        MAX(CASE WHEN fc.field_name = 'Region (Market)' THEN ea.field_value END) AS region_market
      FROM [dbo].[bronze_pb_features] f
      LEFT JOIN [dbo].[silver_pb_entity_attributes] ea
        ON f.id = ea.entity_id
        AND ea.entity_type = 'feature'
      LEFT JOIN [dbo].[bronze_pb_entity_fields_config] fc
        ON ea.field_key = fc.field_id
        AND fc.entity_type = 'feature'
      WHERE f.id = '7e925c37-7191-4fd3-a489-50c44ca2e2fe'
      GROUP BY f.id, f.name
    `);

    console.table(aggResult.recordset);

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

test();
