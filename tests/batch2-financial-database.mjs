// In-memory PostgreSQL only. Hosted locking/concurrency needs separate staging checks.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
const schema=await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8');
const reliability=await readFile(new URL('../supabase/migration_reliability.sql',import.meta.url),'utf8');
const financial=await readFile(new URL('../supabase/migration_batch2_financial.sql',import.meta.url),'utf8');
async function setup(migrate=true){const db=new PGlite();await db.exec(`CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE ROLE anon;CREATE ROLE authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
INSERT INTO auth.users VALUES('${a}'),('${b}');`);await db.exec(schema);await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;');await db.exec(reliability);if(migrate)await db.exec(financial);return db;}
const db=await setup();
const call=async(fn,args)=> (await db.query(`SELECT public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS value`,args)).rows[0].value;
const budgets=async()=> (await db.query('SELECT * FROM public.budgets ORDER BY id')).rows;
const schedule=async(id)=> (await db.query('SELECT * FROM public.recurring_transactions WHERE id=$1',[id])).rows[0];
const history=async(id)=> (await db.query('SELECT * FROM public.transactions WHERE "recurringId"=$1 ORDER BY date,id',[id])).rows;
const count=async(table)=>Number((await db.query(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n);
await db.exec(`SET ROLE authenticated;SET test.uid='${a}';INSERT INTO public.buckets(id,user_id,name) VALUES('bucket','${a}','General');`);
assert.deepEqual(await call('financial_batch2_capabilities',[]),{budgetBatch:true,recurringEdit:true,recurringHistoryJump:true});
// Completed history is not scanned or counted. Fourteen schedules previously
// exceeded the 50,000 limit, even with no due writes; one due entry must still work.
for(let i=0;i<14;i++)await db.query(`INSERT INTO public.recurring_transactions(id,user_id,type,amount,description,frequency,"startDate","endDate","lastApplied") VALUES($1,$2,'income',1,'Completed','daily','1600-01-01','2024-01-01','2024-01-01')`,['long'+i,a]);
assert.deepEqual(await call('process_recurring_transactions',['2024-01-02']),{created:0});
await db.query(`UPDATE public.recurring_transactions SET "endDate"=NULL WHERE id='long0'`);
assert.deepEqual(await call('process_recurring_transactions',['2024-01-02']),{created:1});
assert.equal((await schedule('long0')).lastApplied,'2024-01-02');
assert.deepEqual(await call('process_recurring_transactions',['2024-01-02']),{created:0});
// Legacy progress guard jumps too, and still rejects a missing new occurrence.
await assert.rejects(db.query(`UPDATE public.recurring_transactions SET "lastApplied"='2024-01-03' WHERE id='long0'`),e=>e.code==='23514');
await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,description,date,"recurringId") VALUES('legacy-step',$1,'income',1,'Due','2024-01-03','long0')`,[a]);
await db.query(`UPDATE public.recurring_transactions SET "lastApplied"='2024-01-03' WHERE id='long0'`);
assert.equal((await schedule('long0')).lastApplied,'2024-01-03');
await db.query(`UPDATE public.recurring_transactions SET "endDate"='2024-01-03' WHERE id='long0'`);
for(const [frequency,start,after,index,next] of [
 ['monthly','2024-01-31','2024-02-28',1,'2024-02-29'],['monthly','2024-01-31','2024-02-29',2,'2024-03-31'],
 ['yearly','2020-02-29','2023-02-28',4,'2024-02-29'],['weekly','2024-01-01','2024-01-02',1,'2024-01-08'],
 ['fortnightly','2024-01-01','2024-01-14',1,'2024-01-15'],['daily','2024-01-02','2024-01-01',0,'2024-01-02']]){
 assert.equal(await call('recurring_first_after',[start,frequency,after]),index);
 assert.equal((await db.query(`SELECT to_char(public.recurring_occurrence_at($1,$2,$3),'YYYY-MM-DD') AS value`,[start,frequency,index])).rows[0].value,next);
}
// Atomic budget creation plus duplicate/period constraints protect RPC and legacy writes.
const batch=Array.from({length:12},(_,i)=>({id:'budget'+String(i+1).padStart(2,'0'),bucketId:'bucket',amount:1.23,period:'monthly',year:2024,month:i+1}));
const initial=await call('create_budget_batch',[batch,'batch1']);assert.equal(initial.budgets.length,12);assert.equal(initial.replayed,false);
assert.equal((await call('create_budget_batch',[batch,'batch1'])).replayed,true);assert.equal(await count('budgets'),12);
await assert.rejects(call('create_budget_batch',[[{...batch[0],amount:2}],'batch1']),e=>e.code==='23505');
await assert.rejects(call('create_budget_batch',[[{...batch[0],id:'duplicate'}],'different']),e=>e.code==='23505');
assert.equal(await count('budgets'),12);
for(const patch of [{year:0},{year:10000},{year:2024.5},{month:0},{month:13},{month:null},{month:1.5},{period:'yearly',month:1},{amount:0.001}]){
 await assert.rejects(call('create_budget_batch',[[{...batch[0],id:'invalid',...patch}],'invalid'+JSON.stringify(patch)]));assert.equal(await count('budgets'),12);
}
// Replay returns current data without restoring a deleted row or reverting later edits.
await db.exec(`UPDATE public.budgets SET amount=9.99 WHERE id='budget01';DELETE FROM public.budgets WHERE id='budget02'`);
const replay=await call('create_budget_batch',[batch,'batch1']);assert.equal(replay.budgets.length,11);assert.equal(replay.budgets.find(x=>x.id==='budget01').amount,9.99);
const beforeBudget=await budgets();
await db.exec(`RESET ROLE;CREATE FUNCTION public.test_batch_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='fail-second' THEN RAISE EXCEPTION 'Injected write failure'; END IF;RETURN NEW;END $$;CREATE TRIGGER test_batch_failure BEFORE INSERT ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.test_batch_failure();SET ROLE authenticated;`);
await assert.rejects(call('create_budget_batch',[[{...batch[0],id:'first',year:2025},{...batch[1],id:'fail-second',year:2025}],'rollback-budget']));
assert.deepEqual(await budgets(),beforeBudget);assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.financial_operation_receipts WHERE request_id='rollback-budget'`)).rows[0].n,0);
await db.exec('RESET ROLE;DROP TRIGGER test_batch_failure ON public.budgets;DROP FUNCTION public.test_batch_failure();SET ROLE authenticated;');
// Recurring edit scopes change only financial fields; IDs/dates/notes/tags/links survive.
await db.query(`INSERT INTO public.recurring_transactions(id,user_id,type,amount,description,"bucketId",frequency,"startDate","endDate","lastApplied") VALUES('edit',$1,'expense',1,'Original','bucket','monthly','2024-01-31','2024-03-31','2024-02-29')`,[a]);
for(const [i,date] of ['2024-01-31','2024-02-29','2024-03-31','2024-04-30'].entries())await db.query(`INSERT INTO public.transactions(id,user_id,type,amount,description,"bucketId",date,"isRecurring","recurringId",notes,tags) VALUES($1,$2,'expense',1,'Original','bucket',$3,1,'edit','Keep note','["keep"]')`,['history'+i,a,date]);
const unchanged=await history('edit');
let edited=await call('edit_recurring_transaction',['edit',{endDate:null},'none','2024-02-29','clear-end']);assert.equal(edited.recurring.endDate,null);assert.equal(edited.updated,0);assert.deepEqual(await history('edit'),unchanged);assert.equal(edited.recurring.lastApplied,'2024-02-29');
const tx={type:'income',amount:2.34,description:'Changed',bucketId:'bucket'};
edited=await call('edit_recurring_transaction',['edit',{transaction:tx},'fromNext','2024-02-29','future-edit']);assert.equal(edited.updated,2);
let rows=await history('edit');assert.deepEqual(rows.map(x=>Number(x.amount)),[1,1,2.34,2.34]);
for(let i=0;i<rows.length;i++)for(const k of ['id','date','notes','tags','recurringId','isRecurring'])assert.equal(rows[i][k],unchanged[i][k]);
edited=await call('edit_recurring_transaction',['edit',{transaction:{...tx,amount:3.45}},'all','2024-02-29','all-edit']);assert.equal(edited.updated,4);assert.ok((await history('edit')).every(x=>Number(x.amount)===3.45));
// Replaying earlier mutations cannot overwrite the later schedule/history.
edited=await call('edit_recurring_transaction',['edit',{transaction:tx},'fromNext','2024-02-29','future-edit']);assert.equal(edited.replayed,true);assert.equal(edited.updated,0);assert.equal(edited.recurring.transaction.amount,3.45);assert.ok((await history('edit')).every(x=>Number(x.amount)===3.45));
await assert.rejects(call('edit_recurring_transaction',['edit',{endDate:null},'none','2024-02-29','all-edit']),e=>e.code==='23505');
// Failed history rewrite rolls back the preceding schedule update and receipt.
const beforeSchedule=await schedule('edit'),beforeHistory=await history('edit');
await db.exec(`RESET ROLE;CREATE FUNCTION public.test_history_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='history2' THEN RAISE EXCEPTION 'Injected history failure';END IF;RETURN NEW;END $$;CREATE TRIGGER test_history_failure BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.test_history_failure();SET ROLE authenticated;`);
await assert.rejects(call('edit_recurring_transaction',['edit',{transaction:{...tx,amount:4.56}},'all','2024-02-29','rollback-edit']));assert.deepEqual(await schedule('edit'),beforeSchedule);assert.deepEqual(await history('edit'),beforeHistory);
assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.financial_operation_receipts WHERE request_id='rollback-edit'`)).rows[0].n,0);
await db.exec('RESET ROLE;DROP TRIGGER test_history_failure ON public.transactions;DROP FUNCTION public.test_history_failure();SET ROLE authenticated;');
// Clearing end date enables future generation while respecting existing occurrences.
assert.deepEqual(await call('process_recurring_transactions',['2024-05-31']),{created:1});assert.equal((await schedule('edit')).lastApplied,'2024-05-31');
await assert.rejects(db.query('DELETE FROM public.financial_operation_receipts'),e=>e.code==='42501');await assert.rejects(db.query("UPDATE public.financial_operation_receipts SET payload_hash='changed'"),e=>e.code==='42501');
// Account B cannot read, edit, or reference A's schedules/budgets/receipts.
await db.exec(`SET test.uid='${b}';`);assert.equal(await count('budgets'),0);assert.equal(await count('financial_operation_receipts'),0);
await assert.rejects(call('edit_recurring_transaction',['edit',{endDate:null},'none','2024-02-29','foreign']),e=>e.code==='P0002');
await assert.rejects(call('create_budget_batch',[[{...batch[0],id:'b-budget',year:2026}],'foreign-bucket']),e=>e.code==='23503');assert.equal(await count('budgets'),0);
await db.exec(`SET test.uid='${a}';DELETE FROM public.recurring_transactions WHERE id='edit';`);
edited=await call('edit_recurring_transaction',['edit',{transaction:{...tx,amount:3.45}},'all','2024-02-29','all-edit']);assert.equal(edited.recurring,null);assert.equal(edited.replayed,true);assert.equal(await schedule('edit'),undefined);
await db.exec('RESET ROLE;SET ROLE anon;');await assert.rejects(call('financial_batch2_capabilities',[]),e=>e.code==='42501');await assert.rejects(call('create_budget_batch',[batch,'anon']),e=>e.code==='42501');
await db.close();
// Applying the migration to conflicting old data aborts without editing records.
for(const seed of [
 `INSERT INTO public.budgets VALUES('invalid','${a}','bucket',1,'monthly',2024,13)`,
 `INSERT INTO public.budgets VALUES('one','${a}','bucket',1,'monthly',2024,1),('two','${a}','bucket',2,'monthly',2024,1)`,
 `INSERT INTO public.budgets VALUES('one','${a}','bucket',1,'yearly',2024,NULL),('two','${a}','bucket',2,'yearly',2024,NULL)`]){
 const pre=await setup(false);await pre.exec(`INSERT INTO public.buckets(id,user_id,name) VALUES('bucket','${a}','General');`);await pre.exec(seed);const before=(await pre.query('SELECT * FROM public.budgets ORDER BY id')).rows;
 await assert.rejects(pre.exec(financial));await pre.exec('ROLLBACK');assert.deepEqual((await pre.query('SELECT * FROM public.budgets ORDER BY id')).rows,before);
 assert.equal((await pre.query("SELECT count(*)::int AS n FROM pg_constraint WHERE conname='budgets_valid_period'")).rows[0].n,0);await pre.close();
}
console.log('PASS Batch 2 financial SQL: long-history jump + legacy guard, anchored dates, atomic budgets/history, replay after later mutations/deletion, preflight rollback, RLS and immutable receipts. Hosted concurrency remains separate.');
