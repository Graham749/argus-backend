// Region Intelligence — Total Client Engagement tour (Driver.js v0.9.x)
// Used by the standalone /eos-engagement page (not the sw-intelligence.html TCE tab)
(function () {

  function visible(sel) {
    var el = document.querySelector(sel);
    return !!(el && el.getBoundingClientRect().height > 0);
  }

  function startTour() {
    if (typeof Driver === 'undefined') {
      console.warn('Driver.js not loaded');
      return;
    }

    var d = new Driver({
      animate: true, opacity: 0.72, padding: 8, allowClose: true,
      overlayClickNext: false, doneBtnText: 'Done', closeBtnText: 'Skip',
      nextBtnText: 'Next &rarr;', prevBtnText: '&larr; Back',
      onReset: function () { if (window.posthog) posthog.capture('tour_dismissed'); },
    });

    var steps = [
      {
        element: 'body',
        stageBackground: 'transparent',
        popover: {
          title: 'Total Client Engagement',
          description: 'This view shows EOS product usage across all Aurora accounts &mdash; software runs, downloads, webinars, and more &mdash; aggregated by region and time period.',
          position: 'mid-center', closeBtnText: 'Skip tour',
        },
      },
    ];

    if (visible('#region-bar')) {
      steps.push({
        element: '#region-bar',
        popover: {
          title: 'Region filter',
          description: 'Filter the engagement data by region &mdash; EMEA, APAC, NORAM, or LATAM. All KPIs and charts update instantly.',
          position: 'bottom',
        },
      });
    }

    // Period filter — use the first pill which always has content
    if (visible('#region-bar + .filter-bar') || visible('[data-p="all"]')) {
      var periodEl = document.querySelector('[data-p="all"]');
      if (periodEl && periodEl.getBoundingClientRect().height > 0) {
        steps.push({
          element: '[data-p="all"]',
          popover: {
            title: 'Period filter',
            description: 'Switch between All time, Last 12 months, or Last 3 months to focus the data on the period most relevant to your review.',
            position: 'bottom',
          },
        });
      }
    }

    if (visible('#series-table')) {
      steps.push({
        element: '#series-table',
        popover: {
          title: 'Monthly activity',
          description: 'Month-by-month engagement trends across all streams. Spot seasonal patterns or growth in specific markets. Hover any cell for the full detail.',
          position: 'top',
        },
      });
    }

    if (visible('#runs-market')) {
      steps.push({
        element: '#runs-market',
        popover: {
          title: 'Software runs by market',
          description: 'Software run volumes broken down by energy market &mdash; useful for spotting which regions are driving the most EOS usage.',
          position: 'top',
        },
      });
    }

    d.defineSteps(steps);
    d.start();
    if (window.posthog) posthog.capture('tour_started', { page: 'tce' });
  }

  window.argusStartTour = startTour;
})();
