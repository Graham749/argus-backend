# Argus: Hackathon Overview & Development Request

## The Hackathon (Aurora AI Prototyping Offsite)

**Event:** Aurora Energy Research AI prototyping offsite (~150 people, 21 cross-functional teams)  
**Date:** June 2026  
**Format:** One-day journey: problem framing → solution design → prototype build  
**Graham's Role:** Team 20 — client-intelligence team

---

## What Is Argus?

**Argus** is a **client intelligence dashboard** built by Team 20 to unify account manager insights in one place.

### Purpose
Help Aurora account managers:
- ✅ See real-time client health (usage, churn risk, renewal dates)
- ✅ Spot escalations and support patterns
- ✅ Prepare for client calls with pre-call briefings
- ✅ Ask questions about portfolio patterns (AI chat)

### Current Data Sources
- **Salesforce:** Subscription data, ARR, churn risk, renewal dates
- **Posthog:** User engagement, feature adoption
- **Zendesk:** Support tickets, escalations, resolution times
- **ProductBoard:** Feature requests, roadmap context
- **Market Intelligence:** Public data per client sector

### Views (MVP)
1. **Client Health Card** — Unified signals from Salesforce + Posthog + Zendesk
2. **Ask Argus** — Chat interface asking cross-portfolio questions
3. **Pre-Call Briefing** — Auto-generated 5-min context before client calls

### Current State
- ✅ Prototype working (single-file HTML + Node.js backend)
- ✅ Connected to Fabric Lakehouse (medallion architecture: Bronze→Silver→Gold)
- ✅ Backend APIs running on localhost:3001
- ✅ Salesforce integration live (subscription data flowing)
- 🔄 Ready for production hardening

---

## Development Request

**Ask:** Azure App Service infrastructure & development support to move Argus from prototype → production

**Scope:**
1. **App Service deployment** — Node.js backend + static frontend hosting
2. **Database connectivity** — Persistent Fabric Lakehouse integration
3. **Authentication & authorization** — Azure AD integration for Aurora staff
4. **Monitoring & observability** — Application Insights for health tracking
5. **CI/CD pipeline** — Automated deployments from git

**Timeline:** TBD (waiting for development team assignment)

**Contact Raised:** Graham Clark (Product Operations) — [date: 2026-06-26]

---

## 🎯 Critical Context: Fabric Lakehouse as Single Source of Truth

**All Argus data flows from the Microsoft Fabric Lakehouse.**

The Fabric Lakehouse uses a **medallion architecture** (Bronze→Silver→Gold) where:
- Raw data is ingested and deduplicated
- Business logic and transformations happen in middle layers
- Curated views power analytics and applications like Argus

**This is non-negotiable for production:** Argus must remain a consumer of Fabric views, not duplicate data or create alternative data pipelines. The Lakehouse is the enterprise truth source.

---

## What We've Built (June 2026)

### Fabric Medallion Data Platform
**Status:** Core infrastructure COMPLETE ✅

| Layer | Purpose | Status | Scale |
|-------|---------|--------|-------|
| **Bronze** | Raw ingestion from Salesforce, Posthog, Zendesk, ProductBoard | Deployed | 20 tables |
| **Silver** | Validated, deduplicated business views (Product Ops owns this) | Deployed | 41 views |
| **Gold** | Curated analytics views (powers Argus, BI tools) | Deployed | 5 views |

**Key Gold Views Powering Argus:**
- `v_gold_sf_subscriptions` — Account subscriptions with FX conversion (live)
- `v_gold_lookup_fxrates` — Multi-currency ARR calculations (live)
- `v_gold_pb_feature_prioritization` — Feature context for briefings (deployed)

### Argus Application
**Status:** Production-ready prototype ✅

**Backend (Node.js):**
- ✅ `/api/accounts/:accountName` — Subscription details + health
- ✅ `/api/accounts-list` — All accounts (100+ loaded)
- ✅ `/api/build-status` — Medallion layer metrics
- ✅ `/api/features` — Feature prioritization data
- ✅ Real-time data — Syncs from Fabric every 5 minutes

