/** Local LAN adapter for the real Vercel handlers against isolated Supabase.
 * STAGING_CONFIG=/private/path/config.json node scripts/staging-api.mjs
 * Optional PORT (default 3001). No SQLite, tunnel, or deployment involved.
 */
import express from 'express';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const STAGING_REF = 'tfjegsgjwyzcixlueosi';
const LIVE_REF = 'yqllvfovnmonmqgzmqkf';
const write = message => process.stdout.write(`${message}\n`);
async function main() {
  const configPath = process.env.STAGING_CONFIG;
  if (!configPath || !isAbsolute(configPath)) throw new Error('STAGING_CONFIG must name an absolute private JSON file');
  let config;
  try { config = JSON.parse(await readFile(configPath, 'utf8')); }
  catch { throw new Error('Could not read private staging configuration'); }
  const { projectRef, url, anonKey } = config;
  if (projectRef !== STAGING_REF || projectRef === LIVE_REF) throw new Error('Refusing a project other than the approved staging project');
  let origin;
  try { origin = new URL(url); } catch { throw new Error('Invalid staging URL'); }
  if (origin.protocol !== 'https:' || origin.hostname !== `${STAGING_REF}.supabase.co` || origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Staging URL does not match the approved project hostname');
  }
  if (typeof anonKey !== 'string' || !anonKey) throw new Error('Staging anonymous key is required');
  if (!anonKey.startsWith('sb_publishable_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString()); }
    catch { throw new Error('Staging requires an anonymous or publishable key'); }
    if (claims?.role !== 'anon' || claims?.ref !== STAGING_REF) {
      throw new Error('Staging handlers must use an anonymous key from the test project');
    }
  }
  const portText = process.env.PORT || '3001';
  if (!/^\d+$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535) throw new Error('PORT must be an integer from 1024 to 65535');
  const port = Number(portText);
  // Neither admin keys nor database passwords are exported into the handlers.
  process.env.VITE_SUPABASE_URL = origin.origin;
  process.env.SUPABASE_URL = origin.origin;
  process.env.VITE_SUPABASE_ANON_KEY = anonKey;
  process.env.SUPABASE_ANON_KEY = anonKey;
  config = null;
  // Prevent inherited environment settings or future handlers from reaching any
  // other backend through fetch. Redirects must not escape the validated origin.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (target.origin !== origin.origin) return Promise.reject(new Error('Request outside staging is blocked'));
    return originalFetch(input, { ...init, redirect: 'error', signal: init?.signal || (input instanceof Request ? input.signal : undefined) || AbortSignal.timeout(30000) });
  };
  // Existing handlers log request URLs/error objects. Keep local logs limited to
  // route templates and status codes, never supplied IDs, query values or tokens.
  console.log = console.warn = console.error = () => {};
  const routes = [
    ['/api/auth/login', '../api/auth/login.js'],
    ['/api/auth/register', '../api/auth/register.js'],
    ['/api/auth/verify', '../api/auth/verify.js'],
    ['/api/auth/change-password', '../api/auth/change-password.js'],
    ['/api/buckets', '../api/buckets.js'],
    ['/api/buckets/:id', '../api/buckets.js'],
    ['/api/budgets', '../api/budgets.js'],
    ['/api/budgets/:id', '../api/budgets.js'],
    ['/api/transactions', '../api/transactions.js'],
    ['/api/transactions/recurring/:recurringId', '../api/transactions/recurring/[recurringId].js'],
    ['/api/transactions/:id', '../api/transactions/[id].js'],
    ['/api/recurring', '../api/recurring.js'],
    ['/api/recurring/:id', '../api/recurring/[id].js'],
    ['/api/summaries', '../api/summaries.js'],
  ];
  const app = express();
  app.disable('x-powered-by');
  app.use((req,res,next) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
    next();
  });
  app.use(express.json({ limit:'4mb' }));
  app.get('/api/health',(_req,res) => res.json({environment:'staging',projectRef:STAGING_REF}));
  for (const [route,modulePath] of routes) {
    const { default: handler } = await import(modulePath);
    app.all(route, async (req,res,next) => {
      // Express 5 req.query is read-only. Vercel's dynamic route parameters live
      // in query, with URL path IDs taking precedence over query-string IDs.
      const request = { method:req.method, headers:req.headers, body:req.body, query:{...req.query,...req.params}, url:req.originalUrl };
      const json = res.json.bind(res);
      res.json = body => json(res.statusCode >= 500 ? {error:'Staging request failed. Please retry.'} : body);
      res.once('finish',() => write(`${req.method} ${route} ${res.statusCode}`));
      try { await handler(request,res); } catch(error) { next(error); }
    });
  }
  app.use((_req,res) => res.status(404).json({error:'Unknown staging API route'}));
  app.use((error,_req,res,_next) => {
    if(res.headersSent) return res.end();
    const status = error?.type === 'entity.too.large' ? 413 : error?.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({error:status === 413 ? 'Request exceeds 4 MB' : status === 400 ? 'Invalid JSON body' : 'Staging request failed. Please retry.'});
  });
  const server = app.listen(port,'0.0.0.0',() => {
    write(`Staging API listening on 0.0.0.0:${port}`);
    write(`Project: ${STAGING_REF}. Real Vercel handlers; staging data only.`);
  });
  server.on('error',() => { write('Staging API could not listen. Check whether the port is already in use.');process.exitCode=1; });
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,() => server.close(() => process.exit(0)));
}
main().catch(error => { write(error instanceof Error ? error.message : 'Staging API failed to start');process.exitCode=1; });
