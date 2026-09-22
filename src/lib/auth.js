const { execSync } = require('child_process');

const AZ = process.env.AZ_PATH || 'az';
const AZ_TENANT = process.env.AZ_TENANT;

function getToken(resource) {
  const res = resource.replace(/\/$/, '').replace(/"/g, '');
  const tenantFlag = AZ_TENANT ? `--tenant "${AZ_TENANT}"` : '';
  const azExe = AZ.includes(' ') ? `"${AZ}"` : AZ;
  const cmd = `${azExe} account get-access-token --resource "${res}" ${tenantFlag} --query accessToken -o tsv`;

  try {
    const token = execSync(cmd, { encoding: 'utf-8', timeout: 30000, windowsHide: true }).trim();
    if (!token) throw new Error('az returned an empty token');
    return Promise.resolve(token);
  } catch (e) {
    return Promise.reject(
      new Error(`az account get-access-token failed — run 'az login' and retry.\n${e.message}`)
    );
  }
}

module.exports = { getToken };
