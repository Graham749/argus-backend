const { execSync } = require('child_process');
const sql = require('mssql');

async function queryFeature() {
  try {
    // Get token
    const token = execSync(
      'az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();

    // Connect and query
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

    const query = `
      SELECT TOP 100 *
      FROM dbo.v_silver_pb_features
      WHERE feature_id = '7e925c37-7191-4fd3-a489-50c44ca2e2fe'
    `;

    const result = await conn.request().query(query);

    console.log('\n=== FEATURE SCORING DATA ===\n');
    console.table(result.recordset);

    if (result.recordset.length === 0) {
      console.log('No data found for this feature ID');
    }

    await conn.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

queryFeature();
