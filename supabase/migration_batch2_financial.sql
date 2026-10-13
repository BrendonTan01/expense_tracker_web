-- Additive Batch 2 migration. Requires migration_reliability.sql.
-- Apply only after explicit reconciliation of invalid/duplicate historical budgets.
BEGIN;
DO $$ DECLARE bad text; BEGIN
 SELECT id INTO bad FROM public.budgets WHERE year NOT BETWEEN 1 AND 9999 OR
   (period='monthly' AND (month IS NULL OR month NOT BETWEEN 1 AND 12)) OR
   (period='yearly' AND month IS NOT NULL) LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Invalid budget period at id=%; reconcile explicitly before migration',bad; END IF;
 SELECT min(id) INTO bad FROM public.budgets GROUP BY user_id,"bucketId",period,year,month HAVING count(*)>1 LIMIT 1;
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'Duplicate budget period at id=%; reconcile explicitly before migration',bad; END IF;
END $$;
ALTER TABLE public.budgets ADD CONSTRAINT budgets_valid_period CHECK(year BETWEEN 1 AND 9999 AND
 ((period='monthly' AND month IS NOT NULL AND month BETWEEN 1 AND 12) OR (period='yearly' AND month IS NULL)));
CREATE UNIQUE INDEX budgets_unique_month ON public.budgets(user_id,"bucketId",year,month) WHERE period='monthly';
CREATE UNIQUE INDEX budgets_unique_year ON public.budgets(user_id,"bucketId",year) WHERE period='yearly';
CREATE TABLE public.financial_operation_receipts(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN ('budget_batch','recurring_edit')),
 request_id text NOT NULL CHECK(length(request_id) BETWEEN 1 AND 200),
 payload_hash text NOT NULL,
 result jsonb NOT NULL,
 PRIMARY KEY(user_id,operation,request_id)
);
ALTER TABLE public.financial_operation_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY financial_receipt_select ON public.financial_operation_receipts FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY financial_receipt_insert ON public.financial_operation_receipts FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT ON public.financial_operation_receipts TO authenticated;
REVOKE UPDATE,DELETE,TRUNCATE ON public.financial_operation_receipts FROM authenticated,anon;

-- Occurrences are always calculated from the original anchor, preserving Jan 31
-- and leap-day schedules rather than drifting after a shorter month/year.
CREATE FUNCTION public.recurring_occurrence_at(anchor date,frequency text,n integer) RETURNS date
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF n<0 THEN RAISE EXCEPTION 'Invalid occurrence index' USING ERRCODE='22023'; END IF;
 CASE frequency
 WHEN 'daily' THEN RETURN anchor+n;
 WHEN 'weekly' THEN RETURN anchor+n*7;
 WHEN 'fortnightly' THEN RETURN anchor+n*14;
 WHEN 'monthly' THEN RETURN (anchor+make_interval(months=>n))::date;
 WHEN 'yearly' THEN RETURN (anchor+make_interval(years=>n))::date;
 ELSE RAISE EXCEPTION 'Invalid frequency' USING ERRCODE='22023'; END CASE;
END $$;
CREATE FUNCTION public.recurring_first_after(anchor date,frequency text,after_day date) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$ DECLARE n integer; BEGIN
 IF after_day IS NULL OR after_day<anchor THEN RETURN 0; END IF;
 n:=CASE frequency WHEN 'daily' THEN after_day-anchor WHEN 'weekly' THEN (after_day-anchor)/7
 WHEN 'fortnightly' THEN (after_day-anchor)/14
 WHEN 'monthly' THEN (extract(year FROM after_day)::integer-extract(year FROM anchor)::integer)*12+extract(month FROM after_day)::integer-extract(month FROM anchor)::integer
 WHEN 'yearly' THEN extract(year FROM after_day)::integer-extract(year FROM anchor)::integer ELSE NULL END;
 IF n IS NULL THEN RAISE EXCEPTION 'Invalid frequency' USING ERRCODE='22023'; END IF;
 IF public.recurring_occurrence_at(anchor,frequency,n)<=after_day THEN n:=n+1; END IF;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.guard_recurring_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE anchor date; previous date; target date; due date; n integer; steps integer:=0;
