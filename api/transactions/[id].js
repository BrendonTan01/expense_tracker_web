import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  
  console.log(`[transactions/[id]] ${req.method} request for id: ${id}`);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Transaction not found' });
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

      return res.status(200).json(transaction);
    }

    if (req.method === 'PUT') {
      const { type, amount, description, bucketId, date, isRecurring, recurringId, tags, notes } = req.body;

      if (!type || amount === undefined || !description || !date) {
        return res.status(400).json({ error: 'type, amount, description, and date are required' });
      }

      if (type !== 'expense' && type !== 'income') {
        return res.status(400).json({ error: 'type must be either "expense" or "income"' });
      }

      const { data, error } = await supabase
        .from('transactions')
        .update({
          type,
          amount,
          description,
          bucketId: bucketId || null,
          date,
          isRecurring: isRecurring ? 1 : 0,
          recurringId: recurringId || null,
          tags: tags && tags.length > 0 ? JSON.stringify(tags) : null,
          notes: notes || null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Transaction not found' });
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

      return res.status(200).json(transaction);
    }

    if (req.method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete transaction error:', error);
        throw error;
      }

      return res.status(204).send();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
