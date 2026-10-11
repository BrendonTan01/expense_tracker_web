import backupHandler from '../lib/backup.js';
import { isDate } from '../lib/validation.js';
import { rpcErrorResponse } from '../lib/reliability.js';
import { isValidAmount, MONEY_ERROR, checkOwnedReferences } from '../lib/validation.js';
import { getAuthenticatedClient } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Reuse this function to remain within the existing Vercel function count.
  if (req.query?.action === 'backup') return backupHandler(req, res);
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`[recurring] ${req.method} request to ${req.url}`);

  try {
    // Get authenticated Supabase client
    const { supabase, user, error: authError } = await getAuthenticatedClient(req.headers);
    
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'GET' && req.query?.action === 'capabilities') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ recurringProcessing: true });
    }

    if (req.method === 'POST' && req.query?.action === 'process') {
      const today = req.body?.today;
      if (!isDate(today)) return res.status(400).json({ error: 'today must be a valid YYYY-MM-DD date' });
      const { data, error } = await supabase.rpc('process_recurring_transactions', { p_today: today });
      if (error) return rpcErrorResponse(res, error);
      return res.status(200).json(data);
    }

    if (req.method === 'GET') {
      // GET all recurring transactions (RLS will automatically filter by user_id)
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .order('startDate', { ascending: false });

      if (error) throw error;

      // Transform to app format
      const recurring = (data || []).map(r => ({
        id: r.id,
        transaction: {
          type: r.type,
          amount: r.amount,
          description: r.description,
          bucketId: r.bucketId || undefined,
        },
        frequency: r.frequency,
        startDate: r.startDate,
        endDate: r.endDate || undefined,
        lastApplied: r.lastApplied || undefined,
      }));

      return res.status(200).json(recurring);
    }

    if (req.method === 'POST') {
      // CREATE recurring transaction
      const { id: recurringId, transaction, frequency, startDate, endDate, lastApplied } = req.body;

      if (!recurringId || !transaction || !frequency || !startDate) {
        return res.status(400).json({ error: 'id, transaction, frequency, and startDate are required' });
      }

      if (!['daily', 'weekly', 'fortnightly', 'monthly', 'yearly'].includes(frequency)) {
        return res.status(400).json({ error: 'frequency must be daily, weekly, fortnightly, monthly, or yearly' });
      }

      if (!['expense', 'income', 'investment'].includes(transaction.type)) {
        return res.status(400).json({ error: 'transaction.type must be either "expense", "income", or "investment"' });
      }

      if (!isDate(startDate) || (endDate && (!isDate(endDate) || endDate < startDate)) || (lastApplied && !isDate(lastApplied))) return res.status(400).json({ error: 'Invalid recurring dates' });
      if (!isValidAmount(transaction.amount)) return res.status(400).json({ error: MONEY_ERROR });
      const referenceError = await checkOwnedReferences(supabase, user.id, transaction);
      if (referenceError) return res.status(400).json({ error: referenceError });

      // Include user_id in the insert - RLS policy will verify it matches auth.uid()
      const { data, error } = await supabase
        .from('recurring_transactions')
        .insert([{
          id: recurringId,
          user_id: user.id,
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          bucketId: transaction.bucketId || null,
          frequency,
          startDate,
          endDate: endDate || null,
          lastApplied: lastApplied || null,
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Recurring transaction with this ID already exists' });
        }
        throw error;
      }

      // Transform to app format
      const recurring = {
        id: data.id,
        transaction: {
          type: data.type,
          amount: data.amount,
          description: data.description,
          bucketId: data.bucketId || undefined,
        },
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate || undefined,
        lastApplied: data.lastApplied || undefined,
      };

      return res.status(201).json(recurring);
    }

    // PUT and DELETE are handled by [id].js route
    if (req.method === 'PUT' || req.method === 'DELETE') {
      return res.status(405).json({ error: 'Use /api/recurring/[id] for PUT and DELETE operations' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
