require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { pca } = require('./src/lib/auth');

async function main() {
  console.log('Argus — one-time authentication setup');
  console.log('--------------------------------------');

  // Step 1: device code for Fabric SQL
  const result = await pca.acquireTokenByDeviceCode({
    scopes: ['https://database.windows.net//.default', 'offline_access'],
    deviceCodeCallback: (r) => {
      console.log(`\nOpen this URL on any device: ${r.verificationUri}`);
      console.log(`Enter code: ${r.userCode}\n`);
    },
  });
  console.log(`Authenticated as: ${result.account.username}`);

  // Step 2: silently get a Graph token so it's cached too
  try {
    await pca.acquireTokenSilent({
      account: result.account,
      scopes: ['https://graph.microsoft.com/.default'],
    });
    console.log('Graph token cached.');
  } catch (e) {
    console.log('(Graph token not cached — not required for core functionality)');
  }

  console.log('\nToken cache saved to .token-cache.json — restart ArgusApp service now.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
