-- ============================================================================
-- INVESTIGATE DUPLICATE FEATURES IN BRONZE LAYER
-- Purpose: Understand why we have 5807+ rows vs expected 3405 unique features
-- ============================================================================

-- 1. DUPLICATE SUMMARY
-- Shows which features appear multiple times
SELECT TOP 20
  id,
  COUNT(*) as row_count,
  COUNT(DISTINCT name) as name_variants,
  COUNT(DISTINCT archived) as archived_variants,
  COUNT(DISTINCT updatedAt) as update_variants,
  COUNT(DISTINCT _bronze_ingestion_timestamp) as ingestion_variants,
  MIN(updatedAt) as earliest_update,
  MAX(updatedAt) as latest_update,
  STRING_AGG(DISTINCT CAST(archived AS VARCHAR), ', ') as archived_values
FROM [dbo].[bronze_pb_features]
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY row_count DESC;

-- 2. LATEST VERSION PER FEATURE
-- Take only the most recent version of each feature
WITH LatestPerFeature AS (
  SELECT
    id,
    name,
    archived,
    updatedAt,
    _bronze_ingestion_timestamp,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY updatedAt DESC, _bronze_ingestion_timestamp DESC) as rn
  FROM [dbo].[bronze_pb_features]
)
SELECT
  COUNT(DISTINCT id) as unique_features,
  SUM(CASE WHEN archived = 0 OR archived = 'false' THEN 1 ELSE 0 END) as not_archived,
  SUM(CASE WHEN archived = 1 OR archived = 'true' THEN 1 ELSE 0 END) as archived,
  COUNT(*) as total_latest_rows
FROM LatestPerFeature
WHERE rn = 1;

-- 3. LATEST VERSION WITH ARCHIVE BREAKDOWN
WITH LatestPerFeature AS (
  SELECT
    id,
    archived,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY updatedAt DESC, _bronze_ingestion_timestamp DESC) as rn
  FROM [dbo].[bronze_pb_features]
)
SELECT
  archived,
  COUNT(*) as unique_feature_count
FROM LatestPerFeature
WHERE rn = 1
GROUP BY archived
ORDER BY archived;

-- 4. DISTRIBUTION BY TIMESTAMP
-- See how many features in each ingestion snapshot
SELECT
  _bronze_ingestion_timestamp,
  COUNT(DISTINCT id) as unique_features,
  COUNT(*) as total_rows
FROM [dbo].[bronze_pb_features]
GROUP BY _bronze_ingestion_timestamp
ORDER BY _bronze_ingestion_timestamp DESC;

-- 5. CUMULATIVE UNIQUE COUNT
-- Show running total of unique features by date
SELECT
  _bronze_ingestion_timestamp,
  COUNT(DISTINCT id) OVER (ORDER BY _bronze_ingestion_timestamp DESC) as cumulative_unique
FROM (
  SELECT DISTINCT
    _bronze_ingestion_timestamp,
    id
  FROM [dbo].[bronze_pb_features]
) x
ORDER BY _bronze_ingestion_timestamp DESC;

-- 6. FEATURES WITH NAME CHANGES
-- Shows which features have updated their name
SELECT
  id,
  COUNT(DISTINCT name) as name_count,
  STRING_AGG(DISTINCT name, ' | ') as name_versions
FROM [dbo].[bronze_pb_features]
GROUP BY id
HAVING COUNT(DISTINCT name) > 1
ORDER BY name_count DESC;
