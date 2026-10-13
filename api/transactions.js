import { isDate, isValidAmount, MONEY_ERROR, checkOwnedReferences } from '../lib/validation.js';
import { getAuthenticatedClient } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Get authenticated Supabase client
    const { supabase, user, error: authError } = await getAuthenticatedClient(req.headers);
    
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'GET') {
      const { startDate, endDate, type } = req.query || {};
      // Empty query strings retain the legacy meaning of "no filter". Repeated
      // query keys and invalid dates must never become ambiguous database filters.
      if ((startDate !== undefined && startDate !== '' && !isDate(startDate)) ||
          (endDate !== undefined && endDate !== '' && !isDate(endDate))) {
        return res.status(400).json({ error: 'Date filters must be valid YYYY-MM-DD dates' });
      }
      if (type !== undefined && type !== '' && !['expense', 'income', 'investment'].includes(type)) {
        return res.status(400).json({ error: 'type must be either "expense", "income", or "investment"' });
      }

      // A scalar JSON aggregate is one database result, so the PostgREST row cap
      // cannot truncate it. One STABLE call reads one snapshot, including equal
      // dates, instead of drifting between offset pages during concurrent writes.
      const { data, error } = await supabase.rpc('get_transaction_history', {
        p_start_date: startDate || null,
        p_end_date: endDate || null,
        p_type: type || null,
      });
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') {
          return res.status(503).json({ error: 'Complete transaction history requires the database history update. Ask the app administrator to apply it before retrying.' });
        }
        console.error('Transaction history read failed:', error.code);
        return res.status(500).json({ error: 'Could not load complete transaction history. Please retry.' });
      }
      if (!Array.isArray(data)) {
        return res.status(503).json({ error: 'The database history response is incompatible. Ask the app administrator to check the database history update.' });
      }

      // Convert isRecurring from integer to boolean and parse tags
      const transactions = data.map(t => ({
        ...t,
        isRecurring: Boolean(t.isRecurring),
        bucketId: t.bucketId || undefined,
        recurringId: t.recurringId || undefined,
        tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined,
        notes: t.notes || undefined,
      }));

      return res.status(200).json(transactions);
    }

    if (req.method === 'POST') {
      // CREATE transaction
      const { id: transactionId, type, amount, description, bucketId, date, isRecurring, recurringId, tags, notes } = req.body;

      if (!transactionId || !type || amount === undefined || !description || !date) {
        return res.status(400).json({ error: 'id, type, amount, description, and date are required' });
      }

      if (!isDate(date)) return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date' });
      if (!isValidAmount(amount)) return res.status(400).json({ error: MONEY_ERROR });
      const referenceError = await checkOwnedReferences(supabase, user.id, { bucketId, recurringId });
      if (referenceError) return res.status(400).json({ error: referenceError });

      if (!['expense', 'income', 'investment'].includes(type)) {
        return res.status(400).json({ error: 'type must be either "expense", "income", or "investment"' });
      }

      // Include user_id in the insert - RLS policy will verify it matches auth.uid()
      const { data, error } = await supabase
        .from('transactions')
        .insert([{
          id: transactionId,
          user_id: user.id,
          type,
          amount,
          description,
          bucketId: bucketId || null,
          date,
          isRecurring: isRecurring ? 1 : 0,
          recurringId: recurringId || null,
          tags: tags && tags.length > 0 ? JSON.stringify(tags) : null,
          notes: notes || null,
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Transaction with this ID already exists' });
        }
        throw error;
      }

      const transaction = {
        ...data,
        isRecurring: Boolean(data.isRecurring),
        bucketId: data.bucketId || undefined,
        recurringId: data.recurringId || undefined,
        tags: data.tags ? (typeof data.tags === 'string' ? JSON.parse(data.tags) : data.tags) : undefined,
        notes: data.notes || undefined,
      };

      return res.status(201).json(transaction);
    }

    // PUT and DELETE are handled by [id].js route
    if (req.method === 'PUT' || req.method === 'DELETE') {
      return res.status(405).json({ error: 'Use /api/transactions/[id] for PUT and DELETE operations' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
