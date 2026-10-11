// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
// Uses only an in-memory database. No production credentials or network calls.
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const a='00000000-0000-0000-0000-000000000001', b='00000000-0000-0000-0000-000000000002';
await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
INSERT INTO auth.users VALUES('${a}'),('${b}');`);
await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;');
await db.exec(await readFile(new URL('../supabase/migration_reliability.sql',import.meta.url),'utf8'));
await db.exec(`SET ROLE authenticated; SET test.uid='${a}';`);
const call=async(fn,args,requestId=randomUUID())=> (await db.query(`SELECT public.${fn}(${fn==='restore_user_backup'?'$1,$2':'$1'}) AS value`,fn==='restore_user_backup'?[args,requestId]:[args])).rows[0].value;
const exp=async()=> (await db.query('SELECT public.export_user_backup() AS value')).rows[0].value;
const backup={buckets:[{id:'bucket',name:'General'}],transactions:[],recurringTransactions:[{id:'monthly',frequency:'monthly',startDate:'2024-01-31',transaction:{type:'expense',amount:1.01,description:'Monthly',bucketId:'bucket'}}],budgets:[],monthlySummaries:[{id:'summary',year:2024,month:1,summary:'Keep me'}],yearlySummaries:[]};
assert.deepEqual(await call('restore_user_backup',backup),{restored:true});
assert.deepEqual(await call('process_recurring_transactions','2024-03-31'),{created:3});
let current=await exp();
assert.deepEqual(current.transactions.map(t=>t.date),['2024-01-31','2024-02-29','2024-03-31']);
assert.deepEqual(await call('process_recurring_transactions','2024-03-31'),{created:0});
assert.equal((await exp()).transactions.length,3);
// A failed restore after the deletes must leave the full original state intact.
for (const mutate of [x=>x.transactions[0].amount=0.001,x=>x.transactions[0].bucketId='missing',x=>x.transactions[0].date='2024-02-30',x=>x.transactions.push(x.transactions[0]),x=>x.transactions[0].user_id=b]) {
 const invalid=structuredClone(current); mutate(invalid);
 await assert.rejects(call('restore_user_backup',invalid));
 assert.deepEqual(await exp(),current);
}
// Legacy backups do not erase summaries they could not export.
const legacy=structuredClone(current); delete legacy.monthlySummaries; delete legacy.yearlySummaries;
await call('restore_user_backup',legacy); assert.deepEqual(await exp(),current);
// Leap-day yearly recurrence remains anchored to its original start date.
const yearly=structuredClone(backup); yearly.recurringTransactions=[{...backup.recurringTransactions[0],id:'yearly',frequency:'yearly',startDate:'2020-02-29'}];
await call('restore_user_backup',yearly);
assert.deepEqual(await call('process_recurring_transactions','2024-02-29'),{created:5});
assert.deepEqual((await exp()).transactions.map(t=>t.date),['2020-02-29','2021-02-28','2022-02-28','2023-02-28','2024-02-29']);
// Old clients cannot mark missing writes as applied. Existing occurrences allow progress.
await assert.rejects(db.query(`UPDATE public.recurring_transactions SET "lastApplied"='2025-02-28' WHERE id='yearly'`),e=>e.code==='23514');
assert.equal((await exp()).recurringTransactions[0].lastApplied,'2024-02-29');
await db.query(`UPDATE public.recurring_transactions SET "lastApplied"='2023-02-28' WHERE id='yearly'`);
await db.query(`UPDATE public.recurring_transactions SET "lastApplied"='2024-02-29' WHERE id='yearly'`);
assert.equal((await exp()).recurringTransactions[0].lastApplied,'2024-02-29');
// Receipt immutability remains enforced under actual post-migration permissions.
await assert.rejects(db.query('DELETE FROM public.backup_restore_receipts'),e=>e.code==='42501');
await assert.rejects(db.query("UPDATE public.backup_restore_receipts SET payload_hash='changed'"),e=>e.code==='42501');
// RLS plus ownership FKs prevent another user's rows being accessed/referenced.
await db.exec(`SET test.uid='${b}';`);
assert.equal((await exp()).transactions.length,0);
await assert.rejects(call('restore_user_backup',backup)); // globally conflicting bucket ID
assert.equal((await exp()).buckets.length,0);
await assert.rejects(db.query(`INSERT INTO public.transactions(id,user_id,type,amount,description,"bucketId",date) VALUES('other',$1,'expense',1,'x','bucket','2024-01-01')`,[b]));
await db.exec(`SET test.uid='${a}';`);
current=await exp();
// Collision with another transaction ID must not advance recurrence progress.
await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,description,date) VALUES('recurring:yearly:2025-02-28',$1,'expense',1,'collision','2024-01-01')`,[a]);
await assert.rejects(call('process_recurring_transactions','2025-02-28'));
assert.equal((await exp()).recurringTransactions[0].lastApplied,'2024-02-29');
await assert.rejects(db.query(`INSERT INTO public.transactions(id,user_id,type,amount,description,date) VALUES('fraction',$1,'expense',0.001,'bad','2024-01-01')`,[a]));
// Retrying a completed request must preserve subsequent edits.
const requestId=randomUUID(); const saved=await exp();
await call('restore_user_backup',saved,requestId);
await db.query(`UPDATE public.buckets SET name='After restore' WHERE id='bucket'`);
await call('restore_user_backup',saved,requestId);
assert.equal((await exp()).buckets[0].name,'After restore');
await assert.rejects(call('restore_user_backup',backup,requestId));
// Original ON DELETE SET NULL / CASCADE semantics remain compatible.
await db.query(`DELETE FROM public.recurring_transactions WHERE id='yearly'`);
assert.ok((await exp()).transactions.every(t=>t.recurringId===null));
await db.query(`DELETE FROM public.buckets WHERE id='bucket'`);
assert.ok((await exp()).transactions.every(t=>t.bucketId===null));
// A multiyear backlog commits progress once per schedule, not once per occurrence.
const daily=structuredClone(backup); daily.recurringTransactions=[{...backup.recurringTransactions[0],id:'daily',frequency:'daily',startDate:'2020-01-01',endDate:'2023-12-31'}];
await call('restore_user_backup',daily);
const backlogStart=performance.now();
assert.deepEqual(await call('process_recurring_transactions','2024-01-01'),{created:1461});
assert.equal((await exp()).recurringTransactions[0].lastApplied,'2023-12-31');
console.log('1461-entry backlog milliseconds:',Math.round(performance.now()-backlogStart));
await assert.rejects(call('process_recurring_transactions','9999-01-01'),e=>e.code==='22023');
await db.close();
// Migration rejects unsafe historical values instead of rounding or deleting them.
for (const seed of [
 `INSERT INTO public.transactions(id,user_id,type,amount,description,date) VALUES('old','${a}','expense',0.001,'old','2024-01-01')`,
 `INSERT INTO public.recurring_transactions(id,user_id,type,amount,description,frequency,\"startDate\") VALUES('r','${a}','expense',1,'r','daily','2024-01-01'); INSERT INTO public.transactions(id,user_id,type,amount,description,date,\"recurringId\") VALUES('one','${a}','expense',1,'old','2024-01-01','r'),('two','${a}','expense',1,'old','2024-01-01','r')`
]) {
 const preflight=new PGlite();
 await preflight.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users VALUES('${a}'); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${a}'::uuid $$; CREATE ROLE anon; CREATE ROLE authenticated;`);
 await preflight.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 await preflight.exec(seed);
 const before=(await preflight.query('SELECT * FROM public.transactions ORDER BY id')).rows;
 await assert.rejects(preflight.exec(await readFile(new URL('../supabase/migration_reliability.sql',import.meta.url),'utf8')));
 await preflight.exec('ROLLBACK');
 assert.deepEqual((await preflight.query('SELECT * FROM public.transactions ORDER BY id')).rows,before);
 await preflight.close();
}
console.log('PASS: anchored monthly/yearly dates, idempotency, failed-write progress, atomic restore failures, legacy summaries, exact money, cross-user RLS and references');
