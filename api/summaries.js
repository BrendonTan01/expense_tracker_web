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
      // GET all summaries (both monthly and yearly)
      const { type, year, month } = req.query;
      
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
          // Insert new
          const { data, error } = await supabase
            .from('monthly_summaries')
            .insert([{
              id,
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
          // Insert new
          const { data, error } = await supabase
            .from('yearly_summaries')
            .insert([{
              id,
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

    // PUT and DELETE are handled by [id].js route
    if (req.method === 'PUT' || req.method === 'DELETE') {
      return res.status(405).json({ error: 'Use /api/summaries/[id] for PUT and DELETE operations' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
