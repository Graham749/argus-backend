const lakehouseStatus = require('./lakehouse-status');

async function getDataSourcesMinimal(req, res) {
  try {
    const data = await new Promise((resolve, reject) => {
      const mockReq = {};
      const mockRes = {
        json: (result) => resolve(result),
        status: () => mockRes
      };
      lakehouseStatus(mockReq, mockRes).catch(reject);
    });

    // Build the sources list with only view/table names
    const sources = {};

    // Process views from all layers
    [data.bronze, data.silver, data.gold].forEach(layer => {
      (layer.views || []).forEach(v => {
        if (!sources[v.source]) sources[v.source] = [];
        sources[v.source].push(v.name);
      });

      (layer.tables || []).forEach(t => {
        if (!sources[t.source]) sources[t.source] = [];
        sources[t.source].push(t.name);
      });
    });

    res.json(sources);
  } catch (err) {
    console.error('[data-sources-minimal]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getDataSourcesMinimal;
