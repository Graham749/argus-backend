/**
 * Argus ↔ Fabric Metadata Sync
 * Fetches available data sources from Fabric and updates Argus UI
 */

const API_BASE = process.env.FABRIC_API_URL || 'http://localhost:3000/api';

// Fetch data sources from Fabric metadata API
async function syncDataSources() {
  try {
    console.log('[Sync] Fetching data sources from Fabric...');

    const response = await fetch(`${API_BASE}/data-sources/minimal`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const dataSources = await response.json();
    console.log('[Sync] ✅ Retrieved data sources:', Object.keys(dataSources));

    // Update Argus widget
    updateArgusUI(dataSources);

    return dataSources;
  } catch (err) {
    console.error('[Sync] Error:', err.message);
    return null;
  }
}

// Update Argus Build Status widget with live data
function updateArgusUI(dataSources) {
  // Primary sources (Medallion layer)
  const primarySources = ['Productboard', 'Salesforce', 'Product Operations'];
  const secondarySources = ['Posthog', 'Zendesk', 'Jira'];

  // Build HTML for widget
  let html = '<div class="data-sources-grid">';

  // Primary section
  html += '<div class="source-section primary">';
  html += '<h3>Medallion Layer Data Sources</h3>';
  primarySources.forEach(source => {
    if (dataSources[source]) {
      html += `
        <div class="source-card">
          <div class="source-name">${source}</div>
          <div class="source-views">${dataSources[source].length} views</div>
          <div class="source-list">
            ${dataSources[source].map(v => `<code>${v}</code>`).join('')}
          </div>
        </div>
      `;
    }
  });
  html += '</div>';

  // Secondary section
  html += '<div class="source-section secondary">';
  html += '<h3>Observability & Support</h3>';
  secondarySources.forEach(source => {
    if (dataSources[source]) {
      html += `
        <div class="source-card">
          <div class="source-name">${source}</div>
          <div class="source-views">${dataSources[source].length} views</div>
        </div>
      `;
    }
  });
  html += '</div>';

  html += '</div>';

  // Inject into Argus (if running in browser)
  if (typeof document !== 'undefined') {
    const widget = document.getElementById('build-status-widget');
    if (widget) {
      widget.innerHTML = html;
      console.log('[Sync] Updated Argus Build Status widget');
    }
  }

  return html;
}

// Auto-sync on interval
function startAutoSync(interval = 5 * 60 * 1000) {
  console.log(`[Sync] Starting auto-sync every ${interval / 1000} seconds`);

  // Initial sync
  syncDataSources();

  // Periodic sync
  setInterval(syncDataSources, interval);
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { syncDataSources, updateArgusUI, startAutoSync };
}
