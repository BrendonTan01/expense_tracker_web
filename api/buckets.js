import { getAuthenticatedClient } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`[buckets] ${req.method} request to ${req.url}`);

  try {
    // Get authenticated Supabase client
    const { supabase, user, error: authError } = await getAuthenticatedClient(req.headers);
    
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    const { id } = req.query || {};

    // If id is present, treat this as a single-resource operation
    if (id) {
      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('buckets')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Bucket not found' });
          }
          throw error;
        }

        return res.status(200).json(data);
      }

      if (req.method === 'PUT') {
        const { name, color } = req.body || {};

        if (!name) {
          return res.status(400).json({ error: 'name is required' });
        }

        const { data, error } = await supabase
          .from('buckets')
          .update({ name, color: color || null })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Bucket not found' });
          }
          throw error;
        }

        return res.status(200).json(data);
      }

      if (req.method === 'DELETE') {
        const { error } = await supabase
          .from('buckets')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Delete bucket error:', error);
          throw error;
        }

        return res.status(204).send();
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.method === 'GET') {
      // GET all buckets (RLS will automatically filter by user_id)
      const { data, error } = await supabase
        .from('buckets')
        .select('*')
        .order('name');

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      // CREATE bucket
      const { id: bucketId, name, color } = req.body;

      if (!bucketId || !name) {
        return res.status(400).json({ error: 'id and name are required' });
      }

      // Include user_id in the insert - RLS policy will verify it matches auth.uid()
      const { data, error } = await supabase
        .from('buckets')
        .insert([{ 
          id: bucketId, 
          name, 
          color: color || null,
          user_id: user.id 
        }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Bucket with this ID already exists' });
        }
        throw error;
      }

      return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
