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

## Technical Architecture

```
Aurora Data Sources (Salesforce, Posthog, Zendesk, ProductBoard)
            ↓
   Fabric Lakehouse (Medallion)
     Bronze → Silver → Gold
            ↓
   Argus Backend (Node.js)
        /api/* endpoints
            ↓
   Argus Frontend (React-like x-dc template engine)
        Dashboard UI
```

**Medallion Layers:**
- **Bronze:** Raw data ingestion (20 tables deployed)
- **Silver:** Validated business views (41 views deployed)
- **Gold:** Curated analytics views (5 views deployed, powering Argus)

---

## Key Metrics (as of 2026-06-26)

- 🟢 **API Status:** Live (accounts, build-status, features endpoints)
- 🟢 **Data Coverage:** 100+ accounts loaded from Salesforce
- 🟢 **Subscription Data:** Real-time FX conversion (multi-currency ARR → GBP)
- 🟢 **Health Dashboard:** Shows churn risk, renewals, contract types per account

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
