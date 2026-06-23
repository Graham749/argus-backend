-- ============================================================================
-- FIND WHAT FILTER PRODUCES 3405 FEATURES
-- ============================================================================

-- Option 1: By Status field
SELECT
  status,
  COUNT(DISTINCT id) as unique_count
FROM [dbo].[bronze_pb_features]
GROUP BY status
ORDER BY unique_count DESC;

-- Option 2: By Type field
SELECT
  type,
  COUNT(DISTINCT id) as unique_count
FROM [dbo].[bronze_pb_features]
GROUP BY type
ORDER BY unique_count DESC;

-- Option 3: Features with parent relationship (not orphaned)
SELECT
  CASE WHEN parent IS NOT NULL AND parent <> '' THEN 'Has Parent' ELSE 'No Parent' END as parent_status,
  COUNT(DISTINCT id) as unique_count
FROM [dbo].[bronze_pb_features]
GROUP BY CASE WHEN parent IS NOT NULL AND parent <> '' THEN 'Has Parent' ELSE 'No Parent' END;

-- Option 4: By archived + specific status
WITH LatestPerFeature AS (
  SELECT
    id,
    archived,
    status,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY updatedAt DESC) as rn
  FROM [dbo].[bronze_pb_features]
)
SELECT
  archived,
  status,
  COUNT(*) as count
FROM LatestPerFeature
WHERE rn = 1
GROUP BY archived, status
ORDER BY count DESC;

-- Option 5: Check if 3405 = specific subset
-- Try: not archived + has parent
WITH LatestPerFeature AS (
  SELECT
    id,
    archived,
    parent,
    ROW_NUMBER() OVER (PARTITION BY id ORDER BY updatedAt DESC) as rn
  FROM [dbo].[bronze_pb_features]
)
SELECT
  'Not Archived + Has Parent' as filter_desc,
  COUNT(DISTINCT id) as result_count
FROM LatestPerFeature
WHERE rn = 1 AND archived = 0
UNION ALL
SELECT
  'Not Archived + No Parent',
  COUNT(DISTINCT id)
FROM LatestPerFeature
WHERE rn = 1 AND archived = 0 AND (parent IS NULL OR parent = '')
UNION ALL
SELECT
  'All Not Archived',
  COUNT(DISTINCT id)
FROM LatestPerFeature
WHERE rn = 1 AND archived = 0
UNION ALL
SELECT
  'Archived',
  COUNT(DISTINCT id)
FROM LatestPerFeature
WHERE rn = 1 AND archived = 1;
