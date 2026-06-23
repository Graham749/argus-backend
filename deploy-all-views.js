const { execSync } = require('child_process');
const sql = require('mssql');

async function deployViews() {
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
        requestTimeout: 60000
      }
    });

    await conn.connect();
    console.log('[Deploy] Connected to Fabric');

    // 1. v_silver_pb_features with field name mapping
    console.log('[1/5] Deploying v_silver_pb_features...');
    await conn.request().query(`
      CREATE OR ALTER VIEW [dbo].[v_silver_pb_features] AS
      SELECT
        f.id AS feature_id,
        f.name AS feature_name,
        f.description AS feature_description,
        MAX(CASE WHEN fc.field_name = 'Criticality' THEN ea.field_value END) AS criticality,
        MAX(CASE WHEN fc.field_name = 'Efficiency Impact' THEN ea.field_value END) AS efficiency_impact,
        MAX(CASE WHEN fc.field_name = 'Regional Priority' THEN TRY_CAST(ea.field_value AS FLOAT) END) AS regional_priority,
        MAX(CASE WHEN fc.field_name = 'Region (Market)' THEN ea.field_value END) AS region_market,
        f.status,
        f.owner
      FROM [dbo].[bronze_pb_features] f
      LEFT JOIN [dbo].[silver_pb_entity_attributes] ea
        ON f.id = ea.entity_id
        AND ea.entity_type = 'feature'
      LEFT JOIN [dbo].[bronze_pb_entity_fields_config] fc
        ON ea.field_key = fc.field_id
        AND fc.entity_type = 'feature'
      GROUP BY f.id, f.name, f.description, f.status, f.owner;
    `);
    console.log('✅ v_silver_pb_features deployed');

    // 2. v_silver_pb_priority_region with JSON parsing
    console.log('[2/5] Deploying v_silver_pb_priority_region...');
    await conn.request().query(`
      CREATE OR ALTER VIEW [dbo].[v_silver_pb_priority_region] AS
      WITH RegionJsonParsed AS (
        SELECT DISTINCT
          TRIM(JSON_VALUE(j.value, '$.name')) AS region_market
        FROM [dbo].[v_silver_pb_features] f
        CROSS APPLY OPENJSON(f.region_market) j
        WHERE f.region_market IS NOT NULL
          AND f.region_market <> ''
          AND JSON_VALUE(j.value, '$.name') IS NOT NULL
      ),
      UniqueRegions AS (
        SELECT DISTINCT region_market FROM RegionJsonParsed
      ),
      WithClassification AS (
        SELECT
          region_market,
          UPPER(region_market) AS region_market_norm,
          CASE
            WHEN UPPER(region_market) LIKE '%NODAL%' THEN 'UNCLASSIFIED'
            WHEN UPPER(region_market) LIKE '%WORLD%' THEN 'UNCLASSIFIED'
            WHEN UPPER(region_market) LIKE '%CORE%' THEN 'UNCLASSIFIED'
            WHEN UPPER(region_market) LIKE '%EXTERNAL%' THEN 'UNCLASSIFIED'
            WHEN UPPER(region_market) LIKE '%AUS%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%AUSTRALIA%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%APAC%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%IND%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%JPN%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%JAPAN%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%KOR%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%PHL%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%CHN%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%CHINA%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%SGP%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%MYS%' THEN 'APAC'
            WHEN UPPER(region_market) LIKE '%BRA%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE '%CHL%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE '%PER%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE '%MEX%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE '%LATAM%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE '%COL%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE '%COLUMBIA%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE '%COLOMBIA%' THEN 'LATAM'
            WHEN UPPER(region_market) LIKE 'US %' THEN 'NORAM'
            WHEN UPPER(region_market) LIKE 'US (%' THEN 'NORAM'
            WHEN UPPER(region_market) LIKE '%USA%' THEN 'NORAM'
            WHEN UPPER(region_market) LIKE '%NORAM%' THEN 'NORAM'
            WHEN UPPER(region_market) LIKE '%ALBERTA%' THEN 'NORAM'
            WHEN UPPER(region_market) LIKE '%ONTARIO%' THEN 'NORAM'
            WHEN UPPER(region_market) LIKE '%CANADA%' THEN 'NORAM'
            WHEN UPPER(region_market) LIKE '%EMEA%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%CEE%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%NOD%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%IBE%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%FRA%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%DEU%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%GBR%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%IRX%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%IRELAND%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%ITA%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%SWE%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%SVK%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%CZE%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%TUR%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%BALTIC%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%NLD%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%BEL%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%ZAF%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%SEE%' THEN 'EMEA'
            WHEN UPPER(region_market) LIKE '%WEST BALKANS%' THEN 'EMEA'
            ELSE 'UNCLASSIFIED'
          END AS region_zone
        FROM UniqueRegions
      ),
      WithCounts AS (
        SELECT
          region_market,
          region_zone,
          CASE
            WHEN UPPER(TRIM(region_market)) = 'WORLDWIDE' THEN 16
            WHEN UPPER(TRIM(region_market)) = 'APAC' THEN 10
            WHEN UPPER(TRIM(region_market)) = 'EMEA' THEN 12
            WHEN UPPER(TRIM(region_market)) = 'LATAM' THEN 6
            WHEN UPPER(TRIM(region_market)) = 'NORAM' THEN 8
            WHEN UPPER(TRIM(region_market)) IN ('CORE-LED', 'CORE LED', 'CORE', 'CORE-DRIVEN', 'CORE DRIVEN') THEN 8
            WHEN UPPER(TRIM(region_market)) IN ('EXTERNAL ORIGIN REGIONS', 'NODAL REGIONS') THEN 8
            ELSE 1
          END AS region_count,
          CASE
            WHEN UPPER(TRIM(region_market)) IN ('WORLDWIDE', 'APAC', 'EMEA', 'LATAM', 'NORAM', 'CORE-LED', 'CORE LED', 'CORE', 'CORE-DRIVEN', 'CORE DRIVEN', 'EXTERNAL ORIGIN REGIONS', 'NODAL REGIONS')
              THEN 1
            ELSE 0
          END AS zone_flag
        FROM WithClassification
      ),
      WithSort AS (
        SELECT
          region_market,
          region_zone,
          region_count,
          zone_flag,
          CASE
            WHEN region_zone = 'UNCLASSIFIED' THEN 0
            WHEN region_zone = 'APAC' THEN 1
            WHEN region_zone = 'EMEA' THEN 2
            WHEN region_zone = 'LATAM' THEN 3
            WHEN region_zone = 'NORAM' THEN 4
            ELSE 9
          END AS sort_order,
          CASE
            WHEN zone_flag = 1 THEN 0
            ELSE 1
          END AS market_sort_order
        FROM WithCounts
      )
      SELECT
        region_market,
        region_zone,
        sort_order,
        market_sort_order,
        region_count,
        zone_flag
      FROM WithSort;
    `);
    console.log('✅ v_silver_pb_priority_region deployed');

    // 3. v_silver_pb_subfeatures with field name mapping
    console.log('[3/5] Deploying v_silver_pb_subfeatures...');
    await conn.request().query(`
      CREATE OR ALTER VIEW [dbo].[v_silver_pb_subfeatures] AS
      SELECT
        sf.id AS subfeature_id,
        JSON_VALUE(sf.fields, '$.name') AS subfeature_name,
        MAX(CASE WHEN fc.field_name = 'Criticality' THEN ea.field_value END) AS criticality,
        MAX(CASE WHEN fc.field_name = 'Efficiency Impact' THEN ea.field_value END) AS efficiency_impact,
        MAX(CASE WHEN fc.field_name = 'Regional Priority' THEN TRY_CAST(ea.field_value AS FLOAT) END) AS regional_priority,
        MAX(CASE WHEN fc.field_name = 'Region (Market)' THEN ea.field_value END) AS region_market
      FROM [dbo].[bronze_pb_subfeatures] sf
      LEFT JOIN [dbo].[silver_pb_entity_attributes] ea
        ON sf.id = ea.entity_id
        AND ea.entity_type = 'subfeature'
      LEFT JOIN [dbo].[bronze_pb_entity_fields_config] fc
        ON ea.field_key = fc.field_id
        AND fc.entity_type = 'subfeature'
      GROUP BY sf.id, JSON_VALUE(sf.fields, '$.name');
    `);
    console.log('✅ v_silver_pb_subfeatures deployed');

    // Test the views
    console.log('\n[Testing views]');
    const testResult = await conn.request().query(`
      SELECT TOP 3
        f.feature_id,
        f.feature_name,
        f.criticality,
        f.regional_priority
      FROM [dbo].[v_silver_pb_features] f
      WHERE f.criticality IS NOT NULL
      ORDER BY f.feature_id
    `);

    console.log('[Sample feature data with scoring]:');
    console.table(testResult.recordset);

    const regionResult = await conn.request().query(`
      SELECT COUNT(*) as region_count FROM [dbo].[v_silver_pb_priority_region]
    `);
    console.log(`\n[v_silver_pb_priority_region] Total unique regions: ${regionResult.recordset[0].region_count}`);

    await conn.close();
    console.log('\n✅ All views deployed successfully!');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

deployViews();
