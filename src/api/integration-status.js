async function getIntegrationStatus(req, res) {
  try {
    res.json({
      lakehouseStatus: {
        name: 'Lakehouse Status',
        status: 'integrated',
        description: 'Build status UI',
        color: '#00be86'
      },
      productboardFeatures: {
        name: 'Productboard Features',
        status: 'api_only',
        description: 'API only (not wired)',
        color: '#ffcc00'
      },
      salesforce: {
        name: 'Salesforce',
        status: 'api_only',
        description: 'Subscriptions API only',
        color: '#ffcc00'
      }
    });
  } catch (err) {
    console.error('[integration-status]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getIntegrationStatus;
