-- ============================================================================
-- INVESTIGATE DUPLICATE FEATURES IN SILVER LAYER
-- Purpose: Understand data quality and deduplication in Silver views
-- ============================================================================

-- 1. SILVER VIEW SUMMARY
-- Current state of v_silver_pb_features
SELECT
  COUNT(DISTINCT feature_id) as unique_features,
  COUNT(*) as total_rows,
  SUM(CASE WHEN [Archived] LIKE '%false%' OR [Archived] IS NULL THEN 1 ELSE 0 END) as not_archived_count,
  SUM(CASE WHEN [Archived] LIKE '%true%' THEN 1 ELSE 0 END) as archived_count
FROM [dbo].[v_silver_pb_features];

-- 2. DUPLICATE ROWS IN SILVER
-- Show features appearing multiple times
SELECT TOP 20
  feature_id,
  feature_name,
  COUNT(*) as row_count,
  COUNT(DISTINCT Criticality) as criticality_variants,
  COUNT(DISTINCT [Regional Priority]) as priority_variants,
  COUNT(DISTINCT [Region (Market)]) as region_variants
FROM [dbo].[v_silver_pb_features]
GROUP BY feature_id, feature_name
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- 3. BREAKDOWN BY ARCHIVED STATUS
-- Count features by archived field
SELECT
  [Archived],
  COUNT(*) as count
FROM [dbo].[v_silver_pb_features]
GROUP BY [Archived]
ORDER BY count DESC;

-- 4. FEATURES WITH SCORING DATA
-- How many have actual field values vs NULL
SELECT
  'Criticality' as field_name,
  SUM(CASE WHEN Criticality IS NOT NULL THEN 1 ELSE 0 END) as with_value,
  SUM(CASE WHEN Criticality IS NULL THEN 1 ELSE 0 END) as null_count
FROM [dbo].[v_silver_pb_features]
UNION ALL
SELECT
  'Efficiency Impact',
  SUM(CASE WHEN [Efficiency Impact] IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN [Efficiency Impact] IS NULL THEN 1 ELSE 0 END)
FROM [dbo].[v_silver_pb_features]
UNION ALL
SELECT
  'Regional Priority',
  SUM(CASE WHEN [Regional Priority] IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN [Regional Priority] IS NULL THEN 1 ELSE 0 END)
FROM [dbo].[v_silver_pb_features]
UNION ALL
SELECT
  'Region (Market)',
  SUM(CASE WHEN [Region (Market)] IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN [Region (Market)] IS NULL THEN 1 ELSE 0 END)
FROM [dbo].[v_silver_pb_features];

-- 5. PRIORITY REGION VIEW COMPLETENESS
SELECT
  'Total Regions' as metric,
  COUNT(*) as count
FROM [dbo].[v_silver_pb_priority_region]
UNION ALL
SELECT
  'APAC Regions',
  COUNT(*)
FROM [dbo].[v_silver_pb_priority_region]
WHERE region_zone = 'APAC'
UNION ALL
SELECT
  'EMEA Regions',
  COUNT(*)
FROM [dbo].[v_silver_pb_priority_region]
WHERE region_zone = 'EMEA'
UNION ALL
SELECT
  'LATAM Regions',
  COUNT(*)
FROM [dbo].[v_silver_pb_priority_region]
WHERE region_zone = 'LATAM'
UNION ALL
SELECT
  'NORAM Regions',
  COUNT(*)
FROM [dbo].[v_silver_pb_priority_region]
WHERE region_zone = 'NORAM';

-- 6. FEATURES WITH REGIONS (GOLD READINESS CHECK)
SELECT
  SUM(CASE WHEN [Region (Market)] IS NOT NULL AND [Region (Market)] <> '' THEN 1 ELSE 0 END) as features_with_regions,
  SUM(CASE WHEN [Region (Market)] IS NULL OR [Region (Market)] = '' THEN 1 ELSE 0 END) as features_without_regions,
  COUNT(*) as total
FROM [dbo].[v_silver_pb_features];
