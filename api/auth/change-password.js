import { getAuthenticatedClient } from '../../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[auth/change-password] POST request');

  try {
    const { newPassword } = req.body || {};

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { supabase: authenticatedClient, error } = await getAuthenticatedClient(req.headers);
    if (error || !authenticatedClient) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { error: updateError } = await authenticatedClient.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return res.status(400).json({ error: updateError.message || 'Failed to update password' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

