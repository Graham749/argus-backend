// Argus product tour — Driver.js v0.9.x (vanilla JS)
// Note: epCard and eosEngCard are display:none without an account selected — excluded from tour
(function () {
  function startTour() {
    if (typeof Driver === 'undefined') {
      console.warn('Driver.js not loaded');
      return;
    }

    var driverObj = new Driver({
      animate: true,
      opacity: 0.72,
      padding: 8,
      allowClose: true,
      overlayClickNext: false,
      doneBtnText: 'Done',
      closeBtnText: 'Skip',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Back',
      onReset: function () {
        if (window.posthog) posthog.capture('tour_dismissed');
      },
    });

    driverObj.defineSteps([
      {
        element: 'body',
        stageBackground: 'transparent',
        popover: {
          title: 'Welcome to Argus',
          description:
            'Argus is your unified account health dashboard &mdash; combining PostHog usage, Salesforce subscriptions, Zendesk tickets, and Productboard insights in one place. This short tour walks you through the key features.',
          position: 'mid-center',
          closeBtnText: 'Skip tour',
        },
      },
      {
        element: '#sfAcctSearchWrap',
        popover: {
          title: 'Account selector',
          description:
            'Start here. Type any client name to search and select an account. Every widget on the page updates instantly to show that account\'s data.',
          position: 'bottom',
        },
      },
      {
        element: '#sfCard',
        popover: {
          title: 'Salesforce subscriptions',
          description:
            'Active subscription lines from Salesforce &mdash; products, contract dates, and values. Your single source of truth for what the client is paying for.',
          position: 'bottom',
        },
      },
      {
        element: '#sfOppsCard',
        popover: {
          title: 'Open opportunities',
          description:
            'Salesforce pipeline opportunities linked to this account &mdash; renewals, upsells, and new deals with their stage and expected close date.',
          position: 'bottom',
        },
      },
      {
        element: '#sfCasesCard',
        popover: {
          title: 'Salesforce cases',
          description:
            'Open and recent support cases from Salesforce &mdash; status, priority, and owner. Know what issues your client is experiencing before you pick up the phone.',
          position: 'bottom',
        },
      },
      {
        element: '#zdTicketsCard',
        popover: {
          title: 'Zendesk tickets',
          description:
            'Support tickets from Zendesk including the full comment thread. Complements Salesforce cases with the detailed conversation history.',
          position: 'bottom',
        },
      },
      {
        element: '#pbInsightsCard',
        popover: {
          title: 'Productboard insights',
          description:
            'Feedback notes and feature requests linked to this account in Productboard &mdash; what your client has told the product team they need.',
          position: 'bottom',
        },
      },
      {
        element: '#phInsightsCard',
        popover: {
          title: 'PostHog analytics',
          description:
            'Usage signals from PostHog: product engagement, feature adoption, and session activity. Quickly see how actively the client is using Aurora\'s platform.',
          position: 'top',
        },
      },
      {
        element: '#navMdm',
        popover: {
          title: 'Account MDM',
          description:
            'The Account MDM view lets you browse and search the master account list &mdash; useful for finding account IDs and reviewing data quality across all Aurora clients.',
          position: 'right',
        },
      },
    ]);

    driverObj.start();
    if (window.posthog) posthog.capture('tour_started');
  }

  window.argusStartTour = startTour;

  // Event delegation — tourBtn is inside a dc-runtime template that renders after this script runs,
  // so getElementById at load time returns null. Delegating to document works whenever the button appears.
  document.addEventListener('click', function (e) {
    if (e.target.closest('#tourBtn')) {
      e.stopPropagation();
      startTour();
    }
  });
})();
