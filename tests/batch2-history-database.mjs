// In-memory PostgreSQL only. Reuses the optional installed PGlite harness;
// no hosted credentials, network writes, or production data.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const a = '00000000-0000-0000-0000-000000000001';
const b = '00000000-0000-0000-0000-000000000002';
await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
  INSERT INTO auth.users VALUES('${a}'),('${b}');`);
await db.exec(await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT ON public.transactions TO authenticated;');
const migration = await readFile(new URL('../supabase/migration_batch2_history.sql', import.meta.url), 'utf8');
await db.exec(migration);
await db.exec(migration); // Repeat application preserves permissions and indexes.
await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,description,date)
  SELECT 'history:'||lpad(i::text,5,'0'),$1::uuid,CASE WHEN i%2=0 THEN 'expense' ELSE 'income' END,1.23,'synthetic',
    CASE WHEN i<=1000 THEN '2024-02-29' ELSE '2024-03-01' END
  FROM generate_series(1,2505) i`, [a]);
await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,description,date)
  VALUES('foreign',$1,'income',999,'other account','2024-03-01')`, [b]);
await db.exec(`SET ROLE authenticated; SET test.uid='${a}';`);
const history = async (start = null, end = null, type = null) => (await db.query('SELECT public.get_transaction_history($1,$2,$3) AS data', [start, end, type])).rows[0].data;
const all = await history();
assert.equal(all.length, 2505);
assert.equal(new Set(all.map(t => t.id)).size, 2505);
assert.equal(all.reduce((sum, t) => sum + Math.round(t.amount * 100), 0), 2505 * 123);
assert.ok(all.every(t => t.user_id === a));
for (let i = 1; i < all.length; i++) assert.ok(all[i-1].date > all[i].date || (all[i-1].date === all[i].date && all[i-1].id > all[i].id));
assert.equal((await history('2024-02-29','2024-02-29')).length, 1000);
assert.equal((await history('2024-03-01','2024-03-01','expense')).length, 752);
assert.equal((await history(null,null,'investment')).length, 0);
assert.deepEqual(await history('2024-03-02','2024-02-28'), []); // legacy reversed-range contract
for (const date of ['2025-02-29','2024-02-30','2024-13-01','0000-01-01','not-a-date']) {
  await assert.rejects(history(date));
}
await assert.rejects(history(null,null,'invalid'), e => e.code === '22023');
// A write during the calling statement is invisible to the STABLE function's
// statement snapshot; the next statement sees it. Unlike offset paging, reading
// cannot pick up just part of a changing record set between requests.
const snapshot = (await db.query(`WITH inserted AS (
  INSERT INTO public.transactions(id,user_id,type,amount,description,date)
  VALUES('new-in-snapshot',$1,'income',1.23,'new','2024-03-01') RETURNING id
) SELECT public.get_transaction_history() AS data FROM inserted`, [a])).rows[0].data;
assert.equal(snapshot.length, 2505);
assert.equal((await history()).length, 2506);
await db.exec(`SET test.uid='${b}';`);
assert.deepEqual((await history()).map(t => t.id), ['foreign']);
await db.exec(`SET test.uid='';`);
await assert.rejects(history(), e => e.code === '42501');
await db.exec('RESET ROLE;');
const properties = (await db.query(`SELECT provolatile,prosecdef FROM pg_proc WHERE oid='public.get_transaction_history(text,text,text)'::regprocedure`)).rows[0];
assert.equal(properties.provolatile, 's');
assert.equal(properties.prosecdef, false);
await db.exec(`SET test.uid='${a}';`);
assert.equal((await history()).length, 2506); // explicit ownership even for an RLS-bypassing owner
await db.exec(`SET ROLE anon;`);
await assert.rejects(history(), e => e.code === '42501');
await db.close();
console.log('PASS DATA01: 2505-row complete history, exact cent totals, equal-date order, inclusive filters, statement snapshot, RLS, explicit owner filter, authenticated-only invoker permissions');
