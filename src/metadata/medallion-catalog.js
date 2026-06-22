// Medallion Metadata Catalog
// Defines the transformation story: Bronze → Silver PoC → Gold Materialized

const medalion = {
  bronze: {
    label: 'Bronze Layer',
    description: 'Raw data tables landed by data team. Source of truth, minimal transformation.',
    tables: [
      // Productboard tables
      { name: 'bronze_pb_companies', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_components', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_entities', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_entity_fields_config', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_features', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_initiatives', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_key_results', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_notes', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_objectives', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_products', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_relationships_raw', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_release_groups', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_releases', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_subfeatures', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },
      { name: 'bronze_pb_users', source: 'Productboard', rowCount: null, lastRefresh: '2 Jun 06:30' },

      // Salesforce tables
      { name: 'bronze_sfapi_account', source: 'Salesforce', rowCount: null, lastRefresh: '1 Jun 18:15' },
      { name: 'bronze_sfapi_opportunity', source: 'Salesforce', rowCount: null, lastRefresh: '1 Jun 18:15' },
      { name: 'bronze_sfapi_opportunitylineitem', source: 'Salesforce', rowCount: null, lastRefresh: '1 Jun 18:15' },
      { name: 'bronze_sfapi_product2', source: 'Salesforce', rowCount: null, lastRefresh: '1 Jun 18:15' },
      { name: 'bronze_sfapi_subscripton__c', source: 'Salesforce', rowCount: null, lastRefresh: '1 Jun 18:15' }
    ]
  },

  silver: {
    label: 'Silver Layer',
    description: 'PoC transformation views. Graham validates transform logic here before data team materializes to tables.',
    status: 'proof-of-concept',
    views: [
      // Core entity deduplication & enrichment
      { name: 'v_silver_pb_companies', purpose: 'Deduped companies, latest record only', sources: ['bronze_pb_companies'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_products', purpose: 'Deduped products with owner info', sources: ['bronze_pb_products'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_components', purpose: 'Deduped components with hierarchy', sources: ['bronze_pb_components'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_features', purpose: 'Deduped features with scoring (criticality, efficiency, etc)', sources: ['bronze_pb_features'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_subfeatures', purpose: 'Deduped subfeatures with parent feature', sources: ['bronze_pb_subfeatures', 'bronze_pb_features'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_releases', purpose: 'Deduped releases with latest state', sources: ['bronze_pb_releases'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_release_groups', purpose: 'Release groupings (e.g., quarters)', sources: ['bronze_pb_release_groups'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_initiatives', purpose: 'Deduped initiatives with hierarchy', sources: ['bronze_pb_initiatives'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_objectives', purpose: 'Deduped OKR objectives', sources: ['bronze_pb_objectives'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_key_results', purpose: 'Deduped key results linked to objectives', sources: ['bronze_pb_key_results'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_notes', purpose: 'Deduped customer feedback notes with metadata', sources: ['bronze_pb_notes'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_users', purpose: 'Deduped users with relationships', sources: ['bronze_pb_users'], source: 'Productboard', stage: 'validated' },

      // Relationship & hierarchy flattening
      { name: 'v_silver_pb_relationships', purpose: 'Cleaned parent-child & link relationships', sources: ['bronze_pb_relationships_raw'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_note_relationships', purpose: 'Note-to-entity relationships (feature, company, user, etc)', sources: ['bronze_pb_notes'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_user_relationships', purpose: 'User-to-entity relationships', sources: ['bronze_pb_users'], source: 'Productboard', stage: 'validated' },

      // Path/lineage views: Walk hierarchies to connect features to products, initiatives, releases, etc
      { name: 'v_silver_pb_path_feature_component', purpose: '6-level hierarchy walk: feature → component path', sources: ['v_silver_pb_features', 'v_silver_pb_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_feature_product', purpose: 'Feature → product lineage', sources: ['v_silver_pb_features', 'v_silver_pb_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_feature_initiative', purpose: 'Feature → initiative paths (direct & via objective)', sources: ['v_silver_pb_features', 'v_silver_pb_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_feature_objective', purpose: 'Feature → objective lineage', sources: ['v_silver_pb_features', 'v_silver_pb_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_feature_release', purpose: 'Feature & subfeature → release assignment', sources: ['v_silver_pb_features', 'v_silver_pb_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_feature_subfeature', purpose: 'Feature → subfeature parent-child', sources: ['v_silver_pb_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_note_company', purpose: 'Note → company relationships', sources: ['v_silver_pb_note_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_note_feature', purpose: 'Note → feature feedback links', sources: ['v_silver_pb_note_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_note_subfeature', purpose: 'Note → subfeature feedback links', sources: ['v_silver_pb_note_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_note_user', purpose: 'Note author → user relationships', sources: ['v_silver_pb_note_relationships'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_path_user_company', purpose: 'User → company (customer) relationships', sources: ['v_silver_pb_user_relationships'], source: 'Productboard', stage: 'validated' },

      // Supporting enrichment views
      { name: 'v_silver_pb_priority_region', purpose: 'Region classification & weighting for strategic scoring', sources: ['v_silver_pb_features'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_subfeature_prioritization', purpose: 'Subfeature scoring by region & criticality', sources: ['v_silver_pb_subfeatures'], source: 'Productboard', stage: 'validated' },

      // Team/tag decomposition
      { name: 'v_silver_pb_initiative_teams', purpose: 'Initiative → team assignments (JSON unpacked)', sources: ['bronze_pb_initiatives'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_key_result_teams', purpose: 'Key result → team assignments', sources: ['bronze_pb_key_results'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_subfeature_teams', purpose: 'Subfeature → team assignments', sources: ['bronze_pb_subfeatures'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_subfeature_tags', purpose: 'Subfeature → tag assignments', sources: ['bronze_pb_subfeatures'], source: 'Productboard', stage: 'validated' },
      { name: 'v_silver_pb_note_tags', purpose: 'Note → tag assignments', sources: ['bronze_pb_notes'], source: 'Productboard', stage: 'validated' },

      // Cross-system integration
      { name: 'v_silver_sf_account', purpose: 'Salesforce accounts (revenue data for weighting)', sources: ['bronze_sfapi_account'], source: 'Salesforce', stage: 'validated' }
    ]
  },

  gold: {
    label: 'Gold Layer',
    description: 'Materialized analytical tables. When silver PoC is validated, data team materializes as Delta tables.',
    status: 'production-ready',
    views: [
      { name: 'v_gold_pb_feature_prioritization', purpose: 'Feature scoring by region with market count weighting', sources: ['v_silver_pb_features', 'v_silver_pb_path_feature_product', 'v_silver_pb_priority_region'], type: 'Analytical', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_feature_prioritization_final', purpose: 'Final ranked feature priorities (rank + criticality + efficiency + region)', sources: ['v_gold_pb_feature_prioritization', 'v_silver_pb_subfeature_prioritization'], type: 'Analytical', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_subfeature_prioritization', purpose: 'Subfeature ranking mirroring feature logic', sources: ['v_silver_pb_subfeatures', 'v_silver_pb_path_feature_subfeature', 'v_silver_pb_priority_region'], type: 'Analytical', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_note_company_feature', purpose: 'Denormalized: note → company → feature feedback fact table', sources: ['v_silver_pb_notes', 'v_silver_pb_path_note_company', 'v_silver_pb_path_note_feature'], type: 'Fact Table', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_note_company_subfeature', purpose: 'Denormalized: note → company → subfeature feedback fact table', sources: ['v_silver_pb_notes', 'v_silver_pb_path_note_company', 'v_silver_pb_path_note_subfeature'], type: 'Fact Table', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_path_feature_component', purpose: '6-level hierarchy walk: feature → component path', sources: ['v_silver_pb_path_feature_component'], type: 'Lineage', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_path_feature_product', purpose: 'Feature → product lineage', sources: ['v_silver_pb_path_feature_product'], type: 'Lineage', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_path_feature_initiative', purpose: 'Feature → initiative paths (direct & via objective)', sources: ['v_silver_pb_path_feature_initiative'], type: 'Lineage', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_path_feature_objective', purpose: 'Feature → objective lineage', sources: ['v_silver_pb_path_feature_objective'], type: 'Lineage', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_path_feature_release', purpose: 'Feature & subfeature → release assignment', sources: ['v_silver_pb_path_feature_release'], type: 'Lineage', stage: 'ready-for-materialization' },
      { name: 'v_gold_pb_path_feature_subfeature', purpose: 'Feature → subfeature parent-child', sources: ['v_silver_pb_path_feature_subfeature'], type: 'Lineage', stage: 'ready-for-materialization' }
    ]
  }
};

module.exports = medalion;
