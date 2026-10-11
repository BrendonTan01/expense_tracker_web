-- Apply manually after a verified backup. Calendar CHECKs reject historical
-- timestamps/noncanonical dates rather than truncating them; reconcile explicitly. All changes are atomic; preflight failures
-- require inspecting the named records, never rounding/deleting financial history.
BEGIN;
DO $$
DECLARE t text; bad text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions','recurring_transactions','budgets'] LOOP
    EXECUTE format('SELECT id FROM public.%I WHERE amount::text::numeric <= 0 OR amount::text::numeric > 9999999999.99 OR amount::text::numeric <> trunc(amount::text::numeric, 2) LIMIT 1',t) INTO bad;
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'Invalid money in %.id=%; correct explicitly before migration', t,bad; END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN amount TYPE numeric USING amount::text::numeric',t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (amount > 0 AND amount <= 9999999999.99 AND amount = trunc(amount,2))',t,t||'_money_exact');
  END LOOP;
  SELECT "recurringId" INTO bad FROM public.transactions WHERE "recurringId" IS NOT NULL GROUP BY user_id,"recurringId",date HAVING count(*)>1 LIMIT 1;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'Duplicate recurring occurrences for %; reconcile explicitly before migration',bad; END IF;
  IF EXISTS(SELECT 1 FROM public.transactions t JOIN public.buckets b ON b.id=t."bucketId" WHERE b.user_id<>t.user_id)
    OR EXISTS(SELECT 1 FROM public.recurring_transactions t JOIN public.buckets b ON b.id=t."bucketId" WHERE b.user_id<>t.user_id)
    OR EXISTS(SELECT 1 FROM public.budgets t JOIN public.buckets b ON b.id=t."bucketId" WHERE b.user_id<>t.user_id)
    OR EXISTS(SELECT 1 FROM public.transactions t JOIN public.recurring_transactions r ON r.id=t."recurringId" WHERE r.user_id<>t.user_id)
  THEN RAISE EXCEPTION 'Cross-owner references found; reconcile explicitly before migration'; END IF;
