import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64');
const { createAuthSession } = await import(compile(await readFile(new URL('../mobile/src/utils/authSession.ts', import.meta.url), 'utf8')));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const A = { token: 'a', user: { id: 'A', email: 'a@example.test' } };
const B = { token: 'b', user: { id: 'B', email: 'b@example.test' } };
function setup(overrides = {}) {
  const state = { token: null, credentials: null, session: null, remembered: false, generation: 0 };
  const deps = {
    api: { login: async () => A, register: async () => B, verify: async () => ({ user: A.user }) },
    getToken: async () => state.token,
    setToken: async token => { state.token = token; },
    clearToken: async () => { state.token = null; },
    getCredentials: async () => state.credentials,
    saveCredentials: async (email, password) => { state.credentials = { email, password }; },
    clearCredentials: async () => { state.credentials = null; },
    remember: async enabled => { state.remembered = enabled; },
    publish: value => { state.session = value; },
    invalidate: () => { state.generation++; },
    ...overrides,
  };
  return { state, deps, auth: createAuthSession(deps) };
}
test('delayed login after logout cannot resurrect session or credentials', async () => {
  const pending = deferred();
  const { auth, state } = setup({ api: { login: () => pending.promise } });
  const login = auth.login(A.user.email, 'secret', true);
  await auth.logout();
  pending.resolve(A);
  await login;
  assert.equal(state.session, null);
  assert.equal(state.token, null);
  assert.equal(state.credentials, null);
});
test('logout waits behind in-flight credential write, then clears it', async () => {
  const blocked = deferred(); const entered = deferred();
  const { auth, state, deps } = setup();
  deps.saveCredentials = async (email, password) => { entered.resolve(); await blocked.promise; state.credentials = { email, password }; };
  const login = auth.login(A.user.email, 'secret', true);
  await entered.promise;
  const logout = auth.logout();
  blocked.resolve();
  await Promise.all([login, logout]);
  assert.equal(state.session, null);
  assert.equal(state.token, null);
  assert.equal(state.credentials, null);
  assert.equal(state.remembered, false);
});
test('A expiry then registration B clears A credentials and foreground stays B', async () => {
  const { auth, state, deps } = setup();
  await auth.login(A.user.email, 'a-secret', true);
  await auth.unauthorized();
  assert.equal(state.credentials.email, A.user.email);
  await auth.register(B.user.email, 'b-secret');
  deps.api.login = async () => { throw new Error('Must not silently log in as A'); };
  deps.api.verify = async () => ({ user: B.user });
  await auth.foreground();
  assert.equal(state.session.user.id, 'B');
  assert.equal(state.credentials, null);
  assert.equal(state.remembered, false);
});
test('old foreground response and mount verification cannot replace a new account', async () => {
  const { auth, state, deps } = setup();
  await auth.login(A.user.email, 'a-secret', true);
  const pending = deferred();
  deps.api.login = () => pending.promise;
  const refresh = auth.foreground();
  await Promise.resolve();
  await auth.register(B.user.email, 'b-secret');
  pending.resolve(A);
  await refresh;
  assert.equal(state.session.user.id, 'B');
  const verifying = deferred();
  deps.api.verify = () => verifying.promise;
  const init = auth.initialize();
  await Promise.resolve();
  await auth.logout();
  verifying.resolve({ user: A.user });
  await init;
  assert.equal(state.session, null);
});
test('foreground refuses remembered credentials belonging to another account', async () => {
  const { auth, state, deps } = setup();
  await auth.register(B.user.email, 'b-secret');
  state.credentials = { email: A.user.email, password: 'a-secret' };
  deps.api.login = async () => { throw new Error('Wrong account login attempted'); };
  deps.api.verify = async () => ({ user: B.user });
  await auth.foreground();
  assert.equal(state.session.user.id, 'B');
});
for (const platform of ['mobile/src', 'src']) {
  test(`${platform} scopes templates to stable owner without reading or replacing legacy data`, async () => {
    const { templateStorageKey } = await import(compile(await readFile(new URL(`../${platform}/utils/templateStorage.ts`, import.meta.url), 'utf8')));
    const store = new Map([['transaction_templates', ['legacy private template']]]);
    const aKey = templateStorageKey('user/A'); const bKey = templateStorageKey('user/B');
    store.set(aKey, ['A private template']);
    assert.deepEqual(store.get(bKey) ?? [], []);
    store.set(bKey, ['B private template']);
    assert.deepEqual(store.get(aKey), ['A private template']);
    assert.deepEqual(store.get('transaction_templates'), ['legacy private template']);
    assert.throws(() => templateStorageKey(''), /Sign in/);
    assert.notEqual(templateStorageKey('user/A'), templateStorageKey('user%2FA'));
  });
}

