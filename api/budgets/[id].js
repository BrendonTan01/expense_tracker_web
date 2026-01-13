import { getAuthenticatedClient } from '../../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  try {
    // Get authenticated Supabase client
    const { supabase, user, error: authError } = await getAuthenticatedClient(req.headers);
    
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Budget not found' });
        }
        throw error;
      }

      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const { bucketId, amount, period, year, month } = req.body;

      if (!bucketId || amount === undefined || !period || !year) {
        return res.status(400).json({ error: 'bucketId, amount, period, and year are required' });
      }

      if (period !== 'monthly' && period !== 'yearly') {
        return res.status(400).json({ error: 'period must be either "monthly" or "yearly"' });
      }

      if (period === 'monthly' && !month) {
        return res.status(400).json({ error: 'month is required for monthly budgets' });
      }

      const { data, error } = await supabase
        .from('budgets')
        .update({
          bucketId,
          amount,
          period,
          year: parseInt(year),
          month: period === 'monthly' ? parseInt(month) : null,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Budget not found' });
        }
        throw error;
      }

      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete budget error:', error);
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
