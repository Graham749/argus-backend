const { execSync } = require('child_process');
const sql = require('mssql');

async function fixDuplicates() {
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
    console.log('[Fix] Connected');

    console.log('[Fixing v_silver_pb_features - GROUP BY feature_id only]');
    await conn.request().query(`
      CREATE OR ALTER VIEW [dbo].[v_silver_pb_features] AS
      SELECT
        f.id AS feature_id,
        MAX(f.name) AS feature_name,
        MAX(CASE WHEN fc.field_name = 'Archived' THEN ea.field_value END) AS [Archived],
        MAX(CASE WHEN fc.field_name = 'Comments' THEN ea.field_value END) AS [Comments],
        MAX(CASE WHEN fc.field_name = 'Complexity (T-shirt size)' THEN ea.field_value END) AS [Complexity (T-shirt size)],
        MAX(CASE WHEN fc.field_name = 'Core Comments' THEN ea.field_value END) AS [Core Comments],
        MAX(CASE WHEN fc.field_name = 'Core Mod' THEN ea.field_value END) AS [Core Mod],
        MAX(CASE WHEN fc.field_name = 'Core Priority' THEN ea.field_value END) AS [Core Priority],
        MAX(CASE WHEN fc.field_name = 'Country priority' THEN ea.field_value END) AS [Country priority],
        MAX(CASE WHEN fc.field_name = 'Criticality' THEN ea.field_value END) AS [Criticality],
        MAX(CASE WHEN fc.field_name = 'Delivery' THEN ea.field_value END) AS [Delivery],
        MAX(CASE WHEN fc.field_name = 'Description' THEN ea.field_value END) AS [Description],
        MAX(CASE WHEN fc.field_name = 'Dev' THEN ea.field_value END) AS [Dev],
        MAX(CASE WHEN fc.field_name = 'Efficiency Impact' THEN ea.field_value END) AS [Efficiency Impact],
        MAX(CASE WHEN fc.field_name = 'Effort (# Weeks)' THEN ea.field_value END) AS [Effort (# Weeks)],
        MAX(CASE WHEN fc.field_name = 'End Date' THEN ea.field_value END) AS [End Date],
        MAX(CASE WHEN fc.field_name = 'FeatureOwner' THEN ea.field_value END) AS [FeatureOwner],
        MAX(CASE WHEN fc.field_name = 'Frequency of use per year per user' THEN ea.field_value END) AS [Frequency of use per year per user],
        MAX(CASE WHEN fc.field_name = 'Granularity' THEN ea.field_value END) AS [Granularity],
        MAX(CASE WHEN fc.field_name = 'Health' THEN ea.field_value END) AS [Health],
        MAX(CASE WHEN fc.field_name = 'High Level Priority' THEN ea.field_value END) AS [High Level Priority],
        MAX(CASE WHEN fc.field_name = 'Internal adoption' THEN ea.field_value END) AS [Internal adoption],
        MAX(CASE WHEN fc.field_name = 'Japan Priority' THEN ea.field_value END) AS [Japan Priority],
        MAX(CASE WHEN fc.field_name = 'Modelling' THEN ea.field_value END) AS [Modelling],
        MAX(CASE WHEN fc.field_name = 'Name' THEN ea.field_value END) AS [Name],
        MAX(CASE WHEN fc.field_name = 'No. of client rating as critical (estimate)' THEN ea.field_value END) AS [No. of client rating as critical (estimate)],
        MAX(CASE WHEN fc.field_name = 'No. of client rating as important (estimate)' THEN ea.field_value END) AS [No. of client rating as important (estimate)],
        MAX(CASE WHEN fc.field_name = 'No. of client rating as nice to have (estimate)' THEN ea.field_value END) AS [No. of client rating as nice to have (estimate)],
        MAX(CASE WHEN fc.field_name = 'Number of users' THEN ea.field_value END) AS [Number of users],
        MAX(CASE WHEN fc.field_name = 'Owner' THEN ea.field_value END) AS [Owner],
        MAX(CASE WHEN fc.field_name = 'QA & test' THEN ea.field_value END) AS [QA & test],
        MAX(CASE WHEN fc.field_name = 'Region (Market)' THEN ea.field_value END) AS [Region (Market)],
        MAX(CASE WHEN fc.field_name = 'Regional Coverage' THEN ea.field_value END) AS [Regional Coverage],
        MAX(CASE WHEN fc.field_name = 'Regional Mod' THEN ea.field_value END) AS [Regional Mod],
        MAX(CASE WHEN fc.field_name = 'Regional Priority' THEN ea.field_value END) AS [Regional Priority],
        MAX(CASE WHEN fc.field_name = 'Regional Priority Comment' THEN ea.field_value END) AS [Regional Priority Comment],
        MAX(CASE WHEN fc.field_name = 'Release Note/Documentation' THEN ea.field_value END) AS [Release Note/Documentation],
        MAX(CASE WHEN fc.field_name = 'Release type' THEN ea.field_value END) AS [Release type],
        MAX(CASE WHEN fc.field_name = 'Requirements' THEN ea.field_value END) AS [Requirements],
        MAX(CASE WHEN fc.field_name = 'Research' THEN ea.field_value END) AS [Research],
        MAX(CASE WHEN fc.field_name = 'Robustness Testing' THEN ea.field_value END) AS [Robustness Testing],
        MAX(CASE WHEN fc.field_name = 'SW Product' THEN ea.field_value END) AS [SW Product],
        MAX(CASE WHEN fc.field_name = 'Shaping Complete' THEN ea.field_value END) AS [Shaping Complete],
        MAX(CASE WHEN fc.field_name = 'Shaping Start' THEN ea.field_value END) AS [Shaping Start],
        MAX(CASE WHEN fc.field_name = 'Specification' THEN ea.field_value END) AS [Specification],
        MAX(CASE WHEN fc.field_name = 'Start Date' THEN ea.field_value END) AS [Start Date],
        MAX(CASE WHEN fc.field_name = 'Status' THEN ea.field_value END) AS [Status],
        MAX(CASE WHEN fc.field_name = 'Submission cycle' THEN ea.field_value END) AS [Submission cycle],
        MAX(CASE WHEN fc.field_name = 'Tags' THEN ea.field_value END) AS [Tags],
        MAX(CASE WHEN fc.field_name = 'Teams' THEN ea.field_value END) AS [Teams],
        MAX(CASE WHEN fc.field_name = 'Time saving per use' THEN ea.field_value END) AS [Time saving per use],
        MAX(CASE WHEN fc.field_name = 'Time saving per use in day' THEN ea.field_value END) AS [Time saving per use in day],
        MAX(CASE WHEN fc.field_name = 'Timeframe' THEN ea.field_value END) AS [Timeframe],
        MAX(CASE WHEN fc.field_name = 'Underlying problem' THEN ea.field_value END) AS [Underlying problem],
        MAX(CASE WHEN fc.field_name = 'Value risk' THEN ea.field_value END) AS [Value risk],
        MAX(CASE WHEN fc.field_name = 'Work progress' THEN ea.field_value END) AS [Work progress],
        MAX(CASE WHEN fc.field_name = '# Dev' THEN ea.field_value END) AS [# Dev],
        MAX(CASE WHEN fc.field_name = '# Mod' THEN ea.field_value END) AS [# Mod],
        MAX(CASE WHEN fc.field_name = 'Actual End Date' THEN ea.field_value END) AS [Actual End Date],
        MAX(CASE WHEN fc.field_name = 'Actual Start Time' THEN ea.field_value END) AS [Actual Start Time]
      FROM [dbo].[bronze_pb_features] f
      LEFT JOIN [dbo].[silver_pb_entity_attributes] ea
        ON f.id = ea.entity_id
        AND ea.entity_type = 'feature'
      LEFT JOIN [dbo].[bronze_pb_entity_fields_config] fc
        ON ea.field_key = fc.field_id
        AND fc.entity_type = 'feature'
      GROUP BY f.id;
    `);
    console.log('✅ v_silver_pb_features fixed');

    // Verify
    const count = await conn.request().query(
      'SELECT COUNT(DISTINCT feature_id) as distinct_features, COUNT(*) as total_rows FROM [dbo].[v_silver_pb_features]'
    );
    console.log(`\nDistinct features: ${count.recordset[0].distinct_features}, Total rows: ${count.recordset[0].total_rows}`);

    if (count.recordset[0].distinct_features === count.recordset[0].total_rows) {
      console.log('✅ No duplicates!');
    } else {
      console.log(`❌ Still has ${count.recordset[0].total_rows - count.recordset[0].distinct_features} duplicate rows`);
    }

    await conn.close();
    console.log('\n✅ Done!');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

fixDuplicates();
