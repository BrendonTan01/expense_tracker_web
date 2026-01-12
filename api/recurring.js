import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // GET all recurring transactions
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

      if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
        return res.status(400).json({ error: 'frequency must be daily, weekly, monthly, or yearly' });
      }

      if (transaction.type !== 'expense' && transaction.type !== 'income') {
        return res.status(400).json({ error: 'transaction.type must be either "expense" or "income"' });
      }

      const { data, error } = await supabase
        .from('recurring_transactions')
        .insert([{
          id: recurringId,
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
