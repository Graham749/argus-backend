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

    // Check for Criticality field data
    console.log('[Checking for Criticality field (e1af8b7b-385c-4cc7-9bf7-0e13d3061498)]');
    const critResult = await conn.request().query(`
      SELECT COUNT(*) as count
      FROM [dbo].[silver_pb_entity_attributes]
      WHERE entity_type = 'feature'
        AND field_key = 'e1af8b7b-385c-4cc7-9bf7-0e13d3061498'
    `);
    console.log(`Count: ${critResult.recordset[0].count}`);

    if (critResult.recordset[0].count > 0) {
      const sample = await conn.request().query(`
        SELECT TOP 5 entity_id, field_value
        FROM [dbo].[silver_pb_entity_attributes]
        WHERE entity_type = 'feature'
          AND field_key = 'e1af8b7b-385c-4cc7-9bf7-0e13d3061498'
      `);
      console.table(sample.recordset);
    }

    // Check all scoring field IDs
    const fieldIds = [
      'e1af8b7b-385c-4cc7-9bf7-0e13d3061498',  // Criticality
      'babcab41-0492-47a0-ac93-b0593d995f49',  // Efficiency Impact
      'd2c10249-a740-4495-8de5-514f124248bb',  // Regional Priority
      'de1baf6b-42c0-4b7f-bede-d738d655bfc7'   // Region (Market)
    ];

    console.log('\n[Summary of scoring field data]');
    for (const fieldId of fieldIds) {
      const result = await conn.request().query(`
        SELECT COUNT(*) as count FROM [dbo].[silver_pb_entity_attributes]
        WHERE entity_type = 'feature' AND field_key = '${fieldId}'
      `);
      console.log(`  ${fieldId}: ${result.recordset[0].count} rows`);
    }

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

check();
