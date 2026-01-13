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
      const { id, type, year, month } = req.query;
      
      // If id is provided, get a single summary by id (RLS will automatically filter by user_id)
      if (id) {
        // Try to find in monthly_summaries first
        const monthlyResult = await supabase
          .from('monthly_summaries')
          .select('*')
          .eq('id', id)
          .single();

        if (!monthlyResult.error) {
          return res.status(200).json(monthlyResult.data);
        }

        // If not found, try yearly_summaries
        const yearlyResult = await supabase
          .from('yearly_summaries')
          .select('*')
          .eq('id', id)
          .single();

        if (!yearlyResult.error) {
          return res.status(200).json(yearlyResult.data);
        }

        // If not found in either, return 404
        if (monthlyResult.error.code === 'PGRST116' && yearlyResult.error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Summary not found' });
        }

        throw monthlyResult.error || yearlyResult.error;
      }
      
      // GET all summaries (both monthly and yearly)
      if (type === 'monthly') {
        let query = supabase
          .from('monthly_summaries')
          .select('*');
        
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
      } else if (type === 'yearly') {
        let query = supabase
          .from('yearly_summaries')
          .select('*');
        
        if (year) {
          query = query.eq('year', parseInt(year));
        }
        
        query = query.order('year', { ascending: false });
        
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json(data || []);
      } else {
        // Get both types
        const [monthlyResult, yearlyResult] = await Promise.all([
          supabase.from('monthly_summaries').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
          supabase.from('yearly_summaries').select('*').order('year', { ascending: false })
        ]);
        
        if (monthlyResult.error) throw monthlyResult.error;
        if (yearlyResult.error) throw yearlyResult.error;
        
        return res.status(200).json({
          monthly: monthlyResult.data || [],
          yearly: yearlyResult.data || []
        });
      }
    }

    if (req.method === 'POST') {
      // CREATE summary
      const { id, type, year, month, summary } = req.body;

      if (!id || !type || !year || summary === undefined) {
        return res.status(400).json({ error: 'id, type, year, and summary are required' });
      }

      if (type !== 'monthly' && type !== 'yearly') {
        return res.status(400).json({ error: 'type must be either "monthly" or "yearly"' });
      }

      if (type === 'monthly' && !month) {
        return res.status(400).json({ error: 'month is required for monthly summaries' });
      }

      if (type === 'monthly') {
        // Check if summary exists for this month/year
        const { data: existing } = await supabase
          .from('monthly_summaries')
          .select('id')
          .eq('year', parseInt(year))
          .eq('month', parseInt(month))
          .maybeSingle();

        if (existing) {
          // Update existing
          const { data, error } = await supabase
            .from('monthly_summaries')
            .update({ summary: summary || null })
            .eq('id', existing.id)
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json(data);
        } else {
          // Insert new - include user_id (RLS policy will verify it matches auth.uid())
          const { data, error } = await supabase
            .from('monthly_summaries')
            .insert([{
              id,
              user_id: user.id,
              year: parseInt(year),
              month: parseInt(month),
              summary: summary || null,
            }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({ error: 'Summary for this month already exists' });
            }
            throw error;
          }

          return res.status(201).json(data);
        }
      } else {
        // Check if summary exists for this year
        const { data: existing } = await supabase
          .from('yearly_summaries')
          .select('id')
          .eq('year', parseInt(year))
          .maybeSingle();

        if (existing) {
          // Update existing
          const { data, error } = await supabase
            .from('yearly_summaries')
            .update({ summary: summary || null })
            .eq('id', existing.id)
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json(data);
        } else {
          // Insert new - include user_id (RLS policy will verify it matches auth.uid())
          const { data, error } = await supabase
            .from('yearly_summaries')
            .insert([{
              id,
              user_id: user.id,
              year: parseInt(year),
              summary: summary || null,
            }])
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              return res.status(409).json({ error: 'Summary for this year already exists' });
            }
            throw error;
          }

          return res.status(201).json(data);
        }
      }
    }

    if (req.method === 'PUT') {
      const { id, summary, type } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      if (summary === undefined) {
        return res.status(400).json({ error: 'summary is required' });
      }

      // Determine which table to update based on type or try both
      if (type === 'monthly') {
        const { data, error } = await supabase
          .from('monthly_summaries')
          .update({ summary: summary || null })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Summary not found' });
          }
          throw error;
        }

        return res.status(200).json(data);
      } else if (type === 'yearly') {
        const { data, error } = await supabase
          .from('yearly_summaries')
          .update({ summary: summary || null })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Summary not found' });
          }
          throw error;
        }

        return res.status(200).json(data);
      } else {
        // Try both tables
        const monthlyResult = await supabase
          .from('monthly_summaries')
          .update({ summary: summary || null })
          .eq('id', id)
          .select()
          .single();

        if (!monthlyResult.error) {
          return res.status(200).json(monthlyResult.data);
        }

        const yearlyResult = await supabase
          .from('yearly_summaries')
          .update({ summary: summary || null })
          .eq('id', id)
          .select()
          .single();

        if (!yearlyResult.error) {
          return res.status(200).json(yearlyResult.data);
        }

        if (monthlyResult.error.code === 'PGRST116' && yearlyResult.error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Summary not found' });
        }

        throw monthlyResult.error || yearlyResult.error;
      }
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      // Try to delete from monthly_summaries first
      const monthlyResult = await supabase
        .from('monthly_summaries')
        .delete()
        .eq('id', id);

      if (!monthlyResult.error) {
        return res.status(204).send();
      }

      // If not found, try yearly_summaries
      const yearlyResult = await supabase
        .from('yearly_summaries')
        .delete()
        .eq('id', id);

      if (!yearlyResult.error) {
        return res.status(204).send();
      }

      // If error is "not found", return 204 anyway (idempotent delete)
      if (monthlyResult.error.code === 'PGRST116' && yearlyResult.error.code === 'PGRST116') {
        return res.status(204).send();
      }

      throw monthlyResult.error || yearlyResult.error;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
