const { execSync } = require('child_process');
const sql = require('mssql');

async function checkFieldsConfig() {
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

    const result = await conn.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'bronze_pb_entity_fields_config'
    `);

    if (result.recordset.length === 0) {
      console.log('[Info] ❌ bronze_pb_entity_fields_config DOES NOT EXIST');
      console.log('[Action] This table is needed to map field GUIDs to friendly names');
      console.log('[Blocker] Scoring can\'t work without this mapping table');
    } else {
      console.log('[Info] ✅ bronze_pb_entity_fields_config EXISTS');

      const countResult = await conn.request().query(`
        SELECT COUNT(*) as row_count FROM [dbo].[bronze_pb_entity_fields_config]
      `);
      console.log(`[Rows] ${countResult.recordset[0].row_count}`);

      // Show columns
      const colResult = await conn.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'bronze_pb_entity_fields_config'
        ORDER BY ORDINAL_POSITION
      `);
      console.log('[Columns]:');
      colResult.recordset.forEach(r => console.log('  -', r.COLUMN_NAME));
    }

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

checkFieldsConfig();
