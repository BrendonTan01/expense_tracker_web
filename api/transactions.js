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
      // GET all transactions with filters
      const { startDate, endDate, type } = req.query;
      let query = supabase
        .from('transactions')
        .select('*');

      if (startDate) {
        query = query.gte('date', startDate);
      }
      if (endDate) {
        query = query.lte('date', endDate);
      }
      if (type) {
        query = query.eq('type', type);
      }

      query = query.order('date', { ascending: false })
        .order('id', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Convert isRecurring from integer to boolean
      const transactions = (data || []).map(t => ({
        ...t,
        isRecurring: Boolean(t.isRecurring),
        bucketId: t.bucketId || undefined,
        recurringId: t.recurringId || undefined,
      }));

      return res.status(200).json(transactions);
    }

    if (req.method === 'POST') {
      // CREATE transaction
      const { id: transactionId, type, amount, description, bucketId, date, isRecurring, recurringId } = req.body;

      if (!transactionId || !type || amount === undefined || !description || !date) {
        return res.status(400).json({ error: 'id, type, amount, description, and date are required' });
      }

      if (type !== 'expense' && type !== 'income') {
        return res.status(400).json({ error: 'type must be either "expense" or "income"' });
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert([{
          id: transactionId,
          type,
          amount,
          description,
          bucketId: bucketId || null,
          date,
          isRecurring: isRecurring ? 1 : 0,
          recurringId: recurringId || null,
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
