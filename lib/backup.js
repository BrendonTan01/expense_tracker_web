import { getAuthenticatedClient } from './supabase.js';
import { rpcErrorResponse } from './reliability.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { supabase, user, error: authError } = await getAuthenticatedClient(req.headers);
    if (authError) return res.status(401).json({ error: authError });
    if (req.method === 'GET') {
      const { data, error } = await supabase.rpc('export_user_backup');
      if (error) return rpcErrorResponse(res, error);
      return res.status(200).json({ version: '2.0.0', exportDate: new Date().toISOString(), data });
    }
    const backup = req.body;
    if (backup?.expectedUserId !== user.id) return res.status(409).json({ error: 'Your account changed. Reopen the backup screen before restoring.' });
    if (!backup || typeof backup.requestId !== 'string' || !backup.requestId || backup.requestId.length > 200 || !['1.0.0', '2.0.0'].includes(backup.version) || !backup.data ||
        !['buckets', 'transactions', 'recurringTransactions', 'budgets'].every(key => Array.isArray(backup.data[key])) ||
        (backup.version === '2.0.0' && !['monthlySummaries', 'yearlySummaries'].every(key => Array.isArray(backup.data[key])))) {
      return res.status(400).json({ error: 'Invalid or unsupported backup file.' });
    }
    const { data, error } = await supabase.rpc('restore_user_backup', { p_data: backup.data, p_request_id: backup.requestId });
    if (error) return rpcErrorResponse(res, error);
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Could not complete the backup operation. Check your data before retrying.' });
  }
}
