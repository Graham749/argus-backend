# Argus Backend

API server for the Argus dashboard — lakehouse status + feature priority from Fabric.

## Setup

### Prerequisites
- Node.js 16+
- `az` CLI installed and authenticated (`az login --tenant auroraer.com`)

### Install
```bash
npm install
```

### Configure
```bash
cp .env.example .env
```

Edit `.env` if needed (defaults point to your Fabric endpoint).

### Run locally
```bash
npm start
# or with auto-reload:
npm run dev
```

Server will listen on `http://localhost:3001`.

## API Endpoints

### Health check
```
GET /health
```
Returns `{ status: 'ok', timestamp: '...' }`

### Lakehouse status
```
GET /api/lakehouse-status
```
Returns Bronze/Silver/Gold layer metadata:
```json
{
  "bronze": { "layer": "Bronze", "count": 42, "totalRows": 15000000 },
  "silver": { "layer": "Silver", "count": 41, "totalRows": null },
  "gold": { "layer": "Gold", "count": 5, "totalRows": null },
  "lastUpdated": "2026-06-22T15:30:00Z"
}
```

### Features (from gold_feature_priority)
```
GET /api/features
```
Returns prioritized features with scoring breakdown:
```json
{
  "features": [
    {
      "featureId": "c084622a-...",
      "featureName": "Sensitivity Library",
      "criticality": "High",
      "criticalityScore": 0.75,
      "rankScore": 0.92,
      "finalPriorityScore": 85.5,
      ...
    }
  ],
  "syncedAt": "2026-06-22T15:30:00Z",
  "rowCount": 10
}
```

## Authentication

Uses `az account get-access-token` to get a fresh token. Token is cached in memory for ~55 minutes.

**Make sure you've run:** `az login --tenant auroraer.com`

## TODO

- [ ] Wire product names to features once bronze_pb_entity_fields_config available (data team)
- [ ] Add caching layer (Redis optional)
- [ ] Add filtering options (e.g., `/api/features?criticality=High`)
- [ ] Deploy to Azure App Service

## Deployment

When ready to move from laptop to Azure:

1. Create Azure App Service
2. Set environment variables in App Service config
3. Deploy via `az webapp up` or GitHub Actions
4. Update Argus frontend to point to production API URL
