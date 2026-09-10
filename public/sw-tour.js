// Region Intelligence — Software Health / Total Client Engagement tour (Driver.js v0.9.x)
(function () {

  function exists(sel) {
    return !!document.querySelector(sel);
  }
  function visible(sel) {
    var el = document.querySelector(sel);
    return !!(el && el.getBoundingClientRect().height > 0);
  }

  // One Driver instance for the lifetime of the page — avoids event-listener accumulation
  // that causes steps to be skipped when the tour is run more than once.
  var _d = null;
  function getDriver() {
    if (!_d) {
      _d = new Driver({
        animate: true, opacity: 0.72, padding: 8, allowClose: true,
        overlayClickNext: false, doneBtnText: 'Done', closeBtnText: 'Skip',
        nextBtnText: 'Next &rarr;', prevBtnText: '&larr; Back',
        onReset: function () { if (window.posthog) posthog.capture('tour_dismissed'); },
      });
    }
    return _d;
  }

  function startTour() {
    if (typeof Driver === 'undefined') {
      console.warn('Driver.js not loaded');
      return;
    }

    var d = getDriver();
    try { d.reset(); } catch (e) {}

    var isTCE = !!(document.getElementById('eng-tab') &&
                   document.getElementById('eng-tab').classList.contains('active'));

    var steps = [];

    if (isTCE) {
      // ── Total Client Engagement tab ────────────────────────────────────────
      steps.push({
        element: '#eng-tab',
        stageBackground: 'transparent',
        popover: {
          title: 'Total Client Engagement',
          description: 'Aggregate EOS product usage across all Aurora accounts &mdash; software runs, downloads, webinars, group meetings, and API calls &mdash; broken down by energy market and time period. Switch to <strong>Software Health</strong> for per-account detail.',
          position: 'bottom', closeBtnText: 'Skip tour',
        },
      });

      // Filter pane — sticky but visible when TCE tab is active
      if (visible('#eng-filter-pane')) {
        steps.push({
          element: '#eng-filter-pane',
          stageBackground: 'transparent',
          popover: {
            title: 'Filters',
            description: 'Filter by <strong>energy market</strong> (APAC, EMEA, LATAM, NORAM) and <strong>date period</strong>. Use the preset buttons for common ranges or set a custom From / To date. All charts and tables update instantly.',
            position: 'bottom',
          },
        });
      }

      // All sections below are inside #eng-content (display:none until data loads)
      if (visible('#eng-summary')) {
        steps.push({
          element: '#eng-summary',
          popover: {
            title: 'Engagement summary',
            description: 'Top-level KPIs across all engagement streams &mdash; software runs, report downloads, webinar attendees, group meeting attendees, platform plays, and support cases. Each tile shows the total for the selected market and period.',
            position: 'bottom',
          },
        });
      }

      if (visible('#eng-runs-panel')) {
        steps.push({
          element: '#eng-runs-panel',
          popover: {
            title: 'Software runs',
            description: 'Monthly EOS software run activity broken down by product. Spot seasonal patterns and see which products are driving the most client usage.',
            position: 'bottom',
          },
        });
      }

      if (visible('#eng-dl-panel')) {
        steps.push({
          element: '#eng-dl-panel',
          popover: {
            title: 'Report downloads',
            description: 'Monthly download activity showing how many clients are consuming Aurora\'s published research and data deliverables.',
            position: 'bottom',
          },
        });
      }

      if (visible('#eng-mix')) {
        steps.push({
          element: '#eng-mix',
          popover: {
            title: 'Regional distribution by stream',
            description: 'Horizontal bar chart showing how each engagement stream (runs, downloads, webinars, etc.) is distributed across energy markets. Quickly see which regions dominate each activity type.',
            position: 'top',
          },
        });
      }

      if (visible('#eng-table')) {
        steps.push({
          element: '#eng-table',
          popover: {
            title: 'Regional breakdown',
            description: 'Side-by-side comparison of all engagement streams for each energy market. Sort by any column to rank regions by their most active stream.',
            position: 'top',
          },
        });
      }

      if (visible('#eng-timetable')) {
        steps.push({
          element: '#eng-timetable',
          popover: {
            title: 'Breakdown over time',
            description: 'Month-by-month engagement across all streams. Spot seasonal trends, growth patterns, and any sudden changes in client activity over the selected period.',
            position: 'top',
          },
        });
      }

      if (visible('#eng-marketdrill')) {
        steps.push({
          element: '#eng-marketdrill',
          popover: {
            title: 'Market detail',
            description: 'Drills from billing region down to individual energy market. See exactly which markets within each region are generating the most activity across all engagement streams.',
            position: 'top',
          },
        });
      }

      if (window.posthog) posthog.capture('tour_started', { page: 'tce-tab' });

    } else {
      // ── Software Health tab ────────────────────────────────────────────────
      // Target each tab individually — different elements means Driver.js isSame
      // guard does not fire and each step renders with a proper dark overlay.
      steps.push({
        element: '#sw-tab',
        stageBackground: 'transparent',
        popover: {
          title: 'Software Health',
          description: 'Per-account renewal risk, EOS engagement, and health signals across your entire book of business. Use the filters below to slice by health status, product, account manager, and energy market.<br><br>Use the <strong>▶ / ◀</strong> triangle at the top left to collapse or expand the sidebar.',
          position: 'bottom', closeBtnText: 'Skip tour',
        },
      });
      steps.push({
        element: '#eng-tab',
        stageBackground: 'transparent',
        popover: {
          title: 'Total Client Engagement',
          description: 'Switch here for aggregate EOS usage across all accounts &mdash; software runs, downloads, webinars, and more &mdash; grouped by energy market and time period.',
          position: 'bottom',
        },
      });

      if (exists('#health-bar')) {
        steps.push({
          element: '#health-bar',
          popover: {
            title: 'Health status filters',
            description: 'Filter accounts by health status &mdash; Terminating, Overdue, At Risk, To Watch, or Healthy. The count on each pill updates as filters are applied.',
            position: 'bottom',
          },
        });
      }

      if (exists('#ch-kpi-row')) {
        steps.push({
          element: '#ch-kpi-row',
          popover: {
            title: 'Account KPIs',
            description: 'Summary counts at a glance &mdash; how many accounts are in each health state and the overall renewal outlook across your book of business.',
            position: 'bottom',
          },
        });
      }

      if (exists('#cl-search')) {
        steps.push({
          element: '#cl-search',
          popover: {
            title: 'Account search',
            description: 'Search by account name or parent company. Press Enter or click Search to filter the list.',
            position: 'bottom',
          },
        });
      }

      if (exists('#cl-sw')) {
        steps.push({
          element: '#cl-sw',
          popover: {
            title: 'Product filter',
            description: 'Narrow the account list to clients with a specific EOS product subscription &mdash; useful for product-line health reviews.',
            position: 'bottom',
          },
        });
      }

      if (visible('#cl-am')) {
        steps.push({
          element: '#cl-am',
          popover: {
            title: 'Account manager filter',
            description: 'Filter by account manager to see only your own book or a colleague\'s. Combine with health status for a focused pipeline view.',
            position: 'bottom',
          },
        });
      }

      if (exists('#clear-all-btn')) {
        steps.push({
          element: '#clear-all-btn',
          popover: {
            title: 'Clear all filters',
            description: 'Resets all active filters &mdash; search, product, account manager, health status, signals, and region &mdash; back to the full default view.',
            position: 'bottom',
          },
        });
      }

      if (exists('#region-bar')) {
        steps.push({
          element: '#region-bar',
          popover: {
            title: 'Energy market filter',
            description: 'Narrow the list to a specific energy market or billing region. Combine with health and product filters for targeted territory reviews.',
            position: 'bottom',
          },
        });
      }

      // Signals filter bar — target the whole row for a meaningful highlight
      if (exists('#signal-bar')) {
        steps.push({
          element: '#signal-bar',
          popover: {
            title: 'Renewal &amp; risk signals',
            description: 'Filter by specific renewal or risk signals: Termination notices, contracts renewing within 3 or 6 months, Cross-sell opportunities, ZD Tickets, and open Opportunities.',
            position: 'bottom',
          },
        });
      }

      // Account table — explains expandable rows and Client Health button
      if (visible('#client-table')) {
        steps.push({
          element: '#client-table',
          popover: {
            title: 'Account table',
            description: 'Each row shows an account\'s ARR, renewal signals, and ZD / pipeline summary. <strong>Click a row</strong> to expand it and see per-product subscription detail. Use the <strong>&ldquo;Client Health &rarr;&rdquo;</strong> button to open the full account health card.',
            position: 'top',
          },
        });
      }

      if (window.posthog) posthog.capture('tour_started', { page: 'sw-health' });
    }

    d.defineSteps(steps);
    d.start();
  }

  window.argusStartTour = startTour;
})();