**Frontend (x-dc template engine):**
- ✅ Client health card — Salesforce + Posthog + Zendesk signals
- ✅ Pre-call briefing — Auto-generated account context
- ✅ Ask Argus — Chat interface for cross-portfolio insights
- ✅ Build Status widget — Medallion architecture transparency
- ✅ Responsive sidebar — Fixed navigation, collapse toggle
- ✅ Multi-currency ARR — Live FX conversion (EUR, AUD, GBP, etc.)

### UI/UX Polish (June 25-26)
- ✅ Fixed sidebar navigation (stays visible while scrolling)
- ✅ Sidebar collapse toggle (persistent user preference)
- ✅ Build Status clickable cards (expand to view detail sections)
- ✅ Argus Logo in banner (branded)
- ✅ Responsive layouts (desktop-first, mobile TBD)

---

## Technical Architecture

```
Aurora Data Sources (Salesforce, Posthog, Zendesk, ProductBoard)
            ↓
   Fabric Lakehouse (Medallion) ← SINGLE SOURCE OF TRUTH
     Bronze → Silver → Gold
            ↓
   Argus Backend (Node.js) ← Reads from Gold layer only
        /api/* endpoints
            ↓
   Argus Frontend (x-dc template engine) ← Consumes backend APIs
        Dashboard UI
```

**Medallion Architecture Detail:**
- **Bronze (20 tables):** Raw from Salesforce, Posthog, Zendesk, ProductBoard
  - No transformations, minimal deduplication
  - Full audit trail of ingestion timestamps
  
- **Silver (41 views):** Business-logic layer (Product Ops maintains)
  - Deduplicates by latest timestamp
  - Extracts nested JSON fields
  - Validates data quality
  - Joins products to subscriptions
  
- **Gold (5 views):** Analytics-ready curated layer
  - Multi-currency ARR with live FX conversion
  - Account health scoring
  - Renewal date logic (3 sources, best pick)
  - Feature prioritization with region weighting

---

## Implementation Status (as of 2026-06-26)

### Data Platform
- 🟢 **Fabric Lakehouse:** Live and syncing (5-minute refresh)
- 🟢 **Bronze:** 20 tables, all ingesting cleanly
- 🟢 **Silver:** 41 views, deduplicated and validated
- 🟢 **Gold:** 5 views powering analytics/BI/Argus

### Argus Application
- 🟢 **Backend APIs:** 5 endpoints live, zero errors
- 🟢 **Salesforce Integration:** 100+ accounts, real subscriptions
- 🟢 **Multi-currency Support:** Live FX rates (EUR, AUD, USD, JPY, etc.)
- 🟢 **Account Health:** Churn risk (URGENT/AT_RISK/HEALTHY)
- 🟢 **Renewal Logic:** 3-source best-pick (ContractSecuredUntilDate, End_Date, NoticeDate)
- 🟢 **Dashboard:** 3 views + Build Status widget working

### Code Quality & Ops
- 🟢 **Git tracked:** 60+ commits, clean main branch
- 🟢 **UI/UX complete:** Fixed sidebar, responsive layouts, logo branding
- 🟢 **Error handling:** Proper HTTP status codes, timeout management
- 🟢 **Monitoring:** Syncedago timestamp, API health checks

### Known Gaps (Ready for Azure team)
- 🔄 **Production deployment:** Needs App Service configuration
- 🔄 **Authentication:** Hardcoded to localhost; needs Azure AD
- 🔄 **Data persistence:** Local testing only; needs Fabric connection pooling
- 🔄 **Mobile:** Desktop-first responsive, mobile UX not tested
- 🔄 **Monitoring/Alerts:** Application Insights integration needed

---

## Next Steps

1. **Azure team assignment** — Identify development lead
2. **Architecture review** — Azure App Service suitability
3. **Security & compliance** — Azure AD, data residency, audit logging
4. **Deployment plan** — Staging → production rollout
5. **Go-live preparation** — Training, monitoring, support playbook

---

**Contact:** Graham Clark | Product Operations  
**Last Updated:** 2026-06-26
