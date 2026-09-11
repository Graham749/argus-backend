const https = require('https');
const { getToken } = require('../lib/auth');

let cachedUser = null;
let userCacheTime = null;

async function getAccessToken() {
  return getToken('https://graph.microsoft.com');
}

function fetchUserFromGraph(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path: '/v1.0/me?$select=id,displayName,userPrincipalName,mail,givenName,surname',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const user = JSON.parse(data);
            resolve(user);
          } catch (e) {
            reject(new Error('Failed to parse user data'));
          }
        } else {
          console.error('[user] Graph API error:', res.statusCode, data);
          reject(new Error(`Graph API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Graph API timeout'));
    });
    req.end();
  });
}

async function getCurrentUser(req, res) {
  const email = req.headers['cf-access-authenticated-user-email'] || 'graham.clark@auroraer.com';
  const name = email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  res.json({ email, name });
}

module.exports = getCurrentUser;
