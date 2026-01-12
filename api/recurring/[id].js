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

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Recurring transaction not found' });
        }
        throw error;
      }

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

      return res.status(200).json(recurring);
    }

    if (req.method === 'PUT') {
      const { transaction, frequency, startDate, endDate, lastApplied } = req.body;

      if (!transaction || !frequency || !startDate) {
        return res.status(400).json({ error: 'transaction, frequency, and startDate are required' });
      }

      if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
        return res.status(400).json({ error: 'frequency must be daily, weekly, monthly, or yearly' });
      }

      if (transaction.type !== 'expense' && transaction.type !== 'income') {
        return res.status(400).json({ error: 'transaction.type must be either "expense" or "income"' });
      }

      const { data, error } = await supabase
        .from('recurring_transactions')
        .update({
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          bucketId: transaction.bucketId || null,
          frequency,
          startDate,
          endDate: endDate || null,
          lastApplied: lastApplied || null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Recurring transaction not found' });
        }
        throw error;
      }

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

      return res.status(200).json(recurring);
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('recurring_transactions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(204).send();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
