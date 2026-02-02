import { getAuthenticatedClient } from '../../../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { recurringId } = req.query;

  try {
    // Get authenticated Supabase client
    const { supabase, error: authError } = await getAuthenticatedClient(req.headers);

    if (authError) {
      return res.status(401).json({ error: authError });
    }

    if (req.method !== 'PUT') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!recurringId) {
      return res.status(400).json({ error: 'recurringId is required' });
    }

    const { transaction, fromDate } = req.body || {};

    if (!transaction || typeof transaction !== 'object') {
      return res.status(400).json({ error: 'transaction is required' });
    }

    if (!['expense', 'income', 'investment'].includes(transaction.type)) {
      return res.status(400).json({ error: 'transaction.type must be either "expense", "income", or "investment"' });
    }

    if (transaction.amount === undefined || transaction.amount === null || Number.isNaN(Number(transaction.amount))) {
      return res.status(400).json({ error: 'transaction.amount must be a number' });
    }

    if (typeof transaction.description !== 'string' || transaction.description.length === 0) {
      return res.status(400).json({ error: 'transaction.description must be a non-empty string' });
    }

    if (fromDate !== undefined && fromDate !== null) {
      const fd = String(fromDate).split('T')[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fd)) {
        return res.status(400).json({ error: 'fromDate must be an ISO date (YYYY-MM-DD)' });
      }
    }

    let query = supabase
      .from('transactions')
      .update({
        type: transaction.type,
        amount: Number(transaction.amount),
        description: transaction.description,
        bucketId: transaction.bucketId || null,
      })
      .eq('recurringId', recurringId);

    if (fromDate) {
      query = query.gte('date', String(fromDate).split('T')[0]);
    }

    const { data, error } = await query.select('*');

    if (error) throw error;

    const transactions = (data || []).map((t) => ({
      ...t,
      isRecurring: Boolean(t.isRecurring),
      bucketId: t.bucketId || undefined,
      recurringId: t.recurringId || undefined,
      tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined,
      notes: t.notes || undefined,
    }));

    return res.status(200).json({
      updated: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}