test('logout cleanup cannot be skipped by an immediately following failed login', async () => {
  const { auth, state, deps } = setup();
  await auth.login(A.user.email, 'a-secret', true);
  const logout = auth.logout();
  deps.api.login = async () => { throw new Error('Wrong password'); };
  await assert.rejects(auth.login(B.user.email, 'wrong'), /Wrong password/);
  await logout;
  assert.equal(state.token, null);
  assert.equal(state.credentials, null);
});

import { runInNewContext } from 'node:vm';
const apiSource = await readFile(new URL('../mobile/src/utils/api.ts', import.meta.url), 'utf8');
function apiHarness({ getItem, setItem, deleteItem, fetch } = {}) {
  const values = new Map();
  const secure = {
    getItemAsync: getItem ?? (async key => values.get(key) ?? null),
    setItemAsync: setItem ?? (async (key, value) => { values.set(key, value); }),
    deleteItemAsync: deleteItem ?? (async key => { values.delete(key); }),
  };
  const mocks = {
    '@react-native-async-storage/async-storage': {}, 'expo-secure-store': secure,
    './storage': { generateId: () => 'id' }, './restoreReceipt': {},
    './environment': { API_BASE_URL: 'http://test.invalid/api', ENV_STORAGE_PREFIX: '', IS_STAGING: false },
  };
  const exports = {};
  const source = ts.transpileModule(apiSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, require: name => mocks[name], AbortController, Headers, setTimeout, clearTimeout, fetch, console });
  return { api: exports, values };
}
test('SecureStore token load finishing after clear cannot resurrect cached token', async () => {
  const pending = deferred();
  const { api } = apiHarness({ getItem: () => pending.promise });
  const load = api.getAuthToken();
  await api.clearAuthToken();
  pending.resolve('old-token');
  assert.equal(await load, null);
  assert.equal(await api.getAuthToken(), null);
});
test('SecureStore slow token write completes before later clear', async () => {
  const pending = deferred(); const entered = deferred();
  const { api, values } = apiHarness({ setItem: async (key, value) => { entered.resolve(); await pending.promise; values.set(key, value); } });
  const write = api.setAuthToken('old-token');
  await entered.promise;
  const clear = api.clearAuthToken();
  pending.resolve(); await Promise.all([write, clear]);
  assert.equal(values.get('auth_token'), undefined);
  assert.equal(await api.getAuthToken(), null);
});
test('old account HTTP response cannot expire a newer session', async () => {
  const pending = deferred(); const entered = deferred();
  const { api } = apiHarness({ fetch: async () => { entered.resolve(); return pending.promise; } });
  await api.setAuthToken('A');
  let expired = 0; api.setOnUnauthorized(() => expired++);
  const request = api.bucketsApi.getAll(); await entered.promise;
  api.invalidateAuthSession(); await api.setAuthToken('B');
  pending.resolve(new Response('{"error":"expired"}', { status: 401 }));
  await assert.rejects(request, /Account changed/);
  assert.equal(expired, 0);
  assert.equal(await api.getAuthToken(), 'B');
});

