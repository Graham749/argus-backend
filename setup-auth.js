require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { pca } = require('./src/lib/auth');

async function main() {
  console.log('Argus — one-time authentication setup');
  console.log('--------------------------------------');
  const result = await pca.acquireTokenByDeviceCode({
    scopes: [
      'https://database.windows.net//.default',
      'https://graph.microsoft.com/.default',
      'offline_access',
    ],
    deviceCodeCallback: (response) => console.log('\n' + response.message + '\n'),
  });
  console.log(`Authenticated as: ${result.account.username}`);
  console.log('Token cache saved to .token-cache.json — restart ArgusApp service now.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
