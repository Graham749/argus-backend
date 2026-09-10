# Argus Backend — Project Context

Argus is an internal account health dashboard for Aurora Energy Research. It surfaces PostHog usage, EOS engagement, Salesforce commercial data, Productboard feedback, and Zendesk support tickets for account managers.

## Architecture

- **Backend**: Node.js/Express (`src/server.js`)
- **Frontend**: Static HTML pages in `public/` — no build step, no framework
- **Database**: Microsoft Fabric lakehouse via Azure AD auth (`mssql` package)
- **Auth**: Cloudflare One (in production) injects `Cf-Access-Authenticated-User-Email` header

## Environments

### Dev (local)
- URL: `http://localhost:3001`
- Port: `3001`
- Auth: `az login` with graham.clark@auroraer.com
- PostHog: disabled (hostname check in `public/analytics.js`)
- `.env`:
  ```
  FABRIC_SERVER=pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com
  PORT=3001
  CORS_ORIGIN=http://localhost:3000
  ```

### Production
- URL: `https://argus.auroraer.cloud`
- Server: `srvargusinfrastructure.int.auroraer.cloud` (Windows, D:\app)
- Port: `8501` (routed to argus.auroraer.cloud via ALB)
- Auth: Cloudflare One — user email available in `Cf-Access-Authenticated-User-Email` header
- PostHog: enabled — EU cloud, project `270193`
- App runs as Windows service via NSSM (`ArgusApp`)
- `.env` on server:
  ```
  FABRIC_SERVER=pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com
  PORT=8501
  CORS_ORIGIN=https://argus.auroraer.cloud
  ```

## Key files

| File | Purpose |
|---|---|
| `src/server.js` | Express app, all routes registered here |
| `src/api/*.js` | One file per API endpoint |
| `src/lib/db.js` | Fabric SQL connection pool + `query()` helper |
| `src/lib/mdm-cache.js` | MDM account cache |
| `src/api/current-user.js` | Returns authed user — reads Cloudflare header in prod, falls back to graham.clark@auroraer.com in dev |
| `public/analytics.js` | PostHog init + identify — skips on localhost |
| `mcp/server.js` | Separate MCP server for Claude Desktop (not part of the web app) |

## Data sources (gold tables in Fabric)

All API queries hit materialised gold tables in `dbo.*` on the Fabric lakehouse. Key tables:

- `gold_sf_customer_accounts`, `gold_sf_subscriptions`, `gold_sf_opportunities`, `gold_sf_cases`
- `gold_mdm_account`, `gold_mdm_posthog`, `gold_mdm_eos_engagement`
- `gold_posthog_account_activity`
- `gold_pb_features`, `gold_pb_notes`, `gold_pb_note_company_feature`, `gold_pb_path_note_company`, `gold_pb_feature_prioritization_final`

## Running locally

```bash
npm install
# ensure az login is active
npm run dev   # node --watch src/server.js on port 3001
```

## Deploying to production (day-to-day)

From your laptop:
```
git push origin main
```

Then RDP to `srvargusinfrastructure.int.auroraer.cloud` (user: `aersoftware`, requires Cloudflare One):
```
cd D:\app
git pull
nssm restart ArgusApp
```

Static files in `public/` are served on next request — no rebuild needed. Check `D:\app\app.log` if the service fails to start.

## First-time production setup (one-off)

Run once on a fresh server to install and configure the service.

### 1. Prerequisites
- Install [Node.js LTS](https://nodejs.org) — accept defaults, ensure "Add to PATH" is checked
- Install [Git for Windows](https://git-scm.com) — accept defaults
- Install [NSSM](https://nssm.cc/download) — extract to `C:\nssm\` and add `C:\nssm\win64\` to system PATH

### 2. Clone repo and install dependencies
```
cd D:\
mkdir app
cd app
git clone <repo-url> .
npm install
```

### 3. Create .env
Create `D:\app\.env` with:
```
FABRIC_SERVER=pv6dzlli723u5jswg27zhty5be-qhcpisfudclelcjaerq6yrhgee.datawarehouse.fabric.microsoft.com
PORT=8501
CORS_ORIGIN=https://argus.auroraer.cloud
```

### 4. Configure NSSM service
Run in an elevated (Admin) command prompt:
```
nssm install ArgusApp "C:\Program Files\nodejs\node.exe"
nssm set ArgusApp AppParameters "D:\app\src\server.js"
nssm set ArgusApp AppDirectory "D:\app"
nssm set ArgusApp AppStdout "D:\app\app.log"
nssm set ArgusApp AppStderr "D:\app\app.log"
nssm set ArgusApp Start SERVICE_AUTO_START
nssm start ArgusApp
```

### 5. Verify
- `nssm status ArgusApp` → should show `SERVICE_RUNNING`
- Browse to `http://localhost:8501` from the server to confirm Node is responding
- Check `D:\app\app.log` for any startup errors
- Confirm `https://argus.auroraer.cloud` resolves correctly (ALB routes :443 → :8501)