const webSource = await readFile(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
function webAuthHarness(fetch, token = 'A') {
  const state = []; const refs = []; const effects = []; let index = 0; let refIndex = 0;
  const values = new Map(token ? [['auth_token', token]] : []);
  const react = {
    createContext: () => ({ Provider: 'Provider' }), useContext: () => {},
    useState: initial => { const i = index++; state[i] = initial; return [initial, value => { state[i] = value; }]; },
    useRef: initial => { const i = refIndex++; return refs[i] ??= { current: initial }; },
    useEffect: fn => { effects.push(fn); },
  };
  const exports = {};
  const source = ts.transpileModule(webSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, {
    exports, require: name => name === 'react' ? react : { jsx: (_type, props) => props }, fetch, console,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
  });
  const { value: auth } = exports.AuthProvider({ children: null });
  effects.forEach(fn => fn());
  return { auth, state, values };
}
const drain = () => new Promise(resolve => setImmediate(resolve));
test('web delayed startup verification cannot restore user after logout or replace newer login', async () => {
  for (const next of ['logout', 'login']) {
    const pending = deferred();
    const h = webAuthHarness(url => url.endsWith('/verify') ? pending.promise : Promise.resolve({ ok: true, json: async () => B }));
    if (next === 'logout') h.auth.logout(); else await h.auth.login(B.user.email, 'b-secret');
    pending.resolve({ ok: true, json: async () => ({ user: A.user }) });
    await drain();
    assert.equal(h.state[0]?.id ?? null, next === 'logout' ? null : 'B');
    assert.equal(h.values.get('auth_token') ?? null, next === 'logout' ? null : 'b');
  }
});
test('web delayed login cannot persist credentials after logout', async () => {
  const pending = deferred();
  const h = webAuthHarness(() => pending.promise, null);
  const login = h.auth.login(A.user.email, 'a-secret');
  h.auth.logout();
  pending.resolve({ ok: true, json: async () => A });
  await login;
  assert.equal(h.state[0], null);
  assert.equal(h.values.get('auth_token'), undefined);
});

test('logout attempts credential and preference cleanup even when token deletion fails', async () => {
  const attempted = [];
  const { auth, state } = setup({
    clearToken: async () => { attempted.push('token'); throw new Error('SecureStore failed'); },
    clearCredentials: async () => { attempted.push('credentials'); throw new Error('Credential deletion failed'); },
    remember: async () => { attempted.push('preferences'); },
  });
  await assert.rejects(auth.logout(), /could not be completely cleared/);
  assert.deepEqual(attempted.sort(), ['credentials', 'preferences', 'token']);
  assert.equal(state.session, null);
});

test('both secure credential keys are attempted when deleting the first fails', async () => {
  const attempted = [];
  const { api } = apiHarness({ deleteItem: async key => { attempted.push(key); if (key === 'saved_email') throw new Error('Delete failed'); } });
  await assert.rejects(api.clearSavedCredentials(), /could not be completely cleared/);
  assert.deepEqual(attempted.sort(), ['saved_email', 'saved_password']);
});

test('web old account 401 cannot remove a newer token but current 401 still signs out', async () => {
  const source = await readFile(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
  const exports = {}; let token = 'A'; let reloads = 0;
  const pending = deferred(); let pendingResponse = pending.promise;
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: () => ({}), AbortController, Headers, setTimeout, clearTimeout,
    fetch: () => pendingResponse,
    localStorage: { getItem: () => token, removeItem: () => { token = null; } },
    window: { location: { reload: () => { reloads++; } } },
  });
  const request = exports.bucketsApi.getAll();
  token = 'B';
  pending.resolve(new Response('{"error":"Expired"}', { status: 401 }));
  await assert.rejects(request, /Expired/);
  assert.equal(token, 'B'); assert.equal(reloads, 0);
  pendingResponse = Promise.resolve(new Response('{"error":"Expired"}', { status: 401 }));
  await assert.rejects(exports.bucketsApi.getAll(), /Expired/);
  assert.equal(token, null); assert.equal(reloads, 1);
});

test('latest overlapping login owns session regardless of response order and old credentials cannot replace it', async () => {
  for (const order of ['older-first', 'newer-first']) {
    const a = deferred(), b = deferred();
    const { auth, state } = setup({ api: { login: email => email === A.user.email ? a.promise : b.promise } });
    const first = auth.login(A.user.email, 'a-secret', true), second = auth.login(B.user.email, 'b-secret', true);
    if (order === 'older-first') { a.resolve(A); await first; b.resolve(B); }
    else { b.resolve(B); await second; a.resolve(A); }
    await Promise.all([first, second]);
    assert.equal(state.session.user.id, 'B'); assert.equal(state.token, 'b'); assert.equal(state.credentials.email, B.user.email);
  }
});

test('foreground token persistence finishing during logout is followed by cleanup without restoring session', async () => {
  const blocked = deferred(), entered = deferred(); const { auth, state, deps } = setup();
  await auth.login(A.user.email, 'a-secret', true);
  deps.setToken = async token => { entered.resolve(); await blocked.promise; state.token = token; };
  const refresh = auth.foreground(); await entered.promise; const logout = auth.logout();
  blocked.resolve(); await Promise.all([refresh, logout]);
  assert.equal(state.session, null); assert.equal(state.token, null); assert.equal(state.credentials, null); assert.equal(state.remembered, false);
});