END $$;
CREATE UNIQUE INDEX transactions_unique_occurrence ON public.transactions(user_id,"recurringId",date) WHERE "recurringId" IS NOT NULL;
-- Composite ownership FKs protect direct API writes and cascading deletions too.
ALTER TABLE public.buckets ADD CONSTRAINT buckets_owner_id UNIQUE(user_id,id);
ALTER TABLE public.recurring_transactions ADD CONSTRAINT recurring_owner_id UNIQUE(user_id,id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_bucket_owner FOREIGN KEY(user_id,"bucketId") REFERENCES public.buckets(user_id,id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_recurring_owner FOREIGN KEY(user_id,"recurringId") REFERENCES public.recurring_transactions(user_id,id);
ALTER TABLE public.recurring_transactions ADD CONSTRAINT recurring_bucket_owner FOREIGN KEY(user_id,"bucketId") REFERENCES public.buckets(user_id,id);
ALTER TABLE public.budgets ADD CONSTRAINT budgets_bucket_owner FOREIGN KEY(user_id,"bucketId") REFERENCES public.buckets(user_id,id);

CREATE FUNCTION public.reliability_date(v text) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE d date;
BEGIN
  IF v IS NULL OR v !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Expected date YYYY-MM-DD'; END IF;
  d := v::date;
  IF to_char(d,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'Invalid calendar date'; END IF;
  RETURN d;
END $$;

-- The same transaction lock also serializes writes from older installed clients.
CREATE FUNCTION public.lock_user_financial_write() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,74321)); END IF;
  RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['buckets','transactions','recurring_transactions','budgets','monthly_summaries','yearly_summaries'] LOOP
    EXECUTE format('CREATE TRIGGER reliability_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.lock_user_financial_write()',t);
  END LOOP;
END $$;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_calendar_date CHECK(public.reliability_date(date) IS NOT NULL);
ALTER TABLE public.recurring_transactions ADD CONSTRAINT recurring_calendar_dates CHECK(
  public.reliability_date("startDate") IS NOT NULL
  AND ("endDate" IS NULL OR public.reliability_date("endDate")>=public.reliability_date("startDate"))
  AND ("lastApplied" IS NULL OR public.reliability_date("lastApplied") IS NOT NULL));
CREATE TABLE public.backup_restore_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  payload_hash text NOT NULL,
  PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.backup_restore_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY restore_receipts_select ON public.backup_restore_receipts FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY restore_receipts_insert ON public.backup_restore_receipts FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT ON public.backup_restore_receipts TO authenticated;
REVOKE UPDATE,DELETE,TRUNCATE ON public.backup_restore_receipts FROM authenticated,anon;

-- Older clients may attempt to advance progress after failed inserts. Require
-- every newly due occurrence to exist before accepting an UPDATE watermark.
-- INSERT preserves imported historical watermarks (history may have been trimmed).
CREATE FUNCTION public.guard_recurring_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE anchor date; previous date; target date; due date; n integer := 0;
BEGIN
  IF NEW."lastApplied" IS NULL THEN RETURN NEW; END IF;
  target := public.reliability_date(NEW."lastApplied");
  previous := CASE WHEN OLD."lastApplied" IS NULL THEN NULL ELSE public.reliability_date(OLD."lastApplied") END;
  IF previous IS NOT NULL AND target<=previous THEN RETURN NEW; END IF;
  anchor := public.reliability_date(NEW."startDate");
  LOOP
    due := CASE NEW.frequency
      WHEN 'daily' THEN anchor+n
      WHEN 'weekly' THEN anchor+n*7
      WHEN 'fortnightly' THEN anchor+n*14
      WHEN 'monthly' THEN (anchor+make_interval(months=>n))::date
      WHEN 'yearly' THEN (anchor+make_interval(years=>n))::date END;
    EXIT WHEN due>target OR (NEW."endDate" IS NOT NULL AND due>public.reliability_date(NEW."endDate"));
    IF due IS NULL OR n>=50000 THEN RAISE EXCEPTION 'Invalid or excessive recurring history' USING ERRCODE='22023'; END IF;
    IF (previous IS NULL OR due>previous) AND NOT EXISTS(
      SELECT 1 FROM public.transactions t WHERE t.user_id=NEW.user_id AND t."recurringId"=NEW.id AND t.date=to_char(due,'YYYY-MM-DD')
    ) THEN RAISE EXCEPTION 'Cannot advance recurring progress: missing occurrence %',due USING ERRCODE='23514'; END IF;
    n := n+1;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER recurring_progress_guard BEFORE UPDATE ON public.recurring_transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_recurring_progress();

CREATE FUNCTION public.process_recurring_transactions(p_today text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); today date; r public.recurring_transactions%ROWTYPE;
  start_day date; due date; latest_due date; last_day date; end_day date; n integer; count_created integer := 0; wrote integer; steps integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  today := public.reliability_date(p_today);
  IF today > current_date + 1 THEN RAISE EXCEPTION 'Cannot process future recurring dates' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 74321));
  FOR r IN SELECT * FROM public.recurring_transactions WHERE user_id=uid ORDER BY id FOR UPDATE LOOP
    start_day := public.reliability_date(r."startDate");
    last_day := CASE WHEN r."lastApplied" IS NULL THEN NULL ELSE public.reliability_date(r."lastApplied") END;
    end_day := CASE WHEN r."endDate" IS NULL THEN today ELSE least(today, public.reliability_date(r."endDate")) END;
    n := 0;
    latest_due := NULL;
    LOOP
      due := CASE r.frequency
        WHEN 'daily' THEN start_day+n
        WHEN 'weekly' THEN start_day+n*7
        WHEN 'fortnightly' THEN start_day+n*14
        WHEN 'monthly' THEN (start_day + make_interval(months=>n))::date
        WHEN 'yearly' THEN (start_day + make_interval(years=>n))::date END;
      EXIT WHEN due>end_day;
      steps := steps+1;
      IF steps>50000 THEN RAISE EXCEPTION 'Recurring history exceeds safe processing limit'; END IF;
      IF last_day IS NULL OR due>last_day THEN
        INSERT INTO public.transactions(id,user_id,type,amount,description,"bucketId",date,"isRecurring","recurringId")
          VALUES('recurring:'||r.id||':'||to_char(due,'YYYY-MM-DD'),uid,r.type,r.amount,r.description,r."bucketId",to_char(due,'YYYY-MM-DD'),1,r.id)
          ON CONFLICT (user_id,"recurringId",date) WHERE "recurringId" IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS wrote = ROW_COUNT;
        count_created := count_created+wrote;
        latest_due := due;
      END IF;
      n := n+1;
    END LOOP;
    IF latest_due IS NOT NULL THEN
      UPDATE public.recurring_transactions SET "lastApplied"=to_char(latest_due,'YYYY-MM-DD') WHERE id=r.id AND user_id=uid;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('created',count_created);
