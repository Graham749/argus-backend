const { execSync } = require('child_process');
const https = require('https');

let cachedUser = null;
let userCacheTime = null;

function getAccessToken() {
  try {
    const token = execSync(
      `"${process.env.AZ_PATH || 'az'}" account get-access-token --resource https://graph.microsoft.com --query accessToken -o tsv${process.env.AZ_TENANT ? ` --tenant ${process.env.AZ_TENANT}` : ''}`,
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