BEGIN
 IF NEW."lastApplied" IS NULL THEN RETURN NEW; END IF;
 target:=public.reliability_date(NEW."lastApplied");
 previous:=CASE WHEN OLD."lastApplied" IS NULL THEN NULL ELSE public.reliability_date(OLD."lastApplied") END;
 IF previous IS NOT NULL AND target<=previous THEN RETURN NEW; END IF;
 anchor:=public.reliability_date(NEW."startDate");
 n:=public.recurring_first_after(anchor,NEW.frequency,previous);
 LOOP
  due:=public.recurring_occurrence_at(anchor,NEW.frequency,n);
  EXIT WHEN due>target OR (NEW."endDate" IS NOT NULL AND due>public.reliability_date(NEW."endDate"));
  steps:=steps+1;
  IF steps>50000 THEN RAISE EXCEPTION 'Excessive new recurring history' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.transactions t WHERE t.user_id=NEW.user_id AND t."recurringId"=NEW.id AND t.date=to_char(due,'YYYY-MM-DD')) THEN
   RAISE EXCEPTION 'Cannot advance recurring progress: missing occurrence %',due USING ERRCODE='23514';
  END IF;
  n:=n+1;
 END LOOP;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.process_recurring_transactions(p_today text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); today date; r public.recurring_transactions%ROWTYPE;
 anchor date; due date; latest_due date; last_day date; end_day date; n integer; created integer:=0; wrote integer; steps integer:=0;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 today:=public.reliability_date(p_today);
 IF today>current_date+1 THEN RAISE EXCEPTION 'Cannot process future recurring dates' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,74321));
 FOR r IN SELECT * FROM public.recurring_transactions WHERE user_id=uid ORDER BY id FOR UPDATE LOOP
  anchor:=public.reliability_date(r."startDate");
  last_day:=CASE WHEN r."lastApplied" IS NULL THEN NULL ELSE public.reliability_date(r."lastApplied") END;
  end_day:=CASE WHEN r."endDate" IS NULL THEN today ELSE least(today,public.reliability_date(r."endDate")) END;
  n:=public.recurring_first_after(anchor,r.frequency,last_day); latest_due:=NULL;
  LOOP
   due:=public.recurring_occurrence_at(anchor,r.frequency,n);
   EXIT WHEN due>end_day;
   steps:=steps+1;
   IF steps>50000 THEN RAISE EXCEPTION 'New recurring work exceeds safe processing limit' USING ERRCODE='22023'; END IF;
   INSERT INTO public.transactions(id,user_id,type,amount,description,"bucketId",date,"isRecurring","recurringId")
    VALUES('recurring:'||r.id||':'||to_char(due,'YYYY-MM-DD'),uid,r.type,r.amount,r.description,r."bucketId",to_char(due,'YYYY-MM-DD'),1,r.id)
    ON CONFLICT(user_id,"recurringId",date) WHERE "recurringId" IS NOT NULL DO NOTHING;
   GET DIAGNOSTICS wrote=ROW_COUNT; created:=created+wrote; latest_due:=due; n:=n+1;
  END LOOP;
  IF latest_due IS NOT NULL THEN UPDATE public.recurring_transactions SET "lastApplied"=to_char(latest_due,'YYYY-MM-DD') WHERE id=r.id AND user_id=uid; END IF;
 END LOOP;
 RETURN jsonb_build_object('created',created);
