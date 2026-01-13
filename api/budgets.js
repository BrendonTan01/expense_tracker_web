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
      // GET all budgets (RLS will automatically filter by user_id)
      const { bucketId, period, year, month } = req.query;
      let query = supabase
        .from('budgets')
        .select('*');

      if (bucketId) {
        query = query.eq('bucketId', bucketId);
      }
      if (period) {
        query = query.eq('period', period);
      }
      if (year) {
        query = query.eq('year', parseInt(year));
      }
      if (month) {
        query = query.eq('month', parseInt(month));
      }

      query = query.order('year', { ascending: false })
        .order('month', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      // CREATE budget
      const { id: budgetId, bucketId, amount, period, year, month } = req.body;

      if (!budgetId || !bucketId || amount === undefined || !period || !year) {
        return res.status(400).json({ error: 'id, bucketId, amount, period, and year are required' });
      }

      if (period !== 'monthly' && period !== 'yearly') {
        return res.status(400).json({ error: 'period must be either "monthly" or "yearly"' });
      }

      if (period === 'monthly' && !month) {
        return res.status(400).json({ error: 'month is required for monthly budgets' });
      }

      // Include user_id in the insert - RLS policy will verify it matches auth.uid()
      const { data, error } = await supabase
        .from('budgets')
        .insert([{
          id: budgetId,
          user_id: user.id,
          bucketId,
          amount,
          period,
          year: parseInt(year),
          month: period === 'monthly' ? parseInt(month) : null,
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Budget with this ID already exists' });
        }
        throw error;
      }

      return res.status(201).json(data);
    }

    // PUT and DELETE are handled by [id].js route
    if (req.method === 'PUT' || req.method === 'DELETE') {
      return res.status(405).json({ error: 'Use /api/budgets/[id] for PUT and DELETE operations' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
