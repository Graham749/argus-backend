const { execSync } = require('child_process');
const sql = require('mssql');

async function checkFieldKeys() {
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
      SELECT DISTINCT field_key
      FROM [dbo].[silver_pb_entity_attributes]
      WHERE entity_type = 'feature'
      ORDER BY field_key
    `);

    console.log('[Field keys for features]:');
    result.recordset.forEach(r => console.log('  -', r.field_key));

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

checkFieldKeys();
