# Argus ↔ Fabric Metadata API

Auto-discover and display Fabric views in Argus Build Status widget.

## Architecture

```
Fabric Lakehouse (SQL Endpoint)
       ↓
[INFORMATION_SCHEMA.TABLES] — all views
       ↓
Node.js API (api-fabric-metadata.js)
  ├─ GET /api/data-sources — Full metadata
  ├─ GET /api/data-sources/minimal — View names only
  ├─ GET /api/build-status — Widget format
  └─ GET /api/health — Connection check
       ↓
Argus Frontend (argus-fabric-sync.js)
  └─ Auto-syncs every 5 minutes
  └─ Updates Build Status widget
```

## Setup

### 1. Start the API Server

```bash
cd /c/Users/GrahamClark/argus-backend
node api-fabric-metadata.js
```

Expected output:
```
[API] Connected to Fabric
[API] Fabric metadata API running on http://localhost:3000
  GET /api/data-sources — Full metadata
  GET /api/data-sources/minimal — View names only
  GET /api/build-status — Build Status widget format
  GET /api/health — Health check
```

### 2. Check Health

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{ "status": "connected", "fabric": "ready" }
```

### 3. Get Data Sources

```bash
curl http://localhost:3000/api/data-sources/minimal
```

Response:
```json
{
  "Productboard": [
    "v_silver_pb_features",
    "v_gold_pb_feature_prioritization",
    "v_gold_pb_feature_prioritization_final"
  ],
  "Salesforce": [ ... ],
  "Product Operations": [
    "v_silver_lookup_regional_priority_rank",
    "v_silver_lookup_criticality_score",
    "v_silver_lookup_efficiency_score",
    "v_silver_lookup_region_factor",
    "v_silver_lookup_strategic_regions"
  ],
  "Posthog": [ ... ],
  "Zendesk": [ ... ],
  "Jira": [ ... ]
}
```

### 4. Integrate with Argus HTML

Add to Argus `<head>`:
```html
<script src="/api/argus-fabric-sync.js"></script>
```

Add widget container:
```html
<div id="build-status-widget"></div>
```

Initialize sync:
```html
<script>
  // Start auto-sync on page load
  document.addEventListener('DOMContentLoaded', () => {
    window.syncDataSources();
  });
</script>
```

Or for Node.js environment:
```javascript
const { startAutoSync } = require('./argus-fabric-sync.js');
startAutoSync(5 * 60 * 1000); // Sync every 5 minutes
```

## API Endpoints

### `GET /api/data-sources`
Full metadata for all views and sources.

**Response:**
```json
{
  "status": "success",
  "timestamp": "2026-06-22T...",
  "dataSources": {
    "Productboard": [
      {
        "name": "v_silver_pb_features",
        "schema": "dbo",
        "type": "VIEW"
      },
      ...
    ]
  },
  "summary": {
    "total": 27,
    "sources": 6
  }
}
```

### `GET /api/data-sources/minimal`
Just view names grouped by source (for UI).

**Response:**
```json
{
  "Productboard": ["v_silver_pb_features", "v_gold_pb_feature_prioritization", ...],
  "Salesforce": [...],
  "Product Operations": [
    "v_silver_lookup_regional_priority_rank",
    "v_silver_lookup_criticality_score",
    ...
  ]
}
```

### `GET /api/build-status`
Formatted for Argus Build Status widget.

**Response:**
```json
{
  "primary": {
    "title": "Medallion Layer Data Sources",
    "sources": {
      "Productboard": { "views": 3, "status": "ready", "updated": "..." },
      "Salesforce": { "views": 2, "status": "ready", "updated": "..." },
      "Product Operations": { "views": 5, "status": "ready", "updated": "..." }
    }
  },
  "secondary": {
    "title": "Observability & Support",
    "sources": {
      "Posthog": { "views": ..., "status": "ready", ... },
      "Zendesk": { "views": ..., "status": "ready", ... },
      "Jira": { "views": ..., "status": "ready", ... }
    }
  }
}
```

### `GET /api/health`
Connection health check.

**Response:**
```json
{ "status": "connected", "fabric": "ready" }
```

## Data Source Categorization

Views are automatically categorized by name pattern:

| Pattern | Source |
|---------|--------|
| `*_pb_*` | Productboard |
| `*_sf_*` | Salesforce |
| `*_lookup_*` OR `*_prioritization*` | **Product Operations** |
| `*_posthog_*` | Posthog |
| `*_zendesk_*` | Zendesk |
| `*_jira_*` | Jira |
| Other | Other |

## Environment Variables

```bash
# API port (default: 3000)
export PORT=3000

# Fabric API base (for Argus frontend)
export FABRIC_API_URL=http://localhost:3000/api
```

## Build Status UI Layout

**Tier 1 — Medallion Layer (Primary)**
- Productboard
- Salesforce
- **Product Operations** ← New

**Tier 2 — Observability & Support (Secondary)**
- Posthog
- Zendesk
- Jira

## Troubleshooting

**"Cannot connect to Fabric"**
- Ensure `az login` is authenticated
- Check Fabric SQL endpoint is accessible
- Verify token acquisition: `az account get-access-token --resource https://database.windows.net/`

**"No views found"**
- Check views are named with `v_*` or `lu_*` prefix
- Verify schema is `dbo`
- Query directly: `SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'VIEW'`

**"API not responding"**
- Check server is running: `curl http://localhost:3000/api/health`
- Check logs for connection errors
- Verify port 3000 is not in use (or set `PORT=3001`)