END $$;

CREATE FUNCTION public.export_user_backup() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT jsonb_build_object(
 'buckets',coalesce((SELECT jsonb_agg(to_jsonb(t)-'user_id' ORDER BY id) FROM public.buckets t WHERE user_id=auth.uid()),'[]'::jsonb),
 'transactions',coalesce((SELECT jsonb_agg((to_jsonb(t)-'user_id'-'tags'-'isRecurring') || jsonb_build_object('isRecurring',t."isRecurring"<>0,'tags',coalesce(t.tags::jsonb,'[]'::jsonb)) ORDER BY id) FROM public.transactions t WHERE user_id=auth.uid()),'[]'::jsonb),
 'recurringTransactions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'frequency',frequency,'startDate',"startDate",'endDate',"endDate",'lastApplied',"lastApplied",'transaction',jsonb_build_object('type',type,'amount',amount,'description',description,'bucketId',"bucketId")) ORDER BY id) FROM public.recurring_transactions WHERE user_id=auth.uid()),'[]'::jsonb),
 'budgets',coalesce((SELECT jsonb_agg(to_jsonb(t)-'user_id' ORDER BY id) FROM public.budgets t WHERE user_id=auth.uid()),'[]'::jsonb),
 'monthlySummaries',coalesce((SELECT jsonb_agg(to_jsonb(t)-'user_id' ORDER BY id) FROM public.monthly_summaries t WHERE user_id=auth.uid()),'[]'::jsonb),
 'yearlySummaries',coalesce((SELECT jsonb_agg(to_jsonb(t)-'user_id' ORDER BY id) FROM public.yearly_summaries t WHERE user_id=auth.uid()),'[]'::jsonb));
$$;

