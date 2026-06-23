const { execSync } = require('child_process');
const sql = require('mssql');

async function checkAttributes() {
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

    // Check if table exists
    const tableCheck = await conn.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'silver_pb_entity_attributes'
    `);

    if (tableCheck.recordset.length === 0) {
      console.log('[Info] silver_pb_entity_attributes table DOES NOT EXIST');
      await conn.close();
      return;
    }

    console.log('[Info] silver_pb_entity_attributes table EXISTS');

    // Check row count
    const countResult = await conn.request().query(`
      SELECT COUNT(*) as row_count FROM [dbo].[silver_pb_entity_attributes]
    `);

    const rowCount = countResult.recordset[0].row_count;
    console.log(`[Info] Row count: ${rowCount}`);

    if (rowCount > 0) {
      // Show sample data
      console.log('\n[Sample data]:');
      const sampleResult = await conn.request().query(`
        SELECT TOP 10
          entity_id,
          entity_type,
          field_key,
          field_value
        FROM [dbo].[silver_pb_entity_attributes]
        ORDER BY entity_id
      `);
      console.table(sampleResult.recordset);
    }

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

checkAttributes();