END $$;
CREATE FUNCTION public.create_budget_batch(p_budgets jsonb,p_request_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); item jsonb; prior public.financial_operation_receipts%ROWTYPE;
 payload_hash text:=encode(sha256(convert_to(p_budgets::text,'UTF8')),'hex'); ids jsonb:='[]'; rows jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 200 OR jsonb_typeof(p_budgets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_budgets) NOT BETWEEN 1 AND 12 THEN
  RAISE EXCEPTION 'Expected 1-12 budgets and request ID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,74321));
 SELECT * INTO prior FROM public.financial_operation_receipts WHERE user_id=uid AND operation='budget_batch' AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>payload_hash THEN RAISE EXCEPTION 'Request ID reused with different data' USING ERRCODE='23505'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(b)-'user_id' ORDER BY b.id),'[]') INTO rows FROM public.budgets b WHERE user_id=uid AND prior.result->'ids' ? b.id;
  RETURN jsonb_build_object('budgets',rows,'replayed',true);
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_budgets) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item ? 'user_id' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR length(item->>'id') NOT BETWEEN 1 AND 200
   OR jsonb_typeof(item->'bucketId') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'amount') IS DISTINCT FROM 'number'
   OR jsonb_typeof(item->'year') IS DISTINCT FROM 'number' OR (item->>'year')::numeric<>trunc((item->>'year')::numeric)
   OR item->>'period' NOT IN ('monthly','yearly') OR item->>'period' IS NULL THEN RAISE EXCEPTION 'Invalid budget' USING ERRCODE='22023'; END IF;
  IF item->>'period'='monthly' AND (jsonb_typeof(item->'month') IS DISTINCT FROM 'number' OR (item->>'month')::numeric<>trunc((item->>'month')::numeric)) THEN RAISE EXCEPTION 'Invalid budget month' USING ERRCODE='22023'; END IF;
  IF item->>'period'='yearly' AND item->>'month' IS NOT NULL THEN RAISE EXCEPTION 'Yearly budget month must be null' USING ERRCODE='22023'; END IF;
  IF (item->>'year')::numeric NOT BETWEEN 1 AND 9999 OR
    (item->>'period'='monthly' AND (item->>'month')::numeric NOT BETWEEN 1 AND 12) OR
    (item->>'amount')::numeric<=0 OR (item->>'amount')::numeric>9999999999.99 OR
    (item->>'amount')::numeric<>trunc((item->>'amount')::numeric,2) THEN RAISE EXCEPTION 'Invalid budget values' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.buckets WHERE user_id=uid AND id=item->>'bucketId') THEN RAISE EXCEPTION 'Invalid budget bucket' USING ERRCODE='23503'; END IF;
  IF EXISTS(SELECT 1 FROM public.budgets WHERE user_id=uid AND
    (id=item->>'id' OR ("bucketId"=item->>'bucketId' AND period=item->>'period' AND year=(item->>'year')::integer AND month IS NOT DISTINCT FROM (item->>'month')::integer))) THEN
    RAISE EXCEPTION 'Budget ID or period already exists' USING ERRCODE='23505'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_budgets) AS entry(value) GROUP BY entry.value->>'id' HAVING count(*)>1) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(p_budgets) AS entry(value) GROUP BY entry.value->>'bucketId',entry.value->>'period',(entry.value->>'year')::integer,(entry.value->>'month')::integer HAVING count(*)>1) THEN
  RAISE EXCEPTION 'Duplicate budget within batch' USING ERRCODE='23505'; END IF;
 -- All preflight checks run under the same user lock as every older financial
 -- writer. Database constraints remain the final authority for direct writes.
 FOR item IN SELECT value FROM jsonb_array_elements(p_budgets) LOOP
  INSERT INTO public.budgets(id,user_id,"bucketId",amount,period,year,month)
   VALUES(item->>'id',uid,item->>'bucketId',(item->>'amount')::numeric,item->>'period',(item->>'year')::integer,(item->>'month')::integer);
  ids:=ids||jsonb_build_array(item->>'id');
 END LOOP;
 INSERT INTO public.financial_operation_receipts VALUES(uid,'budget_batch',p_request_id,payload_hash,jsonb_build_object('ids',ids));
 SELECT jsonb_agg(to_jsonb(b)-'user_id' ORDER BY b.id) INTO rows FROM public.budgets b WHERE user_id=uid AND ids ? b.id;
 RETURN jsonb_build_object('budgets',rows,'replayed',false);
