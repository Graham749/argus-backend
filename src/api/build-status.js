const lakehouseStatus = require('./lakehouse-status');

async function getBuildStatus(req, res) {
  try {
    // Get the lakehouse status data
    const data = await new Promise((resolve, reject) => {
      const mockReq = {};
      const mockRes = {
        json: (result) => resolve(result),
        status: () => mockRes
      };
      lakehouseStatus(mockReq, mockRes).catch(reject);
    });

    // Extract primary sources
    const primarySources = {};
    ['Productboard', 'Salesforce'].forEach(source => {
      const viewCount = (data.gold.views || []).filter(v => v.source === source).length;
      primarySources[source] = { views: viewCount, tables: 0 };
    });

    // Extract secondary sources
    const secondarySources = {};
    const sources = {};

    // Count views by source
    (data.gold.views || []).forEach(v => {
      if (!sources[v.source]) sources[v.source] = { views: 0, tables: 0 };
      sources[v.source].views++;
    });

    // Add secondary sources (non-primary)
    const primaryKeys = Object.keys(primarySources);
    Object.entries(sources).forEach(([source, counts]) => {
      if (!primaryKeys.includes(source)) {
        secondarySources[source] = counts;
      }
    });

    // Add gold tables (finance)
    if (data.gold.tables && data.gold.tables.length > 0) {
      data.gold.tables.forEach(table => {
        const source = table.source || 'Finance';
        if (!secondarySources[source]) secondarySources[source] = { views: 0, tables: 0 };
        secondarySources[source].tables++;
      });
    }

    res.json({
      primary: {
        title: 'Primary Data Sources',
        sources: primarySources
      },
      secondary: {
        title: 'Supporting Data',
        sources: secondarySources
      }
    });
  } catch (err) {
    console.error('[build-status]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getBuildStatus;
