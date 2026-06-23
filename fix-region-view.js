const { execSync } = require('child_process');
const sql = require('mssql');

async function fixRegionView() {
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

    console.log('[Deploying v_silver_pb_priority_region...]');
    await conn.request().query(`
      CREATE OR ALTER VIEW [dbo].[v_silver_pb_priority_region] AS
      WITH RegionJsonParsed AS (
        SELECT DISTINCT
          TRIM(JSON_VALUE(j.value, '$.name')) AS region_market
        FROM [dbo].[v_silver_pb_features] f
        CROSS APPLY OPENJSON(f.[Region (Market)]) j
        WHERE f.[Region (Market)] IS NOT NULL
          AND f.[Region (Market)] <> ''
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

    // Verify
    const count = await conn.request().query(
      'SELECT COUNT(DISTINCT region_market) as distinct_regions, COUNT(*) as total_rows FROM [dbo].[v_silver_pb_priority_region]'
    );
    console.log(`\nDistinct regions: ${count.recordset[0].distinct_regions}, Total rows: ${count.recordset[0].total_rows}`);

    if (count.recordset[0].distinct_regions === count.recordset[0].total_rows) {
      console.log('✅ No duplicates!');
    }

    await conn.close();
    console.log('\n✅ Done!');
  } catch (err) {
    console.error('[Error]', err.message);
    process.exit(1);
  }
}

fixRegionView();
