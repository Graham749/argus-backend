const { DefaultAzureCredential } = require('@azure/identity');

const FABRIC_RESOURCE = 'https://database.windows.net/.default';

let cachedToken = null;
let tokenExpiry  = null;

const credential = new DefaultAzureCredential();

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiry && tokenExpiry > now + 60_000) return cachedToken;

  const response = await credential.getToken(FABRIC_RESOURCE);
  cachedToken  = response.token;
  tokenExpiry  = response.expiresOnTimestamp;
  return cachedToken;
}

module.exports = { getAccessToken };