END $$;
CREATE FUNCTION public.edit_recurring_transaction(p_id text,p_updates jsonb,p_history_scope text,p_today text,p_request_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE uid uuid:=auth.uid(); prior public.financial_operation_receipts%ROWTYPE;
 r public.recurring_transactions%ROWTYPE; tx jsonb; today date; latest date; next_day date; affected integer:=0;
 payload_hash text:=encode(sha256(convert_to(jsonb_build_object('id',p_id,'updates',p_updates,'scope',p_history_scope,'today',p_today)::text,'UTF8')),'hex'); recurring jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 200 OR jsonb_typeof(p_updates) IS DISTINCT FROM 'object' OR p_updates='{}'
 OR p_history_scope IS NULL OR p_history_scope NOT IN ('none','all','fromNext') OR p_updates ? 'user_id' OR p_updates ? 'id' THEN RAISE EXCEPTION 'Invalid recurring edit' USING ERRCODE='22023'; END IF;
 today:=public.reliability_date(p_today);
 IF today>current_date+1 THEN RAISE EXCEPTION 'Cannot edit from future date' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,74321));
 SELECT * INTO prior FROM public.financial_operation_receipts WHERE user_id=uid AND operation='recurring_edit' AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.payload_hash<>payload_hash THEN RAISE EXCEPTION 'Request ID reused with different data' USING ERRCODE='23505'; END IF;
  SELECT * INTO r FROM public.recurring_transactions WHERE id=p_id AND user_id=uid;
  IF FOUND THEN recurring:=jsonb_build_object('id',r.id,'transaction',jsonb_build_object('type',r.type,'amount',r.amount,'description',r.description,'bucketId',r."bucketId"),'frequency',r.frequency,'startDate',r."startDate",'endDate',r."endDate",'lastApplied',r."lastApplied"); ELSE recurring:=NULL; END IF;
  RETURN jsonb_build_object('recurring',recurring,'updated',0,'replayed',true);
 END IF;
 SELECT * INTO r FROM public.recurring_transactions WHERE id=p_id AND user_id=uid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recurring transaction not found' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_updates) k WHERE k NOT IN ('transaction','frequency','startDate','endDate','lastApplied')) THEN RAISE EXCEPTION 'Unknown recurring field' USING ERRCODE='22023'; END IF;
 IF p_updates ? 'transaction' THEN
  tx:=p_updates->'transaction';
  IF jsonb_typeof(tx) IS DISTINCT FROM 'object' OR jsonb_typeof(tx->'amount') IS DISTINCT FROM 'number' OR jsonb_typeof(tx->'description') IS DISTINCT FROM 'string'
   OR tx->>'type' IS NULL OR tx->>'type' NOT IN ('expense','income','investment') OR (tx->>'bucketId' IS NOT NULL AND jsonb_typeof(tx->'bucketId')<>'string') THEN RAISE EXCEPTION 'Invalid transaction' USING ERRCODE='22023'; END IF;
  r.type:=tx->>'type'; r.amount:=(tx->>'amount')::numeric; r.description:=tx->>'description'; r."bucketId":=nullif(tx->>'bucketId','');
 END IF;
 IF p_updates ? 'frequency' THEN r.frequency:=p_updates->>'frequency'; END IF;
 IF p_updates ? 'startDate' THEN r."startDate":=p_updates->>'startDate'; END IF;
 IF p_updates ? 'endDate' THEN r."endDate":=p_updates->>'endDate'; END IF;
 IF p_updates ? 'lastApplied' THEN r."lastApplied":=p_updates->>'lastApplied'; END IF;
 -- fromNext follows the latest real owned occurrence (or imported watermark),
 -- then the next anchored date of the NEW schedule, matching the user choice.
 SELECT max(public.reliability_date(t.date)) INTO latest FROM public.transactions t WHERE t.user_id=uid AND t."recurringId"=p_id AND t.date<=p_today;
 IF latest IS NULL AND r."lastApplied" IS NOT NULL THEN latest:=public.reliability_date(r."lastApplied"); END IF;
 next_day:=public.recurring_occurrence_at(public.reliability_date(r."startDate"),r.frequency,public.recurring_first_after(public.reliability_date(r."startDate"),r.frequency,latest));
 UPDATE public.recurring_transactions SET type=r.type,amount=r.amount,description=r.description,"bucketId"=r."bucketId",frequency=r.frequency,"startDate"=r."startDate","endDate"=r."endDate","lastApplied"=r."lastApplied" WHERE id=p_id AND user_id=uid;
 IF p_history_scope<>'none' THEN
  UPDATE public.transactions SET type=r.type,amount=r.amount,description=r.description,"bucketId"=r."bucketId" WHERE user_id=uid AND "recurringId"=p_id AND (p_history_scope='all' OR (next_day<=date '9999-12-31' AND date>=to_char(next_day,'YYYY-MM-DD')));
  GET DIAGNOSTICS affected=ROW_COUNT;
 END IF;
 INSERT INTO public.financial_operation_receipts VALUES(uid,'recurring_edit',p_request_id,payload_hash,jsonb_build_object('updated',affected));
 recurring:=jsonb_build_object('id',r.id,'transaction',jsonb_build_object('type',r.type,'amount',r.amount,'description',r.description,'bucketId',r."bucketId"),'frequency',r.frequency,'startDate',r."startDate",'endDate',r."endDate",'lastApplied',r."lastApplied");
 RETURN jsonb_build_object('recurring',recurring,'updated',affected,'replayed',false);
END $$;
CREATE FUNCTION public.financial_batch2_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT jsonb_build_object('budgetBatch',true,'recurringEdit',true,'recurringHistoryJump',true) WHERE auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.recurring_occurrence_at(date,text,integer),public.recurring_first_after(date,text,date),public.create_budget_batch(jsonb,text),public.edit_recurring_transaction(text,jsonb,text,text,text),public.financial_batch2_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recurring_occurrence_at(date,text,integer),public.recurring_first_after(date,text,date),public.create_budget_batch(jsonb,text),public.edit_recurring_transaction(text,jsonb,text,text,text),public.financial_batch2_capabilities() TO authenticated;
COMMIT;
