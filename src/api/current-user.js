const { execSync } = require('child_process');
const https = require('https');

let cachedUser = null;
let userCacheTime = null;

function getAccessToken() {
  try {
    const token = execSync(
      'az account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv',
      { encoding: 'utf-8' }
    ).trim();
    return token;
  } catch (err) {
    throw new Error(`Failed to get token: ${err.message}`);
  }
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
      }
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
          reject(new Error(`Graph API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function getCurrentUser(req, res) {
  try {
    const now = Date.now();

    // Cache for 5 minutes
    if (cachedUser && userCacheTime && (now - userCacheTime) < 5 * 60 * 1000) {
      console.log('[user] Using cached user info');
      return res.json(cachedUser);
    }

    console.log('[user] Fetching current user from Microsoft Graph...');
    const token = getAccessToken();
    const user = await fetchUserFromGraph(token);

    const initials = ((user.givenName || user.displayName || '')[0] + (user.surname || user.displayName.split(' ')[1] || '')[0]).toUpperCase();

    const cachedData = {
      name: user.displayName || user.userPrincipalName,
      email: user.mail || user.userPrincipalName,
      initials: initials,
      id: user.id
    };

    cachedUser = cachedData;
    userCacheTime = now;

    res.json(cachedData);
  } catch (err) {
    console.error('[user]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = getCurrentUser;
