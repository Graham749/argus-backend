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

    // Query the view
    console.log('[Querying v_silver_pb_features for scoring result]');
    const result = await conn.request().query(`
      SELECT
        feature_id,
        feature_name,
        criticality,
        efficiency_impact,
        regional_priority,
        region_market
      FROM [dbo].[v_silver_pb_features]
      WHERE feature_id = '7e925c37-7191-4fd3-a489-50c44ca2e2fe'
    `);

    if (result.recordset.length === 0) {
      console.log('NO ROWS FOUND for this feature');
    } else {
      console.table(result.recordset);
    }

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

test();
