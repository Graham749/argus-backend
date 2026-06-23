const { execSync } = require('child_process');
const sql = require('mssql');

async function check() {
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

    console.log('[Checking field_id format in bronze_pb_entity_fields_config]');
    const result = await conn.request().query(`
      SELECT TOP 20
        field_id,
        field_name,
        entity_type
      FROM [dbo].[bronze_pb_entity_fields_config]
      WHERE entity_type = 'feature'
      ORDER BY field_id
    `);

    console.table(result.recordset);

    // Check for specific fields we care about
    console.log('\n[Looking for scoring fields]');
    const scoreResult = await conn.request().query(`
      SELECT field_id, field_name, entity_type
      FROM [dbo].[bronze_pb_entity_fields_config]
      WHERE entity_type = 'feature'
        AND field_name IN ('Criticality', 'Efficiency Impact', 'Regional Priority', 'Region (Market)')
      ORDER BY field_name
    `);

    console.table(scoreResult.recordset);

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

check();
