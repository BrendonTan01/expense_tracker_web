// One command starts the local staging API and Expo Go on the same Wi-Fi.
import { networkInterfaces, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const candidates = Object.entries(networkInterfaces()).flatMap(([name, rows]) =>
  (rows || []).filter(row => row.family === 'IPv4' && !row.internal).map(row => ({ name, address: row.address })));
const host = process.env.STAGING_LAN_IP || candidates.find(row => /^(en0|wlan0|Wi-Fi)$/.test(row.name))?.address;
if (!host || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d/.test(host)) {
  throw new Error('Connect to Wi-Fi, or set STAGING_LAN_IP to your Mac’s private Wi-Fi IPv4 address');
}
const apiUrl = `http://${host}:3001/api`;
const configPath = process.env.STAGING_CONFIG || join(homedir(), 'Desktop/expense-tracker-backups/staging/credentials.json');
let api, expo;
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api?.kill('SIGTERM'); expo?.kill('SIGTERM');
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
async function healthy() {
  try {
    const response = await fetch('http://127.0.0.1:3001/api/health', { signal: AbortSignal.timeout(1500) });
    const data = await response.json();
    return response.ok && data.environment === 'staging' && data.projectRef === 'tfjegsgjwyzcixlueosi';
  } catch { return false; }
}
try {
  if (!(await healthy())) {
    api = spawn(process.execPath, [join(root, 'scripts/staging-api.mjs')], {
      cwd: root, stdio: 'inherit', env: { ...process.env, STAGING_CONFIG: configPath, PORT: '3001' },
    });
    api.on('error', () => stop(1));
    api.on('exit', () => { if (!stopping) stop(1); });
    let ready = false;
    for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
      if (await healthy()) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Staging API could not start. Check the private config and port 3001.');
  }
  if (!stopping) {
    console.log(`STAGING ONLY — API: ${apiUrl}`);
    console.log('Use your test account. Keep this terminal open; scan the new Expo QR code.');
    expo = spawn(process.execPath, [join(root, 'mobile/node_modules/expo/bin/cli'), 'start', '--go', '--offline', '--port', '8083'], {
      cwd: join(root, 'mobile'), stdio: 'inherit',
      env: { ...process.env, EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_API_URL: apiUrl, REACT_NATIVE_PACKAGER_HOSTNAME: host },
    });
    expo.on('error', () => stop(1));
    expo.on('exit', code => stop(code || 0));
  }
} catch (error) {
  console.error(error.message); stop(1);
}
