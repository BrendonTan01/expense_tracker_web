import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const productionUrl = 'https://expense-tracker-web-wheat.vercel.app/api';
const stagingUrl = 'http://192.168.1.2:3001/api';
const projectRef = 'tfjegsgjwyzcixlueosi';
function load(name, env = {}, mocks = {}, fetch = () => { throw Error('Unexpected network request'); }) {
  const source = readFileSync(new URL(`../mobile/src/utils/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const exports = {};
  runInNewContext(outputText, { exports, process: { env }, URL, AbortController, setTimeout, clearTimeout, console, fetch,
    require: name => { if (!(name in mocks)) throw Error(`Unexpected module ${name}`); return mocks[name]; } });
  return exports;
}
function harness(staging, fetch) {
  const environment = load('environment', staging ? { EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_API_URL: stagingUrl } : {});
  const values = new Map([['auth_token', 'production-token'], ['saved_email', 'production-email'], ['saved_password', 'production-password'], ['@expense_tracker/settings', '{"production":true}']]);
  const store = { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => values.set(k,v), removeItem: async k => values.delete(k) };
  const secure = { getItemAsync: store.getItem, setItemAsync: store.setItem, deleteItemAsync: store.removeItem };
  const mocks = { './environment': environment, '@react-native-async-storage/async-storage': store, 'expo-secure-store': secure, './restoreReceipt': { restoreReceiptKey: () => 'receipt' } };
  const storage = load('storage', {}, mocks);
  const api = load('api', {}, { ...mocks, './storage': storage }, fetch);
  return { environment, values, storage, api };
}

test('production preserves its deployed URL and unprefixed credentials/cache', async () => {
  const h = harness(false);
  assert.equal(h.environment.API_BASE_URL, productionUrl);
  assert.equal(h.environment.ENV_STORAGE_PREFIX, '');
  assert.equal(await h.api.getAuthToken(), 'production-token');
  assert.equal((await h.api.getSavedCredentials()).email, 'production-email');
  assert.equal(h.storage.getStorageKey('settings'), '@expense_tracker/settings');
  assert.equal((await h.storage.loadFromStorage('settings', null)).production, true);
});
test('staging cannot load or clear production credentials/cache', async () => {
  const h = harness(true);
  assert.equal(await h.api.getAuthToken(), null);
  assert.equal(await h.api.getSavedCredentials(), null);
  assert.equal(await h.storage.loadFromStorage('settings', null), null);
  await h.api.setAuthToken('staging-token');
  await h.api.saveCredentials('test-email', 'test-password');
  await h.storage.saveToStorage('settings', { staging: true });
  assert.equal(h.values.get(`staging.${projectRef}.auth_token`), 'staging-token');
  assert.equal(h.values.get(`@expense_tracker/staging.${projectRef}.settings`), '{"staging":true}');
  await h.api.clearAuthToken(); await h.api.clearSavedCredentials(); await h.storage.removeFromStorage('settings');
  assert.equal(h.values.get('auth_token'), 'production-token');
  assert.equal(h.values.get('saved_password'), 'production-password');
  assert.equal(h.values.get('@expense_tracker/settings'), '{"production":true}');
});
test('invalid or public staging URL fails closed instead of using production', () => {
  for (const url of [undefined, productionUrl, 'https://192.168.1.2/api', 'http://8.8.8.8/api', 'http://172.32.1.1/api', 'http://192.168.1.2/wrong', 'http://u:p@192.168.1.2/api', 'http://192.168.1.2/api?q=1', 'http://192.168.1.2/api#x']) {
    assert.throws(() => load('environment', { EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_API_URL: url }));
  }
  assert.throws(() => load('environment', { EXPO_PUBLIC_APP_ENV: 'preview' }));
  assert.throws(() => load('environment', { EXPO_PUBLIC_API_URL: stagingUrl }));
  for (const url of [stagingUrl, 'http://10.0.0.1/api', 'http://172.16.0.1/api', 'http://127.0.0.1:3001/api/']) {
    assert.equal(load('environment', { EXPO_PUBLIC_APP_ENV: 'staging', EXPO_PUBLIC_API_URL: url }).API_BASE_URL, url.replace(/\/$/, ''));
  }
});
test('health mismatch blocks login credentials; a subsequent correct health permits retry', async () => {
  const requests = []; let healthy = false;
  const h = harness(true, async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => url.endsWith('/health') ? { environment: 'staging', projectRef: healthy ? projectRef : 'wrong-project' } : { token: 'test-token' } };
  });
  await assert.rejects(h.api.authApi.login('test-email', 'test-password'), /Test API unavailable/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${stagingUrl}/health`);
  assert.equal(requests[0].options.body, undefined);
  healthy = true;
  await h.api.authApi.login('test-email', 'test-password');
  assert.deepEqual(requests.map(r => r.url), [`${stagingUrl}/health`, `${stagingUrl}/health`, `${stagingUrl}/auth/login`]);
});
test('unreachable staging never falls back to production', async () => {
  const urls = [];
  const h = harness(true, async url => { urls.push(url); throw Error('offline'); });
  await assert.rejects(h.api.authApi.login('test-email', 'test-password'), /Test API unavailable/);
  assert.deepEqual(urls, [`${stagingUrl}/health`]);
});
