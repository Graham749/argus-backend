const { execSync } = require('child_process');
const sql = require('mssql');

async function createSubfeatureView() {
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

    console.log('[Creating v_silver_pb_subfeatures - Subfeatures only]');
    await conn.request().query(`
      CREATE OR ALTER VIEW [dbo].[v_silver_pb_subfeatures] AS
      SELECT DISTINCT
        sf.id AS subfeature_id,
        JSON_VALUE(sf.fields, '$.name') AS subfeature_name
      FROM [dbo].[bronze_pb_subfeatures] sf
      WHERE sf.[type] = 'subfeature' OR sf.[type] IS NULL;
    `);
    console.log('✅ v_silver_pb_subfeatures created');

    // Verify
    try {
      const count = await conn.request().query(
        'SELECT COUNT(*) as total_rows, COUNT(DISTINCT subfeature_id) as distinct_subfeatures FROM [dbo].[v_silver_pb_subfeatures]'
      );

      console.log('\nVerification:');
      console.table(count.recordset);
    } catch (e) {
      console.log('Verification query failed (may be data issue in subfeatures): ' + e.message);
    }

    await conn.close();
    console.log('\n✅ Done!');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

createSubfeatureView();
