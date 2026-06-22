# Argus Build Status — Phase 2 Enhancements

## Completed (Phase 1 MVP)
✅ Live Bronze/Silver/Gold layer counts  
✅ Data flow visualization (→ arrows)  
✅ Top gold tables list  
✅ Refresh button  
✅ Real-time sync from lakehouse metadata  

---

## Phase 2 Roadmap

### 1. Source Systems for Bronze Layer
**Goal:** Show which bronze table comes from which source (Salesforce, Productboard, Zendesk, Posthog, etc.)

**Implementation:**
- Create a mapping table or config: `bronze_table → source_system`
- Query this mapping in `/api/lakehouse-status`
- Return array of objects:
```json
{
  "bronze": {
    "count": 42,
    "totalRows": 15000000,
    "tables": [
      { "name": "bronze_sf_accounts", "source": "Salesforce", "rowCount": 1200 },
      { "name": "bronze_pb_features", "source": "Productboard", "rowCount": 450 },
      ...
    ]
  }
}
```
- Display as expandable section or cards by source system

---

### 2. View Descriptions for Silver Layer
**Goal:** Show what each silver view does (transforms, enriches, materializes)

**Implementation:**
- Add a metadata table: `silver_view_descriptions` with columns:
  - `view_name` (e.g., `v_silver_pb_features`)
  - `description` (e.g., "Productboard features with enriched scoring")
  - `source_bronze_tables` (e.g., `bronze_pb_features, bronze_pb_entity_fields_config`)
  - `last_refresh` (timestamp)

- Query and display in Build Status:
```json
{
  "silver": {
    "count": 41,
    "views": [
      {
        "name": "v_silver_pb_features",
        "description": "Productboard features with enriched scoring",
        "sources": ["bronze_pb_features", "bronze_pb_entity_fields_config"],
        "lastRefresh": "2026-06-22T14:00:00Z"
      },
      ...
    ]
  }
}
```

---

### 3. Better Color Scheme
**Current colors:** Purple, Green, Yellow  
**Suggested improvements:**

| Layer | Current | Suggested | Hex |
|-------|---------|-----------|-----|
| Bronze | #7030a0 | Copper/Rust | #B87333 |
| Silver | #00966b | Silver/Steel | #C0C0C0 or #708090 |
| Gold | #ffcc00 | Gold | #FFD700 |

**Alternative (Aurora brand):**
- Bronze: #8B4513 (saddle brown)
- Silver: #A9A9A9 (dark gray)
- Gold: #FFD700 (true gold)

Update in:
- `Argus.dc.html` — card backgrounds and text colors
- `argus-backend` — return color codes if doing dynamic styling

---

### 4. Transformation Lineage
**Stretch goal:** Show dependencies
```
bronze_pb_features → v_silver_pb_features → v_gold_pb_feature_prioritization_final
```

Visualize as a DAG (directed acyclic graph) for key paths.

---

## Next Steps
1. Create `view_descriptions` metadata table in Fabric
2. Extend `/api/lakehouse-status` to include source_system and view descriptions
3. Update `Argus.dc.html` to display richer detail cards
4. Test with stakeholders

---

## Notes
- Keep MVP fast — bronze/silver/gold counts should load in <1s
- Make expandable sections collapsible for performance
- Consider caching metadata (it doesn't change often)
