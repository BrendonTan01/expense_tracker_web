// Expo replaces these direct EXPO_PUBLIC reads when bundling. Never put secrets here.
export const STAGING_PROJECT_REF = 'tfjegsgjwyzcixlueosi';
const productionUrl = 'https://expense-tracker-web-wheat.vercel.app/api';
const environment = process.env.EXPO_PUBLIC_APP_ENV || 'production';
const configuredUrl = process.env.EXPO_PUBLIC_API_URL;
if (environment !== 'production' && environment !== 'staging') {
  throw new Error('Unsupported app environment');
}
export const IS_STAGING = environment === 'staging';
if (!IS_STAGING && configuredUrl && configuredUrl !== productionUrl) {
  throw new Error('A test API requires staging mode');
}
if (IS_STAGING && !configuredUrl) throw new Error('Staging requires a test API URL');
export const API_BASE_URL = IS_STAGING ? configuredUrl!.replace(/\/$/, '') : productionUrl;
if (IS_STAGING) {
  const url = new URL(API_BASE_URL);
  const octets = url.hostname.split('.').map(Number);
  const privateIp = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
    && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || octets[0] === 127);
  if (url.protocol !== 'http:' || !privateIp || url.pathname !== '/api' || url.username || url.password || url.search || url.hash) {
    throw new Error('Staging requires a local-network HTTP API address');
  }
}
// Preserve existing production storage; staging never reads it.
export const ENV_STORAGE_PREFIX = IS_STAGING ? `staging.${STAGING_PROJECT_REF}.` : '';
