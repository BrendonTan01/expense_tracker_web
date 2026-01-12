import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`[buckets] ${req.method} request to ${req.url}`);

  try {
    if (req.method === 'GET') {
      // GET all buckets
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

      const { data, error } = await supabase
        .from('buckets')
        .insert([{ id: bucketId, name, color: color || null }])
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

    // PUT and DELETE are handled by [id].js route
    if (req.method === 'PUT' || req.method === 'DELETE') {
      return res.status(405).json({ error: 'Use /api/buckets/[id] for PUT and DELETE operations' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
