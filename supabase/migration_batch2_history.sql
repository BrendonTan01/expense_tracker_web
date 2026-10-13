-- DATA01: preserve the installed clients' plain-array API contract without
-- PostgREST's set-of-rows response cap or offset-page drift. Apply before
-- deploying the API change. No rows or existing policies are changed.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_transactions_user_date_id
  ON public.transactions (user_id, date DESC, id DESC);

CREATE OR REPLACE FUNCTION public.get_transaction_history(
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL,
  p_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  account_id uuid := auth.uid();
  result jsonb;
  filter_date text;
BEGIN
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  FOREACH filter_date IN ARRAY ARRAY[p_start_date, p_end_date] LOOP
    IF filter_date IS NOT NULL THEN
      IF filter_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         OR filter_date < '0001-01-01' THEN
        RAISE EXCEPTION 'Invalid history date filter' USING ERRCODE = '22023';
      END IF;
      -- Cast validates leap days and actual month lengths; text comparison then
      -- matches the existing ISO date columns and inclusive filter contract.
      PERFORM filter_date::date;
    END IF;
  END LOOP;
  IF p_type IS NOT NULL AND p_type NOT IN ('expense', 'income', 'investment') THEN
    RAISE EXCEPTION 'Invalid history type filter' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.date DESC, t.id DESC), '[]'::jsonb)
    INTO result
    FROM public.transactions AS t
    WHERE t.user_id = account_id
      AND (p_start_date IS NULL OR t.date >= p_start_date)
      AND (p_end_date IS NULL OR t.date <= p_end_date)
      AND (p_type IS NULL OR t.type = p_type);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_transaction_history(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_transaction_history(text, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
