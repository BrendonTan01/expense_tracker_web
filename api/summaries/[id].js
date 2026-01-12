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
  
  console.log(`[summaries/[id]] ${req.method} request for id: ${id}`);

  try {
    if (req.method === 'GET') {
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

    if (req.method === 'PUT') {
      const { summary, type, year, month } = req.body;

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
