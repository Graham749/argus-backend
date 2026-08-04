// Mock data layer — activated by ?mock in URL.
// Fixtures derived from real API responses 2026-08-04 so shapes and scale
// match the live app exactly. Specific values are representative, not live.
(function () {
  if (!new URLSearchParams(location.search).has('mock')) return;

  // Clear the 12-hour localStorage accounts cache so the fetch interceptor fires
  try { localStorage.removeItem('argusAccountsCache'); } catch(e) {}

  // Mock mode never restores MDM or Features views — redirect to health
  try { const v = localStorage.getItem('argusView'); if (v === 'mdm' || v === 'features') localStorage.removeItem('argusView'); } catch(e) {}

  // Remove accounts cache on page unload so mock accounts don't pollute the live version
  window.addEventListener('beforeunload', function() {
    try { localStorage.removeItem('argusAccountsCache'); } catch(e) {}
  });

  // ── Real accounts list (10 representative clients) ────────────────────────
  const ACCOUNTS = [
    'BP','Centrica','Drax','Iberdrola','RWE','Shell','SSE','Statkraft','TotalEnergies','Vattenfall'
  ];

  // ── Real subscription data per account ────────────────────────────────────
  // ARR, statuses, contract types all derived from live API 2026-08-04
  const HEALTH = {
    BP: {
      summary: { total_subscriptions:19, active_subscriptions:19, total_arr_gbp:356591, renewals_next_30_days:0, renewals_next_90_days:2, health_status:'HEALTHY' },
      contract_cards: [{ contract_type:'Rolling Anniversary', total:12, overdue:0, at_risk:0, to_watch:2, healthy:10, arr_gbp:230000 }, { contract_type:'Fixed Period', total:7, overdue:0, at_risk:0, to_watch:0, healthy:7, arr_gbp:126591 }],
      subscriptions: [
        { subscription_id:'bp-001', account_name:'BP', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:22909.91, subscription_start_date:'2023-08-01', subscription_end_date:'2027-02-28', renewal_date:'2027-02-28', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:225, renewal_status:'HEALTHY' },
        { subscription_id:'bp-002', account_name:'BP', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:12666.54, subscription_start_date:'2023-08-01', subscription_end_date:'2027-02-28', renewal_date:'2027-02-28', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:225, renewal_status:'HEALTHY' },
        { subscription_id:'bp-003', account_name:'BP', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:13323.75, subscription_start_date:'2023-09-01', subscription_end_date:'2027-03-31', renewal_date:'2027-03-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:260, renewal_status:'HEALTHY' },
        { subscription_id:'bp-004', account_name:'BP', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:13323.75, subscription_start_date:'2023-09-01', subscription_end_date:'2027-03-31', renewal_date:'2027-03-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:260, renewal_status:'HEALTHY' },
        { subscription_id:'bp-005', account_name:'BP', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:18750, subscription_start_date:'2024-01-01', subscription_end_date:'2027-06-30', renewal_date:'2027-06-30', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:330, renewal_status:'HEALTHY' },
        { subscription_id:'bp-006', account_name:'BP', product_category:'Grid', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:14500, subscription_start_date:'2024-01-01', subscription_end_date:'2027-06-30', renewal_date:'2027-06-30', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:330, renewal_status:'HEALTHY' },
      ]
    },
    Centrica: {
      summary: { total_subscriptions:20, active_subscriptions:11, total_arr_gbp:293453, renewals_next_30_days:0, renewals_next_90_days:0, health_status:'AT_RISK' },
      contract_cards: [{ contract_type:'Rolling Anniversary', total:20, overdue:0, at_risk:1, to_watch:0, healthy:10, arr_gbp:293453 }],
      subscriptions: [
        { subscription_id:'cen-001', account_name:'Centrica', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:16244.84, subscription_start_date:'2022-07-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:109, renewal_status:'HEALTHY' },
        { subscription_id:'cen-002', account_name:'Centrica', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:21374.80, subscription_start_date:'2022-07-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:109, renewal_status:'HEALTHY' },
        { subscription_id:'cen-003', account_name:'Centrica', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:21374.80, subscription_start_date:'2022-07-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:109, renewal_status:'HEALTHY' },
        { subscription_id:'cen-004', account_name:'Centrica', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:21374.80, subscription_start_date:'2022-07-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:109, renewal_status:'HEALTHY' },
        { subscription_id:'cen-005', account_name:'Centrica', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Termination in Progress', currency:'GBP', arr_gbp:28500, subscription_start_date:'2021-01-01', subscription_end_date:'2026-09-30', renewal_date:'2026-09-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:57, renewal_status:'AT_RISK' },
        { subscription_id:'cen-006', account_name:'Centrica', product_category:'Grid', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:18750, subscription_start_date:'2022-07-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:109, renewal_status:'HEALTHY' },
      ]
    },
    Drax: {
      summary: { total_subscriptions:2, active_subscriptions:2, total_arr_gbp:55000, renewals_next_30_days:0, renewals_next_90_days:0, health_status:'HEALTHY' },
      contract_cards: [{ contract_type:'Fixed Period', total:2, overdue:0, at_risk:0, to_watch:0, healthy:2, arr_gbp:55000 }],
      subscriptions: [
        { subscription_id:'drax-001', account_name:'Drax', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:24300, subscription_start_date:'2025-01-01', subscription_end_date:'2026-12-31', renewal_date:'2026-12-31', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:239, renewal_status:'HEALTHY' },
        { subscription_id:'drax-002', account_name:'Drax', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:30700, subscription_start_date:'2025-01-01', subscription_end_date:'2026-12-31', renewal_date:'2026-12-31', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:239, renewal_status:'HEALTHY' },
      ]
    },
    Iberdrola: {
      summary: { total_subscriptions:22, active_subscriptions:21, total_arr_gbp:428591, renewals_next_30_days:0, renewals_next_90_days:1, health_status:'AT_RISK' },
      contract_cards: [{ contract_type:'Rolling Anniversary', total:22, overdue:0, at_risk:0, to_watch:1, healthy:20, arr_gbp:428591 }],
      subscriptions: [
        { subscription_id:'ibe-001', account_name:'Iberdrola', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:8086.75, subscription_start_date:'2023-05-01', subscription_end_date:'2026-09-30', renewal_date:'2026-09-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:38, renewal_status:'TO_WATCH' },
        { subscription_id:'ibe-002', account_name:'Iberdrola', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:18573.82, subscription_start_date:'2023-05-01', subscription_end_date:'2026-11-30', renewal_date:'2026-11-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:116, renewal_status:'HEALTHY' },
        { subscription_id:'ibe-003', account_name:'Iberdrola', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:9223.62, subscription_start_date:'2023-05-01', subscription_end_date:'2026-11-30', renewal_date:'2026-11-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:116, renewal_status:'HEALTHY' },
        { subscription_id:'ibe-004', account_name:'Iberdrola', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:9286.91, subscription_start_date:'2023-05-01', subscription_end_date:'2026-11-30', renewal_date:'2026-11-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:116, renewal_status:'HEALTHY' },
        { subscription_id:'ibe-005', account_name:'Iberdrola', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:16250, subscription_start_date:'2024-02-01', subscription_end_date:'2027-01-31', renewal_date:'2027-01-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:196, renewal_status:'HEALTHY' },
        { subscription_id:'ibe-006', account_name:'Iberdrola', product_category:'Grid', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:12500, subscription_start_date:'2024-02-01', subscription_end_date:'2027-01-31', renewal_date:'2027-01-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:196, renewal_status:'HEALTHY' },
        { subscription_id:'ibe-007', account_name:'Iberdrola', product_category:'Amun', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:28750, subscription_start_date:'2024-02-01', subscription_end_date:'2027-01-31', renewal_date:'2027-01-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:196, renewal_status:'HEALTHY' },
      ]
    },
    RWE: {
      summary: { total_subscriptions:48, active_subscriptions:31, total_arr_gbp:917868, renewals_next_30_days:1, renewals_next_90_days:4, health_status:'URGENT' },
      contract_cards: [{ contract_type:'Rolling Anniversary', total:48, overdue:3, at_risk:1, to_watch:2, healthy:25, arr_gbp:917868 }],
      subscriptions: [
        { subscription_id:'rwe-001', account_name:'RWE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:21863.14, subscription_start_date:'2022-07-01', subscription_end_date:'2026-07-01', renewal_date:'2026-07-01', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:-34, renewal_status:'OVERDUE' },
        { subscription_id:'rwe-002', account_name:'RWE', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:16553.86, subscription_start_date:'2022-07-30', subscription_end_date:'2026-07-30', renewal_date:'2026-07-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:-5, renewal_status:'OVERDUE' },
        { subscription_id:'rwe-003', account_name:'RWE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:24060.81, subscription_start_date:'2022-07-30', subscription_end_date:'2026-07-30', renewal_date:'2026-07-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:-5, renewal_status:'OVERDUE' },
        { subscription_id:'rwe-004', account_name:'RWE', product_category:'Origin', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:9196.58, subscription_start_date:'2022-07-30', subscription_end_date:'2026-07-30', renewal_date:'2026-07-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:-5, renewal_status:'OVERDUE' },
        { subscription_id:'rwe-005', account_name:'RWE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:18500, subscription_start_date:'2023-09-01', subscription_end_date:'2026-08-31', renewal_date:'2026-08-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:27, renewal_status:'AT_RISK' },
        { subscription_id:'rwe-006', account_name:'RWE', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:22750, subscription_start_date:'2023-10-01', subscription_end_date:'2026-09-30', renewal_date:'2026-09-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:57, renewal_status:'TO_WATCH' },
        { subscription_id:'rwe-007', account_name:'RWE', product_category:'Grid', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:19800, subscription_start_date:'2023-10-01', subscription_end_date:'2026-09-30', renewal_date:'2026-09-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:57, renewal_status:'TO_WATCH' },
        { subscription_id:'rwe-008', account_name:'RWE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:32400, subscription_start_date:'2024-01-01', subscription_end_date:'2027-01-31', renewal_date:'2027-01-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:196, renewal_status:'HEALTHY' },
        { subscription_id:'rwe-009', account_name:'RWE', product_category:'Amun', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:45000, subscription_start_date:'2024-01-01', subscription_end_date:'2027-01-31', renewal_date:'2027-01-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:196, renewal_status:'HEALTHY' },
      ]
    },
    Shell: {
      summary: { total_subscriptions:42, active_subscriptions:40, total_arr_gbp:861496, renewals_next_30_days:1, renewals_next_90_days:5, health_status:'URGENT' },
      contract_cards: [{ contract_type:'Rolling Anniversary', total:42, overdue:0, at_risk:1, to_watch:4, healthy:35, arr_gbp:861496 }],
      subscriptions: [
        { subscription_id:'sh-001', account_name:'Shell', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:16610.19, subscription_start_date:'2022-08-04', subscription_end_date:'2026-08-04', renewal_date:'2026-08-04', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:0, renewal_status:'AT_RISK' },
        { subscription_id:'sh-002', account_name:'Shell', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:33361.69, subscription_start_date:'2022-09-15', subscription_end_date:'2026-09-15', renewal_date:'2026-09-15', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:43, renewal_status:'TO_WATCH' },
        { subscription_id:'sh-003', account_name:'Shell', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:38987.60, subscription_start_date:'2022-09-18', subscription_end_date:'2026-09-18', renewal_date:'2026-09-18', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:44, renewal_status:'TO_WATCH' },
        { subscription_id:'sh-004', account_name:'Shell', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:31200, subscription_start_date:'2022-10-12', subscription_end_date:'2026-10-12', renewal_date:'2026-10-12', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:72, renewal_status:'TO_WATCH' },
        { subscription_id:'sh-005', account_name:'Shell', product_category:'Nodal', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:42500, subscription_start_date:'2023-01-01', subscription_end_date:'2026-12-31', renewal_date:'2026-12-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:149, renewal_status:'HEALTHY' },
        { subscription_id:'sh-006', account_name:'Shell', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:28600, subscription_start_date:'2023-03-01', subscription_end_date:'2027-02-28', renewal_date:'2027-02-28', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:208, renewal_status:'HEALTHY' },
        { subscription_id:'sh-007', account_name:'Shell', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:25000, subscription_start_date:'2023-04-01', subscription_end_date:'2027-03-31', renewal_date:'2027-03-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:239, renewal_status:'HEALTHY' },
      ]
    },
    SSE: {
      summary: { total_subscriptions:45, active_subscriptions:43, total_arr_gbp:752483, renewals_next_30_days:2, renewals_next_90_days:6, health_status:'URGENT' },
      contract_cards: [{ contract_type:'Fixed Period', total:22, overdue:1, at_risk:2, to_watch:1, healthy:18, arr_gbp:410000 }, { contract_type:'Rolling Anniversary', total:23, overdue:0, at_risk:0, to_watch:3, healthy:20, arr_gbp:342483 }],
      subscriptions: [
        { subscription_id:'sse-001', account_name:'SSE', product_category:'Origin', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:0, subscription_start_date:'2024-08-01', subscription_end_date:'2026-08-01', renewal_date:'2026-08-01', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:-3, renewal_status:'OVERDUE' },
        { subscription_id:'sse-002', account_name:'SSE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:23923, subscription_start_date:'2024-08-06', subscription_end_date:'2026-08-06', renewal_date:'2026-08-06', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:2, renewal_status:'AT_RISK' },
        { subscription_id:'sse-003', account_name:'SSE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:22913.80, subscription_start_date:'2024-08-08', subscription_end_date:'2026-08-08', renewal_date:'2026-08-08', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:4, renewal_status:'AT_RISK' },
        { subscription_id:'sse-004', account_name:'SSE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:6270, subscription_start_date:'2022-10-03', subscription_end_date:'2026-10-03', renewal_date:'2026-10-03', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:54, renewal_status:'TO_WATCH' },
        { subscription_id:'sse-005', account_name:'SSE', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:18500, subscription_start_date:'2023-11-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:88, renewal_status:'HEALTHY' },
        { subscription_id:'sse-006', account_name:'SSE', product_category:'Grid', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:14850, subscription_start_date:'2024-01-01', subscription_end_date:'2026-12-31', renewal_date:'2026-12-31', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:149, renewal_status:'HEALTHY' },
        { subscription_id:'sse-007', account_name:'SSE', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:31200, subscription_start_date:'2024-02-01', subscription_end_date:'2027-01-31', renewal_date:'2027-01-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:180, renewal_status:'HEALTHY' },
        { subscription_id:'sse-008', account_name:'SSE', product_category:'Amun', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:38500, subscription_start_date:'2024-02-01', subscription_end_date:'2027-01-31', renewal_date:'2027-01-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:180, renewal_status:'HEALTHY' },
      ]
    },
    Statkraft: {
      summary: { total_subscriptions:35, active_subscriptions:35, total_arr_gbp:434350, renewals_next_30_days:0, renewals_next_90_days:1, health_status:'HEALTHY' },
      contract_cards: [{ contract_type:'Fixed Period', total:35, overdue:0, at_risk:0, to_watch:1, healthy:34, arr_gbp:434350 }],
      subscriptions: [
        { subscription_id:'sk-001', account_name:'Statkraft', product_category:'Grid', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:10514.84, subscription_start_date:'2024-09-01', subscription_end_date:'2026-09-01', renewal_date:'2026-09-01', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:41, renewal_status:'TO_WATCH' },
        { subscription_id:'sk-002', account_name:'Statkraft', product_category:'Solaris', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:0, subscription_start_date:'2024-11-01', subscription_end_date:'2026-11-01', renewal_date:'2026-11-01', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:89, renewal_status:'HEALTHY' },
        { subscription_id:'sk-003', account_name:'Statkraft', product_category:'Chronos', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:0, subscription_start_date:'2024-11-01', subscription_end_date:'2026-11-01', renewal_date:'2026-11-01', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:89, renewal_status:'HEALTHY' },
        { subscription_id:'sk-004', account_name:'Statkraft', product_category:'Origin', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:67500, subscription_start_date:'2024-11-01', subscription_end_date:'2026-11-01', renewal_date:'2026-11-01', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:89, renewal_status:'HEALTHY' },
        { subscription_id:'sk-005', account_name:'Statkraft', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:28500, subscription_start_date:'2024-11-01', subscription_end_date:'2026-11-01', renewal_date:'2026-11-01', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:89, renewal_status:'HEALTHY' },
        { subscription_id:'sk-006', account_name:'Statkraft', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:22400, subscription_start_date:'2024-11-01', subscription_end_date:'2026-11-01', renewal_date:'2026-11-01', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:89, renewal_status:'HEALTHY' },
        { subscription_id:'sk-007', account_name:'Statkraft', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:34200, subscription_start_date:'2025-01-01', subscription_end_date:'2026-12-31', renewal_date:'2026-12-31', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:148, renewal_status:'HEALTHY' },
      ]
    },
    TotalEnergies: {
      summary: { total_subscriptions:107, active_subscriptions:98, total_arr_gbp:1410716, renewals_next_30_days:0, renewals_next_90_days:5, health_status:'AT_RISK' },
      contract_cards: [{ contract_type:'Rolling Anniversary', total:65, overdue:0, at_risk:0, to_watch:3, healthy:62, arr_gbp:820000 }, { contract_type:'Fixed Period', total:42, overdue:0, at_risk:0, to_watch:2, healthy:40, arr_gbp:590716 }],
      subscriptions: [
        { subscription_id:'te-001', account_name:'TotalEnergies', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:0, subscription_start_date:'2023-11-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:99, renewal_status:'HEALTHY' },
        { subscription_id:'te-002', account_name:'TotalEnergies', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:15402.60, subscription_start_date:'2023-11-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:99, renewal_status:'HEALTHY' },
        { subscription_id:'te-003', account_name:'TotalEnergies', product_category:'Nodal', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:0, subscription_start_date:'2023-11-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:99, renewal_status:'HEALTHY' },
        { subscription_id:'te-004', account_name:'TotalEnergies', product_category:'Nodal', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:11124.10, subscription_start_date:'2024-03-01', subscription_end_date:'2026-12-15', renewal_date:'2026-12-15', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:149, renewal_status:'HEALTHY' },
        { subscription_id:'te-005', account_name:'TotalEnergies', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:18750, subscription_start_date:'2023-11-01', subscription_end_date:'2026-10-31', renewal_date:'2026-10-31', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:99, renewal_status:'HEALTHY' },
        { subscription_id:'te-006', account_name:'TotalEnergies', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:22500, subscription_start_date:'2024-01-01', subscription_end_date:'2026-12-31', renewal_date:'2026-12-31', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:149, renewal_status:'HEALTHY' },
        { subscription_id:'te-007', account_name:'TotalEnergies', product_category:'Grid', service_type:'Subscription Analytics', status:'Termination in Progress', currency:'GBP', arr_gbp:16800, subscription_start_date:'2022-06-01', subscription_end_date:'2026-09-30', renewal_date:'2026-09-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:57, renewal_status:'AT_RISK' },
        { subscription_id:'te-008', account_name:'TotalEnergies', product_category:'Amun', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:52000, subscription_start_date:'2024-04-01', subscription_end_date:'2027-03-31', renewal_date:'2027-03-31', renewal_date_source:'SF', contract_type:'Fixed Period', product_development_opt_out_clause:null, days_to_renewal:239, renewal_status:'HEALTHY' },
      ]
    },
    Vattenfall: {
      summary: { total_subscriptions:11, active_subscriptions:11, total_arr_gbp:158673, renewals_next_30_days:0, renewals_next_90_days:0, health_status:'HEALTHY' },
      contract_cards: [{ contract_type:'Rolling Anniversary', total:11, overdue:0, at_risk:0, to_watch:0, healthy:11, arr_gbp:158673 }],
      subscriptions: [
        { subscription_id:'vat-001', account_name:'Vattenfall', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:49167.84, subscription_start_date:'2023-12-01', subscription_end_date:'2026-11-30', renewal_date:'2026-11-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:118, renewal_status:'HEALTHY' },
        { subscription_id:'vat-002', account_name:'Vattenfall', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:13794.88, subscription_start_date:'2023-12-01', subscription_end_date:'2026-11-30', renewal_date:'2026-11-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:118, renewal_status:'HEALTHY' },
        { subscription_id:'vat-003', account_name:'Vattenfall', product_category:'Flexible Energy', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:13794.88, subscription_start_date:'2023-12-01', subscription_end_date:'2026-11-30', renewal_date:'2026-11-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:118, renewal_status:'HEALTHY' },
        { subscription_id:'vat-004', account_name:'Vattenfall', product_category:'Amun', service_type:'Software', status:'Active', currency:'GBP', arr_gbp:14204.62, subscription_start_date:'2024-05-01', subscription_end_date:'2027-04-30', renewal_date:'2027-04-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:269, renewal_status:'HEALTHY' },
        { subscription_id:'vat-005', account_name:'Vattenfall', product_category:'Grid', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:9800, subscription_start_date:'2023-12-01', subscription_end_date:'2026-11-30', renewal_date:'2026-11-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:118, renewal_status:'HEALTHY' },
        { subscription_id:'vat-006', account_name:'Vattenfall', product_category:'Power & Renewables', service_type:'Subscription Analytics', status:'Active', currency:'GBP', arr_gbp:24750, subscription_start_date:'2024-05-01', subscription_end_date:'2027-04-30', renewal_date:'2027-04-30', renewal_date_source:'SF', contract_type:'Rolling Anniversary', product_development_opt_out_clause:null, days_to_renewal:269, renewal_status:'HEALTHY' },
      ]
    }
  };

  // ── SF Cases per account (real totals from live API) ──────────────────────
  const CASES = {
    BP:       { total:79,  open:2,  escalated:1 },
    Centrica: { total:105, open:0,  escalated:0 },
    Drax:     { total:12,  open:0,  escalated:0 },
    Iberdrola:{ total:88,  open:1,  escalated:0 },
    RWE:      { total:194, open:0,  escalated:0 },
    Shell:    { total:175, open:2,  escalated:1 },
    SSE:      { total:411, open:3,  escalated:1 },
    Statkraft:{ total:183, open:4,  escalated:2 },
    TotalEnergies:{ total:128, open:2, escalated:0 },
    Vattenfall:   { total:204, open:1, escalated:0 },
  };

  // ── SF Opportunities per account (real totals from live API) ──────────────
  const OPPS = {
    BP:       { total:110, won:32,  pipeline:4035000  },
    Centrica: { total:75,  won:20,  pipeline:24448068 },
    Drax:     { total:18,  won:8,   pipeline:120000   },
    Iberdrola:{ total:65,  won:18,  pipeline:2100000  },
    RWE:      { total:359, won:197, pipeline:604607   },
    Shell:    { total:218, won:72,  pipeline:16023065 },
    SSE:      { total:230, won:92,  pipeline:10462811 },
    Statkraft:{ total:170, won:52,  pipeline:756306   },
    TotalEnergies:{ total:183, won:53, pipeline:13767477 },
    Vattenfall:   { total:88,  won:27, pipeline:869403   },
  };

  // ── ZD Tickets per account (real totals from live API) ────────────────────
  const ZD = {
    BP:       { total:1,  open:0 },
    Centrica: { total:3,  open:0 },
    Drax:     { total:2,  open:0 },
    Iberdrola:{ total:8,  open:1 },
    RWE:      { total:14, open:1 },
    Shell:    { total:7,  open:2 },
    SSE:      { total:30, open:2 },
    Statkraft:{ total:4,  open:2 },
    TotalEnergies:{ total:11, open:0 },
    Vattenfall:   { total:4,  open:0 },
  };

  // ── PostHog activity per account (real events30d / uniqueUsers) ───────────
  const PH = {
    BP:       { events30d:39,  users:6  },
    Centrica: { events30d:31,  users:15 },
    Drax:     { events30d:8,   users:3  },
    Iberdrola:{ events30d:52,  users:12 },
    RWE:      { events30d:62,  users:25 },
    Shell:    { events30d:163, users:24 },
    SSE:      { events30d:65,  users:18 },
    Statkraft:{ events30d:79,  users:15 },
    TotalEnergies:{ events30d:318, users:33 },
    Vattenfall:   { events30d:228, users:19 },
  };

  // ── ProductBoard notes & features per account ─────────────────────────────
  const PB_DATA = {
    BP:       { notes:0,  features:0,  featureNames:[] },
    Centrica: { notes:32, features:28, featureNames:['Balancing Mechanism Dashboard','Half-hourly Settlement Module','Flex Asset Optimiser','Gas Storage Analytics','GB Capacity Market Tracker','Admin Price Zone Override'] },
    Drax:     { notes:3,  features:2,  featureNames:['Biomass Unit Economics View','ROC/CfD Certificate Tracker'] },
    Iberdrola:{ notes:14, features:11, featureNames:['Iberian Market Curves','ES Capacity Auction Dashboard','Offshore Wind Revenue Bridge'] },
    RWE:      { notes:38, features:30, featureNames:['Intraday Balancing View','Redispatch Cost Tracker','DE Grid Topology Layer','Cross-border Flow Monitor','Hydrogen Electrolyser Modelling','Battery BESS Optimisation','Day-ahead Spread Analytics'] },
    Shell:    { notes:1,  features:1,  featureNames:['LNG Price Benchmarks'] },
    SSE:      { notes:42, features:37, featureNames:['GB Balancing Mechanism','ROC/CfD Tracker','Flex Platform Module','Distribution Network Revenue','Smart Meter Demand Analytics','Heat Pump Load Forecasting','Behind-the-Meter BESS'] },
    Statkraft:{ notes:5,  features:5,  featureNames:['Nordic Hydro Seasonality','SE Price Zone Splits','Wind Curtailment Analytics','NO Intraday Market','Hydro Reservoir Modelling'] },
    TotalEnergies:{ notes:0, features:0, featureNames:[] },
    Vattenfall:   { notes:2, features:2, featureNames:['Nordic Hydro Seasonality','Offshore Wind Revenue Bridge'] },
  };

  // ── SW Intelligence (representative data across real markets) ─────────────
  const SW_INTEL = {
    regions: ['France','Germany','Italy','Iberia','GBR','Nordics','APAC'],
    mkt_col: { France:'#1e40af',Germany:'#7c3aed',Italy:'#059669',Iberia:'#d97706',GBR:'#dc2626',Nordics:'#0891b2',APAC:'#0d9488' },
    arr_as_of:'2026-08', usage_as_of:'TBC',
    arr_vs_target:[
      {market:'France',  sw:'Amun',    actual_k:1850, target_k:2100, no_target:false, client_count:14, top_clients:[{name:'TotalEnergies',arr_k:320},{name:'EDF',arr_k:280}]},
      {market:'France',  sw:'Origin',  actual_k:620,  target_k:700,  no_target:false, client_count:8,  top_clients:[{name:'TotalEnergies',arr_k:180},{name:'Engie',arr_k:140}]},
      {market:'Germany', sw:'Amun',    actual_k:2400, target_k:2200, no_target:false, client_count:12, top_clients:[{name:'RWE',arr_k:450},{name:'E.ON',arr_k:380}]},
      {market:'Germany', sw:'Chronos', actual_k:890,  target_k:950,  no_target:false, client_count:9,  top_clients:[{name:'RWE',arr_k:210},{name:'Vattenfall',arr_k:180}]},
      {market:'Italy',   sw:'Amun',    actual_k:1200, target_k:1300, no_target:false, client_count:8,  top_clients:[{name:'Enel',arr_k:320},{name:'Edison',arr_k:180}]},
      {market:'Iberia',  sw:'Origin',  actual_k:780,  target_k:950,  no_target:false, client_count:7,  top_clients:[{name:'Iberdrola',arr_k:220},{name:'Endesa',arr_k:195}]},
      {market:'GBR',     sw:'Amun',    actual_k:3100, target_k:2900, no_target:false, client_count:18, top_clients:[{name:'SSE',arr_k:420},{name:'Shell',arr_k:380},{name:'BP',arr_k:310}]},
      {market:'GBR',     sw:'Origin',  actual_k:980,  target_k:1100, no_target:false, client_count:11, top_clients:[{name:'Centrica',arr_k:290},{name:'Drax',arr_k:180}]},
      {market:'Nordics', sw:'Amun',    actual_k:1650, target_k:1800, no_target:false, client_count:10, top_clients:[{name:'Vattenfall',arr_k:380},{name:'Statkraft',arr_k:340}]},
      {market:'APAC',    sw:'Amun',    actual_k:820,  target_k:900,  no_target:false, client_count:6,  top_clients:[{name:'APA',arr_k:220},{name:'Alinta Energy',arr_k:180}]},
    ],
    region_summary:[
      {market:'France',  arr_k:2470, target_k:2800, pct:88.2, above:[], below80:[{sw:'Origin',pct:88.6}]},
      {market:'Germany', arr_k:3290, target_k:3150, pct:104.4, above:['Amun'], below80:[]},
      {market:'Italy',   arr_k:1200, target_k:1300, pct:92.3, above:[], below80:[]},
      {market:'Iberia',  arr_k:780,  target_k:950,  pct:82.1, above:[], below80:[{sw:'Origin',pct:82.1}]},
      {market:'GBR',     arr_k:4080, target_k:4000, pct:102.0, above:['Amun'], below80:[]},
      {market:'Nordics', arr_k:1650, target_k:1800, pct:91.7, above:[], below80:[]},
      {market:'APAC',    arr_k:820,  target_k:900,  pct:91.1, above:[], below80:[]},
    ],
    arr_trend:[],
    clients:[
      {account:'TotalEnergies',parent:null,market:'France', sw_lines:[{sw:'Amun',arr_k:320,terminating:false,renewal_badge:'3M',end_date:'2026-11-01'},{sw:'Origin',arr_k:180,terminating:false,renewal_badge:'3M',end_date:'2026-11-01'}],arr_k:500,products:['Amun','Origin'],total_runs:2800,runs_90d:720,days_since_run:0,arr_yoy:12,movement:'up',flag_no_recent_use:false,flag_upsell:false,flag_terminating:false,flag_renewal:true},
      {account:'RWE',         parent:null,market:'Germany',sw_lines:[{sw:'Amun',arr_k:450,terminating:false,renewal_badge:null,end_date:'2027-01-31'},{sw:'Chronos',arr_k:210,terminating:false,renewal_badge:null,end_date:'2027-01-31'}],arr_k:660,products:['Amun','Chronos'],total_runs:3100,runs_90d:810,days_since_run:0,arr_yoy:8,movement:'up',flag_no_recent_use:false,flag_upsell:true,flag_terminating:false,flag_renewal:false},
      {account:'SSE',         parent:null,market:'GBR',    sw_lines:[{sw:'Amun',arr_k:420,terminating:false,renewal_badge:'1M',end_date:'2026-08-31'}],arr_k:420,products:['Amun'],total_runs:1900,runs_90d:480,days_since_run:1,arr_yoy:5,movement:'same',flag_no_recent_use:false,flag_upsell:false,flag_terminating:false,flag_renewal:true},
      {account:'Shell',       parent:null,market:'GBR',    sw_lines:[{sw:'Amun',arr_k:380,terminating:false,renewal_badge:'1M',end_date:'2026-08-31'}],arr_k:380,products:['Amun'],total_runs:2200,runs_90d:560,days_since_run:0,arr_yoy:15,movement:'up',flag_no_recent_use:false,flag_upsell:false,flag_terminating:false,flag_renewal:true},
      {account:'BP',          parent:null,market:'GBR',    sw_lines:[{sw:'Amun',arr_k:310,terminating:false,renewal_badge:null,end_date:'2027-02-28'}],arr_k:310,products:['Amun'],total_runs:980,runs_90d:245,days_since_run:3,arr_yoy:0,movement:'same',flag_no_recent_use:false,flag_upsell:false,flag_terminating:false,flag_renewal:false},
      {account:'Vattenfall',  parent:null,market:'Nordics',sw_lines:[{sw:'Amun',arr_k:380,terminating:false,renewal_badge:null,end_date:'2027-04-30'}],arr_k:380,products:['Amun'],total_runs:1650,runs_90d:420,days_since_run:1,arr_yoy:18,movement:'up',flag_no_recent_use:false,flag_upsell:true,flag_terminating:false,flag_renewal:false},
      {account:'Statkraft',   parent:null,market:'Nordics',sw_lines:[{sw:'Origin',arr_k:340,terminating:false,renewal_badge:null,end_date:'2026-11-01'}],arr_k:340,products:['Origin'],total_runs:1200,runs_90d:310,days_since_run:2,arr_yoy:22,movement:'up',flag_no_recent_use:false,flag_upsell:false,flag_terminating:false,flag_renewal:false},
      {account:'Iberdrola',   parent:null,market:'Iberia', sw_lines:[{sw:'Origin',arr_k:220,terminating:false,renewal_badge:'2M',end_date:'2026-10-15'}],arr_k:220,products:['Origin'],total_runs:680,runs_90d:140,days_since_run:8,arr_yoy:-3,movement:'down',flag_no_recent_use:false,flag_upsell:false,flag_terminating:false,flag_renewal:true},
      {account:'Centrica',    parent:null,market:'GBR',    sw_lines:[{sw:'Origin',arr_k:290,terminating:true, renewal_badge:null,end_date:'2026-09-30'}],arr_k:290,products:['Origin'],total_runs:890,runs_90d:180,days_since_run:12,arr_yoy:-8,movement:'down',flag_no_recent_use:false,flag_upsell:false,flag_terminating:true,flag_renewal:false},
      {account:'Drax',        parent:null,market:'GBR',    sw_lines:[{sw:'Origin',arr_k:55,terminating:false,renewal_badge:null,end_date:'2026-12-31'}],arr_k:55,products:['Origin'],total_runs:280,runs_90d:72,days_since_run:5,arr_yoy:0,movement:'same',flag_no_recent_use:false,flag_upsell:false,flag_terminating:false,flag_renewal:false},
    ],
    client_list:[
      {account:'TotalEnergies',parent:null,market:'France', tier:'Tier 1',sw_products:['Amun','Origin'],sw_arr_k:500,sub_products:['PRMF','Granular Data'],sub_arr_k:280},
      {account:'RWE',          parent:null,market:'Germany',tier:'Tier 1',sw_products:['Amun','Chronos'],sw_arr_k:660,sub_products:['Grid','PRMF'],sub_arr_k:195},
      {account:'SSE',          parent:null,market:'GBR',    tier:'Tier 1',sw_products:['Amun'],sw_arr_k:420,sub_products:['Flex','PRMF'],sub_arr_k:140},
      {account:'Shell',        parent:null,market:'GBR',    tier:'Tier 1',sw_products:['Amun'],sw_arr_k:380,sub_products:['Granular Data'],sub_arr_k:85},
      {account:'BP',           parent:null,market:'GBR',    tier:'Tier 1',sw_products:['Amun'],sw_arr_k:310,sub_products:[],sub_arr_k:0},
      {account:'Vattenfall',   parent:null,market:'Nordics',tier:'Tier 1',sw_products:['Amun'],sw_arr_k:380,sub_products:[],sub_arr_k:0},
      {account:'Statkraft',    parent:null,market:'Nordics',tier:'Tier 1',sw_products:['Origin'],sw_arr_k:340,sub_products:['PRMF'],sub_arr_k:65},
      {account:'Iberdrola',    parent:null,market:'Iberia', tier:'Tier 1',sw_products:['Origin'],sw_arr_k:220,sub_products:[],sub_arr_k:0},
      {account:'Centrica',     parent:null,market:'GBR',    tier:'Tier 2',sw_products:['Origin'],sw_arr_k:290,sub_products:['Flex'],sub_arr_k:48},
      {account:'Drax',         parent:null,market:'GBR',    tier:'Tier 2',sw_products:['Origin'],sw_arr_k:55, sub_products:[],sub_arr_k:0},
    ],
    dormant_detail:[],dormant_client_count:0,
    termination_in_progress:[
      {account:'Centrica',market:'GBR',sw:'Origin',parent:null,termination_reason:'Consolidating to internal tooling',arr_k:290},
    ],
    renewals_due:[
      {account:'SSE',          market:'GBR',    sw:'Amun',  end_date:'2026-08-31',arr_k:420,extension:'No',renewal_badge:'1M',parent:null},
      {account:'Shell',        market:'GBR',    sw:'Amun',  end_date:'2026-08-31',arr_k:380,extension:'No',renewal_badge:'1M',parent:null},
      {account:'TotalEnergies',market:'France', sw:'Amun',  end_date:'2026-11-01',arr_k:320,extension:'No',renewal_badge:'3M',parent:null},
      {account:'Iberdrola',    market:'Iberia', sw:'Origin',end_date:'2026-10-15',arr_k:220,extension:'No',renewal_badge:'2M',parent:null},
    ],
    renewals_3m_count:4, renewals_6m_count:9, termination_count:1
  };

  // PostHog market regions per account — lowercase 3-letter codes matching REGION_COORDS in Argus.dc.html
  const PH_REGIONS = {
    BP:           ['gbr'],
    Centrica:     ['gbr'],
    Drax:         ['gbr'],
    Iberdrola:    ['ibe','fra'],
    RWE:          ['deu','fra','pol','nod'],
    Shell:        ['gbr','deu','nld','fra'],
    SSE:          ['gbr'],
    Statkraft:    ['nod','swe','deu'],
    TotalEnergies:['fra','deu','gbr','ibe'],
    Vattenfall:   ['nod','swe','deu'],
  };

  // Shared opp month positions — 8 well-spread indices into the 19-month window
  // Used by both buildOpps (for createdDate) and buildTimeline (for opportunities count)
  const OPP_MO_INDICES = [2, 4, 7, 9, 11, 13, 15, 17];

  // ── Builder helpers ───────────────────────────────────────────────────────
  function ok(data) {
    return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }

  function getAccount(url) {
    const pm = url.match(/\/api\/accounts\/([^/?&]+)/);
    if (pm) return decodeURIComponent(pm[1]);
    const qm = url.match(/[?&]account=([^&]+)/);
    if (qm) return decodeURIComponent(qm[1]);
    return null;
  }

  function buildCases(acct) {
    const c = CASES[acct] || { total:20, open:1, escalated:0 };
    // Months in the same 19-month window as the timeline (2025-02 → 2026-08)
    const MONTHS = ['2025-02','2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
    // Same per-month distribution as buildTimeline uses (SSE base, scaled)
    const DIST = [14,15,13,13,13,15,13,16,17,15,4,15,10,4,8,17,11,20,0];
    const distTotal = DIST.reduce((a,b)=>a+b,0);
    const types = ['Analyst_support','Analyst_support','Workshop','General technical support','Analyst support (call)','General Support - Email'];
    const subjects = ['Market curve query','Data export issue','Modelling methodology question','Access & licensing request','Report configuration','Price forecast clarification','Workshop coordination','API integration query','Subscription renewal query','Analyst call request'];
    // Spread cases across months, proportional to distribution
    const rows = [];
    let caseIdx = 0;
    const openStart = c.total - c.open; // last c.open cases are open (most recent)
    MONTHS.forEach((mo, mIdx) => {
      const count = Math.round(DIST[mIdx] / distTotal * c.total);
      for (let j = 0; j < count && caseIdx < c.total; j++, caseIdx++) {
        const isOpen = caseIdx >= openStart;
        const isEsc  = caseIdx < c.escalated;
        const day    = String(Math.min(j * 2 + 1, 28)).padStart(2,'0');
        rows.push({
          caseNumber: String(10000 + caseIdx).padStart(8,'0'),
          subject:    subjects[caseIdx % subjects.length],
          type:       types[caseIdx % types.length],
          status:     isOpen ? 'Open' : 'Closed',
          isClosed:   !isOpen,
          isEscalated: isEsc,
          isChargeable: false,
          createdDate:  mo + '-' + day + 'T09:00:00',
          closedDate:   isOpen ? null : mo + '-' + day + 'T16:00:00',
          auroraHours:  isOpen ? 0 : (isEsc ? 8.5 : 1.5),
          assignee:     'Support Team'
        });
      }
    });
    return {
      matched: true,
      summary: { total:c.total, open:c.open, closed:c.total-c.open, escalated:c.escalated, avgHours:2.3, typeBreakdown:['Analyst_support','Workshop','General technical support','Analyst support (call)'].map(t=>({type:t,cnt:Math.round(c.total/5)})) },
      cases: rows
    };
  }

  function buildOpps(acct) {
    const o = OPPS[acct] || { total:30, won:10, pipeline:500000 };
    const stages = ['Closed Won','Proposal/Price Quote','Negotiate & Close','Closed Lost'];
    const MONTHS_19 = ['2025-02','2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
    const displayCount = Math.min(o.total, 8);
    const rows = [];
    for (let i = 0; i < displayCount; i++) {
      const mo  = MONTHS_19[OPP_MO_INDICES[i % OPP_MO_INDICES.length]];
      const day = String((i % 10) + 1).padStart(2,'0');
      rows.push({ id:'opp-'+i, name:['Annual Renewal','Scope Expansion — New Markets','Add-on Module','New Country Coverage','Upsell — Software Platform','Advisory Project'][i%6], stage:stages[i%stages.length], type:i%3===0?'Renewal':i%3===1?'New Business':'Upsell', amount:Math.round(o.pipeline/5)+i*8000, isWon:stages[i%stages.length]==='Closed Won', isClosed:['Closed Won','Closed Lost'].includes(stages[i%stages.length]), createdDate:mo+'-'+day+'T09:00:00', closeDate:'2027-01-15' });
    }
    return { matched:true, summary:{ total:o.total, open:o.total-o.won-2, won:o.won, lost:2, pipeline:o.pipeline, wonValue:o.won*48000, stageBreakdown:[{stage:'Proposal/Price Quote',cnt:Math.round(o.total*0.15)},{stage:'Negotiate & Close',cnt:Math.round(o.total*0.08)}] }, opportunities:rows };
  }

  function buildZd(acct) {
    const z = ZD[acct] || { total:5, open:0 };
    // Spread tickets across the last 12 months so bar clicks find data
    const zdMonths = ['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
    const subjects = ['Data access issue','Report export','Price zone query','Login help','API integration query','Methodology question','User provisioning','Bulk download issue'];
    const rows = [];
    for (let i = 0; i < z.total; i++) {
      const mo  = zdMonths[Math.floor(i / Math.max(1, z.total / zdMonths.length)) % zdMonths.length];
      const day = String((i % 20) + 1).padStart(2,'0');
      const isOpen = i >= z.total - z.open;
      rows.push({ id:90000+i, subject:subjects[i%subjects.length], status:isOpen?'open':'solved', priority:isOpen&&i===z.total-z.open?'high':'normal', createdAt:mo+'-'+day+'T09:00:00', replies:i%5, reopens:0, resolutionMinutes:isOpen?0:240, waitMinutes:60, timeSpentMinutes:45, replyBusinessMinutes:90, numCredits:0 });
    }
    return { zdOrgId:'zd-org-'+acct.toLowerCase().replace(/\s/g,'-'), zdOrgName:acct, summary:{ open:z.open, pending:z.open>0?1:0, solved:z.total-z.open>0?z.total-z.open-1:0, closed:Math.min(1,z.total-z.open), total:z.total }, avgResolutionDays:162, avgReplyHours:2.4, tickets:rows };
  }

  // Shared PB note distribution across 12-month window (Sep 2025 → Aug 2026)
  // Used by buildPb (note createdAt) and buildTimeline (product array)
  const PB_DIST_12 = [8,10,9,7,6,8,9,11,12,10,8,2]; // sum=100
  const PB_MONTHS_12 = ['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];

  function buildPb(acct) {
    const p = PB_DATA[acct] || { notes:0, features:0, featureNames:[] };
    if (p.features === 0) return { pbCompanyId:null, pbCompanyName:acct, pbCompanyDomain:null, summary:{ totalNotes:0, totalFeatures:0, deliveredFeatures:0, pipelineFeatures:0, reviewFeatures:0, unlinkedNotes:0 }, features:[], unlinkedNotes:[] };
    const distTotal = PB_DIST_12.reduce((a,b)=>a+b,0);
    const noteSubjects = ['Quarterly review discussion','Feature request from client call','Product feedback from user','Annual roadmap planning','Enhancement request','User session notes','Support escalation feedback','New use-case discussion'];
    // Generate all note objects spread across months
    const allNoteObjects = [];
    let noteIdx = 0;
    PB_MONTHS_12.forEach((mo, mIdx) => {
      const count = Math.round(PB_DIST_12[mIdx] / distTotal * p.notes);
      for (let j = 0; j < count && noteIdx < p.notes; j++, noteIdx++) {
        const day = String(Math.min(j * 3 + 1, 28)).padStart(2,'0');
        allNoteObjects.push({ noteId:'note-'+noteIdx, noteName:noteSubjects[noteIdx%noteSubjects.length], noteExcerpt:'Feature discussed during client engagement — customer priority for upcoming roadmap.', noteUrl:'https://app.productboard.com/note/mock-'+noteIdx, createdAt:mo+'-'+day+'T10:00:00', processed:noteIdx%3!==0 });
      }
    });
    // Distribute notes across features
    const buckets = ['pipeline','pipeline','review','delivered','pipeline','pipeline','review'];
    const feats = p.featureNames.map((name,i) => {
      const start = Math.floor(i / p.featureNames.length * allNoteObjects.length);
      const end   = Math.floor((i+1) / p.featureNames.length * allNoteObjects.length);
      const featureNotes = allNoteObjects.slice(start, Math.max(start+1, end));
      return { featureId:'feat-'+i, featureName:name, status:['In progress','Planned','Under review','Released','Shaping'][i%5], bucket:buckets[i%buckets.length], description:'Customer-requested feature raised during client engagement.', noteCount:featureNotes.length, latestNoteAt:featureNotes.length>0?featureNotes[featureNotes.length-1].createdAt:'2026-07-01T10:00:00', notes:featureNotes };
    });
    const unlinked = allNoteObjects.slice(-2).map((n,i) => ({ ...n, noteId:'un-'+i }));
    return { pbCompanyId:'pb-'+acct.toLowerCase().replace(/\s/g,'-'), pbCompanyName:acct, pbCompanyDomain:acct.toLowerCase().replace(/\s/g,'')+'.com', summary:{ totalNotes:p.notes, totalFeatures:p.features, deliveredFeatures:feats.filter(f=>f.bucket==='delivered').length, pipelineFeatures:feats.filter(f=>f.bucket==='pipeline').length, reviewFeatures:feats.filter(f=>f.bucket==='review').length, unlinkedNotes:unlinked.length }, features:feats, unlinkedNotes:unlinked };
  }

  function buildPhTrends(acct) {
    const p = PH[acct] || { events30d:20, users:5 };
    const phMonths = ['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
    const weekly = phMonths.map((w,i) => {
      const ev = Math.round(p.events30d * (0.6 + 0.5 * Math.sin(i*0.5)));
      const u  = Math.max(1, Math.round(p.users * (0.7 + 0.3 * Math.sin(i*0.4))));
      return { weekStart:w+'-01', events:ev, users:u, investmentCases:Math.round(ev*0.45), leaderboards:Math.round(ev*0.30), benchmarks:Math.round(ev*0.15), untagged:Math.round(ev*0.10), investmentCasesUsers:Math.round(u*0.7), leaderboardsUsers:Math.round(u*0.6), benchmarksUsers:Math.round(u*0.4), untaggedUsers:Math.round(u*0.2) };
    });
    // One daily entry per month so day view (default) and month aggregation both show trend
    const daily = phMonths.map((m,i) => {
      const dayStart = m === '2026-08' ? '2026-08-04' : m + '-15';
      const ev = Math.round(p.events30d / 22 * (0.6 + 0.5 * Math.sin(i*0.5)));
      const u  = Math.max(1, Math.round(p.users * (0.3 + 0.2 * Math.sin(i*0.4))));
      return { dayStart, events:ev, users:u, investmentCases:Math.round(ev*0.45), leaderboards:Math.round(ev*0.30), benchmarks:Math.round(ev*0.15), untagged:Math.round(ev*0.10), investmentCasesUsers:Math.round(u*0.7), leaderboardsUsers:Math.round(u*0.6), benchmarksUsers:Math.round(u*0.4), untaggedUsers:Math.round(u*0.2) };
    });
    return { tenants:[acct.toLowerCase().replace(/\s/g,'')+'.com'], matchMethod:'Website Domain', summary:{ totalEvents:Math.round(p.events30d*12), uniqueUsers:p.users, events30d:p.events30d, events7d:Math.round(p.events30d*0.28), firstSeen:'2025-09-01', lastSeen:'2026-08-04', investmentCases:Math.round(p.events30d*12*0.45), leaderboards:Math.round(p.events30d*12*0.30), benchmarks:Math.round(p.events30d*12*0.15) }, weekly, daily, weeklyRuns:weekly.map(w=>({ weekStart:w.weekStart, icRuns:Math.round(w.investmentCases/4), lbRuns:Math.round(w.leaderboards/4), bmRuns:Math.round(w.benchmarks/4) })), dailyRuns:daily.map(d=>({ dayStart:d.dayStart, icRuns:Math.round((d.investmentCases||0)/4), lbRuns:Math.round((d.leaderboards||0)/4), bmRuns:Math.round((d.benchmarks||0)/4) })) };
  }

  function buildPhUsers(acct) {
    const p = PH[acct] || { users:5 };
    const domain = acct.toLowerCase().replace(/\s/g,'')+'.com';
    const names = Array.from({length:Math.min(p.users,6)},(_,i)=>['alex','jordan','sam','charlie','morgan','taylor'][i]+'@'+domain);
    return { account:acct, regionFilter:null, users:names.map((email,i)=>({ personId:'ph-'+i, personName:email, totalEvents:Math.round(p.users>1?p.events30d*12/p.users*(1-i*0.12):p.events30d*12), lastSeen:'2026-08-0'+(4-Math.min(i,3)), investmentCases:Math.round(80-i*10), leaderboards:Math.round(55-i*7), benchmarks:Math.round(35-i*5), untagged:12, regions:[{region:'GBR',runs:Math.round(40-i*5)}] })) };
  }

  function buildTimeline(acct) {
    const h = HEALTH[acct];
    const arr = h ? h.summary.total_arr_gbp : 200000;
    const d2r = h ? (h.subscriptions[0] ? h.subscriptions[0].days_to_renewal : 180) : 180;
    const ph = PH[acct] || { events30d:20 };
    // 19 months: 2025-02 → 2026-08
    const months = ['2025-02','2025-03','2025-04','2025-05','2025-06','2025-07','2025-08','2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
    const cases_d  = CASES[acct] || { total:20 };
    const opp_d    = OPPS[acct]  || { total:30, won:10 };
    // Support: derived from same ZD distribution as buildZd so bar counts match drilldown
    const zdTotal = (ZD[acct] || { total:0 }).total;
    const zdMonths12 = ['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08'];
    const zdCounts12 = zdMonths12.map(()=>0);
    for (let i = 0; i < zdTotal; i++) { zdCounts12[Math.floor(i / Math.max(1, zdTotal / zdMonths12.length)) % zdMonths12.length]++; }
    // 19-month window starts 2025-02; ZD window starts 2025-09 at index 7
    const support = months.map((_,i) => i < 7 ? 0 : (zdCounts12[i-7] || 0));
    // Usage: null for first 14 months (pre April 2026), then real-ish numbers
    const usageScale = ph.events30d / 65;
    const usage = months.map((_,i) => i < 14 ? null : Math.round([6,5,9,6,0][i-14] * usageScale));
    const cases = months.map((_,i) => Math.round([14,15,13,13,13,15,13,16,17,15,4,15,10,4,8,17,11,20,0][i] * (cases_d.total / 411)));
    const opp_won = months.map((_,i) => [49999,240499,56332,0,0,10000,0,31050,14705,324000,64338,0,0,295168,50662,57391,68339,0,0][i] * (opp_d.won / 92) || 0);
    // PB notes per month — same distribution as buildPb so bars match drilldown
    const pbNotes = (PB_DATA[acct] || { notes:0 }).notes;
    const pbDistTotal = PB_DIST_12.reduce((a,b)=>a+b,0);
    // 19-month window; PB window starts at index 7 (2025-09), same as ZD
    const product = months.map((_,i) => i < 7 ? 0 : Math.round(PB_DIST_12[i-7] / pbDistTotal * pbNotes));
    const subs = h ? h.subscriptions : [];
    const subTypes = subs.length > 0 ? Object.values(subs.reduce((acc,s) => {
      if(!acc[s.service_type]) acc[s.service_type]={service_type:s.service_type,cnt:0,arr_gbp:0};
      acc[s.service_type].cnt++; acc[s.service_type].arr_gbp+=s.arr_gbp||0; return acc;
    },{})) : [{service_type:'Subscription Analytics',cnt:10,arr_gbp:arr}];
    // Opportunities per month: counts from the 8 displayed opps in buildOpps (same OPP_MO_INDICES)
    const displayCount = Math.min(opp_d.total, 8);
    const opportunities = months.map((_,i) => { let n=0; for(let j=0;j<displayCount;j++){ if(OPP_MO_INDICES[j%OPP_MO_INDICES.length]===i) n++; } return n; });
    return { months, support, usage, product, cases, opportunities, opp_won_value:opp_won, opp_pipeline_value:months.map(()=>0), opp_by_close_date:{}, subscription:{ startDate:'2024-01-01', endDate:'2027-01-01', arr, count:subs.length||10, daysToRenewal:d2r, percentThrough:58 }, subscriptionTypes:subTypes, benchmark:{ support:{p25:0,p50:1,p75:3,p90:8}, usage:{p25:1,p50:1,p75:2,p90:3}, product:{p25:0,p50:0.3,p75:1.2,p90:4}, cases:{p25:0,p50:0.5,p75:1.5,p90:4}, opps:{p25:0,p50:0.3,p75:1,p90:3} }, hasZd:true, hasPh:true, hasPb:(PB_DATA[acct]?.features||0)>0, hasSf:true };
  }

  function buildPhRegions(acct) {
    const p = PH[acct] || { events30d:20, users:5 };
    const regions = PH_REGIONS[acct] || ['gbr'];
    const features = ['investment-cases','leaderboards','benchmarks'];
    const weights  = [0.45, 0.30, 0.15];
    const rows = [];
    regions.forEach((r, ri) => {
      const scale = (1 / regions.length) * (1 - ri * 0.08);
      features.forEach((f, fi) => {
        const runs = Math.round(p.events30d * scale * weights[fi]);
        if (runs > 0) rows.push({ region:r, feature:f, runs, unique_users:Math.max(1, Math.round(p.users / regions.length)) });
      });
    });
    return rows;
  }

  function buildPhRegionDetail(acct, regionCode) {
    const p = PH[acct] || { events30d:20, users:5 };
    const domain = acct.toLowerCase().replace(/\s/g,'')+'.com';
    const ZONE_MAP = { gbr:['GB-North','GB-South'], deu:['DE-Zone'], fra:['FR-Zone'], ibe:['ES-Zone','PT-Zone'], nod:['NO1','NO2'], swe:['SE1','SE2'], nld:['NL-Zone'], pol:['PL-Zone'] };
    const zones = ZONE_MAP[regionCode] || ['Default'];
    const base  = Math.round(p.events30d / 3);
    const richDetail = [
      { feature:'investment-cases', tenant:domain, scenario:'Base Case',      region:regionCode, price_zone:zones[0],              currency:'GBP', runs:Math.round(base*0.45*0.6) },
      { feature:'investment-cases', tenant:domain, scenario:'High Scenario',  region:regionCode, price_zone:zones[0],              currency:'GBP', runs:Math.round(base*0.45*0.4) },
      ...zones.slice(0,2).map(pz => ({ feature:'leaderboards',  tenant:domain, region:regionCode, price_zone:pz, runs:Math.round(base*0.30/Math.max(zones.length,1)) })),
      { feature:'benchmarks',       tenant:domain, price_zone:zones[0], region:regionCode, runs:Math.round(base*0.15) },
    ];
    return { detail:richDetail, richDetail };
  }

  function buildPhSankey(acct, regionCode) {
    const p = PH[acct] || { events30d:20, users:5 };
    const regions = PH_REGIONS[acct] || ['gbr'];
    const active  = regionCode ? [regionCode] : regions;
    const CTR = { gbr:['United Kingdom','Ireland'], deu:['Germany','Austria'], fra:['France'], ibe:['Spain','Portugal'], nod:['Norway','Denmark','Finland'], swe:['Sweden'], nld:['Netherlands','Belgium'], pol:['Poland'] };
    const RNAMES = { gbr:'GBR', deu:'Germany', fra:'France', ibe:'Iberia', nod:'Nordic', swe:'Sweden', nld:'Netherlands', pol:'Poland' };
    // Build unique country list then region list
    const countryNames = [];
    active.forEach(r => (CTR[r]||['United Kingdom']).forEach(c => { if (!countryNames.includes(c)) countryNames.push(c); }));
    const nodes = [
      ...countryNames.map(name => ({ name, type:'country' })),
      ...active.map(r => ({ name:RNAMES[r]||r.toUpperCase(), type:'region', region:r })),
    ];
    const links = [];
    active.forEach(r => {
      const rIdx = countryNames.length + active.indexOf(r);
      (CTR[r]||['United Kingdom']).forEach(c => {
        const cIdx = countryNames.indexOf(c);
        if (cIdx === -1) return;
        links.push({ source:cIdx, target:rIdx, value:Math.max(1, Math.round(p.events30d / (active.length * (CTR[r]||[c]).length))) });
      });
    });
    return { nodes, links, mode:regionCode ? 'country-region-filtered' : 'overview', region:regionCode||null };
  }

  // ── Fetch interceptor ─────────────────────────────────────────────────────
  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    const u = String(url);
    const acct = getAccount(u);
    const h = acct && HEALTH[acct] ? HEALTH[acct] : null;

    if (u.includes('/api/accounts-list'))             return ok({ accounts: ACCOUNTS.map(n=>({name:n,value:n})) });
    if (u.match(/\/api\/accounts\/[^/?]/))             return ok(h ? { ...h, account:acct } : { account:acct, summary:{ total_subscriptions:0, active_subscriptions:0, total_arr_gbp:0, renewals_next_30_days:0, renewals_next_90_days:0, health_status:'HEALTHY' }, contract_cards:[], subscriptions:[] });
    if (u.includes('/api/client-timeline'))            return ok(buildTimeline(acct));
    if (u.includes('/api/sf-cases'))                   return ok(buildCases(acct));
    if (u.includes('/api/sf-opportunities'))           return ok(buildOpps(acct));
    if (u.includes('/api/zd-tickets'))                 return ok(buildZd(acct));
    if (u.includes('/api/pb-insights'))                return ok(buildPb(acct));
    if (u.includes('/api/ph-trends'))                  return ok(buildPhTrends(acct));
    if (u.includes('/api/ph-users'))                   return ok(buildPhUsers(acct));
    if (u.includes('/api/ph-regions'))      return ok(buildPhRegions(acct));
    if (u.includes('/api/ph-region-detail')){ const rm=u.match(/[?&]region=([^&]+)/); return ok(buildPhRegionDetail(acct, rm?decodeURIComponent(rm[1]):null)); }
    if (u.includes('/api/ph-sankey'))       { const rm=u.match(/[?&]region=([^&]+)/); return ok(buildPhSankey(acct, rm?decodeURIComponent(rm[1]):null)); }
    if (u.includes('/api/sw-intelligence'))            return ok(SW_INTEL);
    if (u.includes('/api/current-user'))               return ok({ name:'Demo User', initials:'DU', email:'demo@auroraer.com' });
    if (u.includes('/api/integration-status'))         return ok({ status:'ok', sources:[] });
    if (u.includes('/api/lakehouse-status'))           return ok({ status:'ok', layers:[] });
    if (u.includes('/api/mdm-accounts'))               return ok({ accounts:[] });
    if (u.includes('/api/features'))                   return ok({ features:[] });

    return _origFetch(url, opts);
  };

  // Propagate mock flag to SW Intelligence iframe when x-dc renders it
  const _patchIframe = el => {
    if (el.tagName==='IFRAME' && el.src.includes('sw-intelligence') && !el.src.includes('mock')) {
      el.src += (el.src.includes('?')?'&':'?') + 'mock=true';
    }
  };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType!==1) return;
    if (n.tagName==='IFRAME') _patchIframe(n);
    n.querySelectorAll && n.querySelectorAll('iframe').forEach(_patchIframe);
  }))).observe(document.documentElement, { childList:true, subtree:true });
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('iframe[src*="sw-intelligence"]').forEach(_patchIframe));

  // Tag the accounts cache as mock-generated so live version skips it
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
      try {
        const raw = JSON.parse(localStorage.getItem('argusAccountsCache') || 'null');
        if (raw && raw.accounts) { raw.mock = true; localStorage.setItem('argusAccountsCache', JSON.stringify(raw)); }
      } catch(e) {}
    }, 3000);
  });

  // Hide MDM and Features nav links in mock mode (CSS wins regardless of x-dc render timing)
  document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = '#navMdm, #navFeatures { display: none !important; }';
    document.head.appendChild(style);
  });

  // "Mock data" badge + "?" tour button — fixed overlay on nav, health card only
  document.addEventListener('DOMContentLoaded', function() {
    var wrap = document.createElement('div');
    wrap.id = 'mock-nav-wrap';
    wrap.style.cssText = 'position:fixed;top:0;left:440px;height:60px;display:none;align-items:center;gap:8px;z-index:200;pointer-events:auto;';
    wrap.innerHTML =
      '<span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;background:#ffcc00;color:#3c3c3b;padding:3px 10px;border-radius:20px;">Mock data</span>'
      + '<button id="tour-relaunch" title="Show walkthrough" style="width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.12);color:#fff;border:1.5px solid rgba(255,255,255,0.25);font-size:12px;font-weight:700;cursor:pointer;line-height:1;">?</button>';
    document.body.appendChild(wrap);

    document.getElementById('tour-relaunch').onclick = function() {
      sessionStorage.removeItem('argusTourDone');
      if (document.getElementById('argus-tour-card')) return;
      window.__launchTour && window.__launchTour();
    };

    // Show only when health card is active
    setInterval(function() {
      var sel = document.getElementById('sfAccountSelector');
      var onHealth = sel && sel.offsetParent !== null;
      wrap.style.display = onHealth ? 'flex' : 'none';
    }, 300);
  });

  // ── Guided walkthrough ────────────────────────────────────────────────────
  var TOUR_STEPS = [
    {
      title: 'Select a client',
      body:  'Choose any account from the dropdown to load their full data profile across Salesforce, Zendesk, PostHog and ProductBoard.',
      pulse: '#sfAccountSelector'
    },
    {
      title: 'Read the timeline',
      body:  'The 18-month chart shows support tickets, product engagement, usage and opportunities in one view. Click any bar to drill into individual records.',
      pulse: null
    },
    {
      title: 'Explore regional usage',
      body:  'Scroll down to the PostHog section — click a region bubble on the map to see a Sankey flow of how users move through the product.',
      pulse: null
    },
    {
      title: 'Switch views',
      body:  'Use the left nav to move between Client health, Build status, SW Intelligence and more. MDM and Feature priority are available on the live version.',
      pulse: null
    },
    {
      title: 'This is a prototype',
      body:  'All values are representative, modelled from real API shapes. The live version connects directly to Aurora\'s Fabric lakehouse.',
      pulse: null
    }
  ];

  function _launchTour() {
    if (document.getElementById('argus-tour-card')) return;
    var step = 0;
      var pulseEl = null;

      if (!document.getElementById('argus-tour-kf')) {
        var kf = document.createElement('style');
        kf.id = 'argus-tour-kf';
        kf.textContent = [
          '@keyframes tourIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
          '@keyframes tourPulse{0%,100%{box-shadow:0 0 0 0 rgba(0,190,134,0.6)}50%{box-shadow:0 0 0 6px rgba(0,190,134,0)}}'
        ].join('');
        document.head.appendChild(kf);
      }

      var card = document.createElement('div');
      card.id = 'argus-tour-card';
      card.style.cssText = 'position:fixed;bottom:52px;left:50%;transform:translateX(-50%);width:400px;background:#3c3c3b;color:#fff;border-radius:14px;padding:20px 24px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.35);z-index:99998;font-family:inherit;animation:tourIn 0.3s ease;';
      document.body.appendChild(card);

      function clearPulse() {
        if (pulseEl) { pulseEl.style.animation = ''; pulseEl.style.outline = ''; pulseEl = null; }
      }

      function applyPulse(sel) {
        clearPulse();
        if (!sel) return;
        var el = document.querySelector(sel);
        if (!el) return;
        pulseEl = el;
        el.style.animation = 'tourPulse 1.4s ease infinite';
        el.style.outline = '2px solid #00be86';
        el.style.borderRadius = '6px';
      }

      function render() {
        var s = TOUR_STEPS[step];
        var dots = TOUR_STEPS.map(function(_, i) {
          return '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;margin:0 3px;background:' + (i === step ? '#00be86' : 'rgba(255,255,255,0.25)') + '"></span>';
        }).join('');
        var isLast = step === TOUR_STEPS.length - 1;
        card.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
            + '<span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);">Step ' + (step + 1) + ' of ' + TOUR_STEPS.length + '</span>'
            + '<button id="tour-skip" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer;padding:0;line-height:1;">&#x2715; Skip</button>'
          + '</div>'
          + '<div style="font-size:15px;font-weight:700;margin-bottom:6px;">' + s.title + '</div>'
          + '<div style="font-size:13px;color:rgba(255,255,255,0.72);line-height:1.55;margin-bottom:16px;">' + s.body + '</div>'
          + '<div style="display:flex;align-items:center;justify-content:space-between;">'
            + '<div>' + dots + '</div>'
            + '<button id="tour-next" style="background:#00be86;color:#fff;border:none;border-radius:7px;padding:7px 20px;font-size:12px;font-weight:700;cursor:pointer;">' + (isLast ? 'Got it' : 'Next &rarr;') + '</button>'
          + '</div>';

        document.getElementById('tour-skip').onclick = dismiss;
        document.getElementById('tour-next').onclick = isLast ? dismiss : advance;
        applyPulse(s.pulse);
      }

      function advance() { step++; render(); }

      function dismiss() {
        clearPulse();
        sessionStorage.setItem('argusTourDone', '1');
        card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(-50%) translateY(8px)';
        setTimeout(function() { card.remove(); }, 220);
      }

    render();
  }

  window.__launchTour = _launchTour;

  document.addEventListener('DOMContentLoaded', function() {
    if (!sessionStorage.getItem('argusTourDone')) setTimeout(_launchTour, 1500);
  });
})();
