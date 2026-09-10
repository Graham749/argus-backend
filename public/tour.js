// Argus product tour — Driver.js v0.9.x (vanilla JS)
(function () {

  // Static elements that are always in the DOM on their respective view use exists().
  // Elements that are conditionally shown (display:none without an account) use visible().
  function exists(sel) {
    return !!document.querySelector(sel);
  }
  function visible(sel) {
    var el = document.querySelector(sel);
    return !!(el && el.getBoundingClientRect().height > 0);
  }

  function makeDriver() {
    return new Driver({
      animate: true, opacity: 0.72, padding: 8, allowClose: true,
      overlayClickNext: false, doneBtnText: 'Done', closeBtnText: 'Skip',
      nextBtnText: 'Next &rarr;', prevBtnText: '&larr; Back',
      onReset: function () { if (window.posthog) posthog.capture('tour_dismissed'); },
    });
  }

  // ─── MDM tour ──────────────────────────────────────────────────────────────
  function startMdmTour() {
    var d = makeDriver();
    var steps = [
      {
        element: 'body',
        stageBackground: 'transparent',
        popover: {
          title: 'Account MDM',
          description: 'The Account MDM view is your master account list &mdash; every Aurora client with their Salesforce, Zendesk, Productboard, and PostHog linkages, and data quality metrics across all systems.',
          position: 'mid-center', closeBtnText: 'Skip tour',
        },
      },
    ];

    if (exists('#mdm-search')) {
      steps.push({
        element: '#mdm-search',
        popover: {
          title: 'Account search',
          description: 'Search by Salesforce name or ID, Zendesk org name or ID, or Productboard company. Press Enter or click Search to filter the table.',
          position: 'bottom',
        },
      });
    }

    if (exists('#mdm-collapseall-btn')) {
      steps.push({
        element: '#mdm-collapseall-btn',
        popover: {
          title: 'Coverage widgets',
          description: 'Five widgets above show data quality across dimensions &mdash; source system counts, cross-system match criteria, and ZD / PB / PostHog match confidence. Click the <strong>Expand widgets</strong> button or click any widget header triangle (&#9660; / &#9650;) to expand it.',
          position: 'bottom',
        },
      });
    }

    if (exists('#mdm-tbody')) {
      steps.push({
        element: '#mdm-tbody',
        popover: {
          title: 'Account table',
          description: 'Every SF account with its linked ZD org, PB company, and PostHog tenant. <strong>Click any row</strong> to expand it and see the full detail panel with IDs, domains, and usage metrics. Use <strong>&ldquo;&rarr; View Client health card&rdquo;</strong> in the expanded row to jump straight to that account in Client Health.',
          position: 'top',
        },
      });
    }

    d.defineSteps(steps);
    d.start();
    if (window.posthog) posthog.capture('tour_started', { page: 'mdm' });
  }

  // ─── Client Health tour ────────────────────────────────────────────────────
  function startClientHealthTour() {
    var d = makeDriver();
    var steps = [
      {
        element: 'body',
        stageBackground: 'transparent',
        popover: {
          title: 'Welcome to Argus',
          description: 'Argus is your unified account health dashboard &mdash; combining PostHog usage, Salesforce subscriptions, Zendesk tickets, and Productboard insights in one place.',
          position: 'mid-center', closeBtnText: 'Skip tour',
        },
      },
    ];

    // Account selector — always present
    if (exists('#sfAcctSearchWrap')) {
      steps.push({
        element: '#sfAcctSearchWrap',
        popover: {
          title: 'Account selector',
          description: 'Start here. Type any client name to search and select an account. Every widget updates instantly.',
          position: 'bottom',
        },
      });
    }

    // Expand / collapse — the Expand All button sits in the account selector row and is always visible
    if (exists('#collapseAllBtn')) {
      steps.push({
        element: '#collapseAllBtn',
        popover: {
          title: 'Expand &amp; collapse widgets',
          description: 'Click <strong>Expand All</strong> or <strong>Collapse All</strong> to manage all cards at once. You can also click any individual card header &mdash; the triangle (&#9660; / &#9650;) on the right of each card shows whether it is collapsed or open.',
          position: 'bottom',
        },
      });
    }

    // Engagement Pulse — only visible after account is selected
    if (visible('#epCard')) {
      steps.push({
        element: '#epCard',
        popover: {
          title: 'Engagement Pulse',
          description: 'A quick-glance account health score combining signals across all data sources &mdash; EOS software runs and downloads, PostHog platform usage, open Zendesk tickets, Salesforce renewal proximity, and pipeline opportunities. Gives you an at-a-glance read on account engagement before diving into the detail widgets below.',
          position: 'bottom',
        },
      });
    }

    // Individual widget expand — highlight the SF card header as the example
    if (exists('#sfCardHeader')) {
      steps.push({
        element: '#sfCardHeader',
        popover: {
          title: 'Expand &amp; collapse individual widgets',
          description: 'Click any card header to collapse or expand that widget. The triangle (&#9660; / &#9650;) on the right shows the current state &mdash; useful for hiding widgets you don\'t need and keeping focus on what matters.',
          position: 'bottom',
        },
      });
    }

    // Salesforce subscriptions — always present (shows "select account" placeholder)
    if (exists('#sfCard')) {
      steps.push({
        element: '#sfCard',
        popover: {
          title: 'Salesforce subscriptions',
          description: 'Active subscription lines &mdash; products, contract dates, and ARR values. A bar chart shows ARR and renewal dates across time; use the service type pills to filter by Software, Analytics, or Admin. Click any risk status pill to drill into individual subscription lines &mdash; use <strong>&larr; Back to Summary</strong> to return.',
          position: 'bottom',
        },
      });
    }

    // Opportunities — always present
    if (exists('#sfOppsCard')) {
      steps.push({
        element: '#sfOppsCard',
        popover: {
          title: 'Salesforce opportunities',
          description: 'Pipeline opportunities linked to this account &mdash; renewals, upsells, and new deals with their stage and expected close date.',
          position: 'bottom',
        },
      });
    }
    if (exists('#oppsCardHeader')) {
      steps.push({
        element: '#oppsCardHeader',
        popover: {
          title: 'Opportunities drilldown',
          description: 'When expanded, a timeline shows opportunity close dates. Click <strong>Open</strong>, <strong>Won</strong>, <strong>Lost</strong>, or a stage pill to drill into matching records. Use <strong>&larr; Back to Summary</strong> to return to the overview.',
          position: 'bottom',
        },
      });
    }

    // EOS engagement — only shown after account is selected
    if (visible('#eosEngCard')) {
      steps.push({
        element: '#eosEngCard',
        popover: {
          title: 'EOS Engagement',
          description: 'Software runs and report downloads from the EOS platform &mdash; total volume, recent trend, active users, and per-product breakdown.',
          position: 'bottom',
        },
      });
      steps.push({
        element: '#eosEngHeader',
        popover: {
          title: 'EOS activity breakdown',
          description: 'When expanded, bar charts show monthly run and download activity broken down by EOS product. Spot which products are being actively used and identify any drop-off in engagement over time.',
          position: 'bottom',
        },
      });
    }

    // Cases — always present
    if (exists('#sfCasesCard')) {
      steps.push({
        element: '#sfCasesCard',
        popover: {
          title: 'Salesforce cases',
          description: 'Open and recent support cases &mdash; status, priority, and owner. Know what issues your client is experiencing before you pick up the phone.',
          position: 'bottom',
        },
      });
    }
    if (exists('#casesCardHeader')) {
      steps.push({
        element: '#casesCardHeader',
        popover: {
          title: 'Cases timeline &amp; drilldown',
          description: 'When expanded, a bar chart shows case volume over time. Click <strong>Open</strong>, <strong>Escalated</strong>, <strong>Delivered</strong>, or a case type pill to drill into matching records with subject, status, hours, and assignee detail.',
          position: 'bottom',
        },
      });
    }

    // Zendesk — always present
    if (exists('#zdTicketsCard')) {
      steps.push({
        element: '#zdTicketsCard',
        popover: {
          title: 'Zendesk tickets',
          description: 'Support tickets from Zendesk including resolution time and reply metrics. Complements Salesforce cases with the operational support detail.',
          position: 'bottom',
        },
      });
    }
    if (exists('#zdCardHeader')) {
      steps.push({
        element: '#zdCardHeader',
        popover: {
          title: 'Tickets timeline &amp; drilldown',
          description: 'When expanded, a bar chart tracks monthly ticket volume. Click <strong>Open</strong>, <strong>Pending</strong>, <strong>Solved</strong>, or <strong>Closed</strong> to drill into those tickets with subject, priority, time spent, and reply count.',
          position: 'bottom',
        },
      });
    }

    // Productboard — always present
    if (exists('#pbInsightsCard')) {
      steps.push({
        element: '#pbInsightsCard',
        popover: {
          title: 'Productboard insights',
          description: 'Feedback notes and feature requests linked to this account &mdash; what your client has told the product team they need.',
          position: 'bottom',
        },
      });
    }
    if (exists('#pbCardHeader')) {
      steps.push({
        element: '#pbCardHeader',
        popover: {
          title: 'Feedback drilldown',
          description: 'When expanded, a timeline shows note volume over time. Click <strong>Notes</strong>, <strong>Delivered</strong>, <strong>In Pipeline</strong>, or <strong>Unlinked</strong> to expand the matching feedback items and the product features they are linked to.',
          position: 'bottom',
        },
      });
    }

    // PostHog — always present
    if (exists('#phInsightsCard')) {
      steps.push({
        element: '#phInsightsCard',
        popover: {
          title: 'PostHog analytics',
          description: 'Usage signals from PostHog: product engagement, feature adoption, and session activity. Quickly see how actively the client is using Aurora\'s platform.',
          position: 'top',
        },
      });
    }
    if (exists('#phCardHeader')) {
      steps.push({
        element: '#phCardHeader',
        popover: {
          title: 'Usage stats &amp; drilldown',
          description: 'When expanded, summary tiles show unique users, total events, and Flexplorer run counts (Leaderboards, Investment Cases, Benchmarks). Click the <strong>Users</strong> or <strong>Market Regions</strong> tile to drill into individual user sessions and active markets.',
          position: 'top',
        },
      });
    }

    d.defineSteps(steps);
    d.start();
    if (window.posthog) posthog.capture('tour_started');
  }

  // ─── Entry point ───────────────────────────────────────────────────────────
  function startTour() {
    if (typeof Driver === 'undefined') {
      console.warn('Driver.js not loaded');
      return;
    }

    var currentView = localStorage.getItem('argusView') || 'health';

    if (currentView === 'swIntelligence') {
      var frame = document.querySelector('iframe[src*="sw-intelligence"]');
      if (frame && frame.contentWindow && frame.contentWindow.argusStartTour) {
        frame.contentWindow.argusStartTour();
      }
      return;
    }

    if (currentView === 'mdm') {
      startMdmTour();
      return;
    }

    startClientHealthTour();
  }

  window.argusStartTour = startTour;

  // Event delegation — tourBtn is inside a dc-runtime template rendered after this script.
  document.addEventListener('click', function (e) {
    if (e.target.closest('#tourBtn')) {
      e.stopPropagation();
      startTour();
    }
  });
})();
