const { execSync } = require('child_process');
const sql = require('mssql');

async function debug() {
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

    // Check exact field names in config
    console.log('[Step 1] All field_names in bronze_pb_entity_fields_config:');
    const namesResult = await conn.request().query(`
      SELECT DISTINCT field_name, entity_type
      FROM [dbo].[bronze_pb_entity_fields_config]
      ORDER BY field_name
    `);
    namesResult.recordset.forEach(r => {
      console.log(`  "${r.field_name}" (${r.entity_type})`);
    });

    // Count matching records
    console.log('\n[Step 2] Sample join test:');
    const joinResult = await conn.request().query(`
      SELECT TOP 20
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
      WHERE ea.field_key IS NOT NULL
      ORDER BY f.id, ea.field_key
    `);

    console.table(joinResult.recordset);

    await conn.close();
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

debug();
