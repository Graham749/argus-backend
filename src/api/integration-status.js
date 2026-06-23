async function getIntegrationStatus(req, res) {
  try {
    const apis = {
      lakehouseStatus: {
        name: 'Lakehouse Status',
        integrated: true,
        description: 'Build status UI',
        color: '#00be86'
      },
      productboardFeatures: {
        name: 'Productboard Features',
        integrated: false,
        description: 'API only (not wired)',
        color: '#ffcc00'
      },
      salesforce: {
        name: 'Salesforce',
        integrated: false,
        description: 'Subscriptions API only',
        color: '#ffcc00'
      }
    };

    // Add symbol based on status
    Object.values(apis).forEach(api => {
      api.symbol = api.integrated ? '✓' : '◐';
    });

    res.json(apis);
  } catch (err) {
    console.error('[integration-status]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getIntegrationStatus;