CREATE FUNCTION public.restore_user_backup(p_data jsonb, p_request_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); k text; item jsonb; tx jsonb; prior_hash text; payload_hash text := encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Restore request ID required (1-200 characters)'; END IF;
  IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Expected backup object'; END IF;
  FOREACH k IN ARRAY ARRAY['buckets','transactions','recurringTransactions','budgets','monthlySummaries','yearlySummaries'] LOOP
    IF NOT (p_data ? k) AND k IN ('monthlySummaries','yearlySummaries') THEN CONTINUE; END IF;
    IF jsonb_typeof(p_data->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Missing or invalid backup array %',k; END IF;
    IF jsonb_array_length(p_data->k)>50000 THEN RAISE EXCEPTION 'Backup array % too large',k; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_data->k) LOOP
      IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR length(item->>'id') NOT BETWEEN 1 AND 200 OR item ? 'user_id' THEN RAISE EXCEPTION 'Invalid record in %',k; END IF;
    END LOOP;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text,74321));
  SELECT r.payload_hash INTO prior_hash FROM public.backup_restore_receipts r WHERE user_id=uid AND request_id=p_request_id;
  IF FOUND THEN
    IF prior_hash<>payload_hash THEN RAISE EXCEPTION 'Restore request ID reused with different data'; END IF;
    RETURN jsonb_build_object('restored',true);
  END IF;
  -- Any validation/constraint error rolls back all these deletes and inserts.
  DELETE FROM public.transactions WHERE user_id=uid;
  DELETE FROM public.budgets WHERE user_id=uid;
  DELETE FROM public.recurring_transactions WHERE user_id=uid;
  DELETE FROM public.buckets WHERE user_id=uid;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'buckets') LOOP
    INSERT INTO public.buckets(id,user_id,name,color) VALUES(item->>'id',uid,item->>'name',item->>'color');
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'recurringTransactions') LOOP
    tx := item->'transaction';
    IF jsonb_typeof(tx) IS DISTINCT FROM 'object' OR jsonb_typeof(tx->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid recurring transaction'; END IF;
    PERFORM public.reliability_date(item->>'startDate');
    IF item->>'endDate' IS NOT NULL THEN
      IF public.reliability_date(item->>'endDate')<public.reliability_date(item->>'startDate') THEN RAISE EXCEPTION 'End before start'; END IF;
    END IF;
    IF item->>'lastApplied' IS NOT NULL THEN PERFORM public.reliability_date(item->>'lastApplied'); END IF;
    INSERT INTO public.recurring_transactions(id,user_id,type,amount,description,"bucketId",frequency,"startDate","endDate","lastApplied")
      VALUES(item->>'id',uid,tx->>'type',(tx->>'amount')::numeric,tx->>'description',tx->>'bucketId',item->>'frequency',item->>'startDate',item->>'endDate',item->>'lastApplied');
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'transactions') LOOP
    IF jsonb_typeof(item->'amount') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'isRecurring') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
    PERFORM public.reliability_date(item->>'date');
    IF item->>'tags' IS NOT NULL THEN
      IF jsonb_typeof(item->'tags')<>'array' THEN RAISE EXCEPTION 'Invalid tags'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(item->'tags') v WHERE jsonb_typeof(v)<>'string') THEN RAISE EXCEPTION 'Invalid tag'; END IF;
    END IF;
    INSERT INTO public.transactions(id,user_id,type,amount,description,"bucketId",date,"isRecurring","recurringId",tags,notes)
      VALUES(item->>'id',uid,item->>'type',(item->>'amount')::numeric,item->>'description',item->>'bucketId',item->>'date',CASE WHEN (item->>'isRecurring')::boolean THEN 1 ELSE 0 END,item->>'recurringId',(item->'tags')::text,item->>'notes');
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'budgets') LOOP
    IF jsonb_typeof(item->'amount') IS DISTINCT FROM 'number' OR (item->>'year')::numeric<>trunc((item->>'year')::numeric) OR (item->>'year')::integer NOT BETWEEN 1 AND 9999 THEN RAISE EXCEPTION 'Invalid budget'; END IF;
    IF item->>'period'='monthly' AND (item->>'month' IS NULL OR (item->>'month')::numeric<>trunc((item->>'month')::numeric) OR (item->>'month')::integer NOT BETWEEN 1 AND 12) THEN RAISE EXCEPTION 'Invalid budget month'; END IF;
    INSERT INTO public.budgets(id,user_id,"bucketId",amount,period,year,month) VALUES(item->>'id',uid,item->>'bucketId',(item->>'amount')::numeric,item->>'period',(item->>'year')::integer,(item->>'month')::integer);
  END LOOP;
  IF p_data ? 'monthlySummaries' THEN
    DELETE FROM public.monthly_summaries WHERE user_id=uid;
    FOR item IN SELECT value FROM jsonb_array_elements(p_data->'monthlySummaries') LOOP
      IF (item->>'year')::numeric<>trunc((item->>'year')::numeric) OR (item->>'year')::integer NOT BETWEEN 1 AND 9999 OR (item->>'month')::numeric<>trunc((item->>'month')::numeric) THEN RAISE EXCEPTION 'Invalid summary period'; END IF;
      INSERT INTO public.monthly_summaries(id,user_id,year,month,summary) VALUES(item->>'id',uid,(item->>'year')::integer,(item->>'month')::integer,item->>'summary');
    END LOOP;
  END IF;
  IF p_data ? 'yearlySummaries' THEN
    DELETE FROM public.yearly_summaries WHERE user_id=uid;
    FOR item IN SELECT value FROM jsonb_array_elements(p_data->'yearlySummaries') LOOP
      IF (item->>'year')::numeric<>trunc((item->>'year')::numeric) OR (item->>'year')::integer NOT BETWEEN 1 AND 9999 THEN RAISE EXCEPTION 'Invalid summary year'; END IF;
      INSERT INTO public.yearly_summaries(id,user_id,year,summary) VALUES(item->>'id',uid,(item->>'year')::integer,item->>'summary');
    END LOOP;
  END IF;
  INSERT INTO public.backup_restore_receipts VALUES(uid,p_request_id,payload_hash);
  RETURN jsonb_build_object('restored',true);
END $$;
REVOKE ALL ON FUNCTION public.process_recurring_transactions(text), public.restore_user_backup(jsonb,text), public.export_user_backup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_recurring_transactions(text), public.restore_user_backup(jsonb,text), public.export_user_backup() TO authenticated;
COMMIT;
