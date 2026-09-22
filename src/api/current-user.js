const https = require('https');
const { getToken } = require('../lib/auth');
const { isAdmin } = require('../lib/allowlist');

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
  const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  let email, name;

  // AWS ALB injects x-amzn-oidc-data (signed JWT) after Entra authentication
  const oidcData = req.headers['x-amzn-oidc-data'];
  if (oidcData) {
    try {
      const base64 = oidcData.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
      email = payload.email || payload.upn || payload.preferred_username || payload.unique_name;
      name = payload.name;
      console.log('[user] OIDC claims:', Object.keys(payload).join(', '));
    } catch (e) {
      console.error('[user] Failed to decode OIDC JWT:', e.message);
    }
  }

  // Fallback: Cloudflare Access header (not currently active but kept for compatibility)
  if (!email) {
    const cfEmail = req.headers['cf-access-authenticated-user-email'];
    if (cfEmail) email = cfEmail;
  }

  // Local dev fallback
  if (!email && isLocal) {
    email = 'graham.clark@auroraer.com';
  }

  if (!email) {
    return res.json({ email: null, name: null, authenticated: false });
  }

  if (!name) {
    name = email.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }

  const adminFlag = await isAdmin(email);
  res.json({ email, name, authenticated: true, isAdmin: adminFlag });
}

module.exports = getCurrentUser;
