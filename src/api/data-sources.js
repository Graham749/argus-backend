const lakehouseStatus = require('./lakehouse-status');

async function getDataSources(req, res) {
  try {
    const data = await new Promise((resolve, reject) => {
      const mockReq = {};
      const mockRes = {
        json: (result) => resolve(result),
        status: () => mockRes
      };
      lakehouseStatus(mockReq, mockRes).catch(reject);
    });

    // Build the sources list with tables included
    const sources = {};

    // Process views from all layers
    [data.bronze, data.silver, data.gold].forEach(layer => {
      (layer.views || []).forEach(v => {
        if (!sources[v.source]) sources[v.source] = { views: [], tables: [] };
        sources[v.source].views.push(v.name);
      });

      (layer.tables || []).forEach(t => {
        if (!sources[t.source]) sources[t.source] = { views: [], tables: [] };
        sources[t.source].tables.push(t.name);
      });
    });

    res.json(sources);
  } catch (err) {
    console.error('[data-sources]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getDataSources;
