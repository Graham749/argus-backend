const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', '..', '.token-cache.json');
const TENANT_ID = process.env.AZ_TENANT || 'ad3c7c7d-fe68-4eb7-a656-36bf93cf1d09';
// Azure CLI public client ID — same auth path as `az login`
const CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';

const cachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    if (fs.existsSync(CACHE_FILE)) {
      cacheContext.tokenCache.deserialize(fs.readFileSync(CACHE_FILE, 'utf-8'));
    }
  },
  afterCacheAccess: async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
      fs.writeFileSync(CACHE_FILE, cacheContext.tokenCache.serialize(), 'utf-8');
    }
  },
};

const pca = new msal.PublicClientApplication({
  auth: {
    clientId: CLIENT_ID,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
  },
  cache: { cachePlugin },
});

async function getToken(resource) {
  const accounts = await pca.getTokenCache().getAllAccounts();
  if (accounts.length === 0) {
    throw new Error(`No cached credentials. Run: node setup-auth.js`);
  }
  try {
    const result = await pca.acquireTokenSilent({
      account: accounts[0],
      scopes: [`${resource}/.default`],
    });
    return result.accessToken;
  } catch (e) {
    throw new Error(`Token refresh failed — re-run: node setup-auth.js\n${e.message}`);
  }
}

module.exports = { getToken, pca, CLIENT_ID, TENANT_ID };
