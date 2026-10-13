import { isDate, isValidAmount, MONEY_ERROR, checkOwnedReferences } from '../../lib/validation.js';
import { getAuthenticatedClient } from '../../lib/supabase.js';
import { recurringUpdatesError, validRequestId, financialErrorResponse } from '../../lib/financial.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  
  console.log(`[recurring/[id]] ${req.method} request for id: ${id}`);

  try {
    // Get authenticated Supabase client
    const { supabase, user, error: authError } = await getAuthenticatedClient(req.headers);
    
    if (authError) {
      return res.status(401).json({ error: authError });
    }

    if (req.method === 'PUT' && req.query?.action === 'edit') {
      const { updates, historyScope, today, requestId } = req.body || {};
      const invalid = recurringUpdatesError(updates);
      if (!validRequestId(id) || !validRequestId(requestId) || !['none', 'all', 'fromNext'].includes(historyScope) || !isDate(today) || invalid) {
        return res.status(400).json({ error: invalid || 'Invalid recurring edit request' });
      }
      const { data, error } = await supabase.rpc('edit_recurring_transaction', {
        p_id: id, p_updates: updates, p_history_scope: historyScope, p_today: today, p_request_id: requestId,
      });
      if (error) return financialErrorResponse(res, error);
      if (!data || !Object.prototype.hasOwnProperty.call(data, 'recurring')) return res.status(503).json({ error: 'Invalid financial database response' });
      return res.status(200).json(data);
    }

    if (req.method === 'GET') {
      // GET single recurring transaction (RLS will automatically filter by user_id)
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
      // Allow partial updates (e.g. advancing lastApplied) so the client can
      // persist schedule progress without resending the whole recurring object.
      const body = req.body || {};
      const { transaction, frequency, startDate, endDate, lastApplied } = body;

      if ((startDate !== undefined && !isDate(startDate)) || (endDate && !isDate(endDate)) || (lastApplied && !isDate(lastApplied))) return res.status(400).json({ error: 'Invalid recurring dates' });
      const updateData = {};

      if (transaction !== undefined) {
        if (!transaction || typeof transaction !== 'object') {
          return res.status(400).json({ error: 'transaction must be an object when provided' });
        }
        if (!['expense', 'income', 'investment'].includes(transaction.type)) {
          return res.status(400).json({ error: 'transaction.type must be either "expense", "income", or "investment"' });
        }
        if (!isValidAmount(transaction.amount)) return res.status(400).json({ error: MONEY_ERROR });
        const referenceError = await checkOwnedReferences(supabase, user.id, transaction);
        if (referenceError) return res.status(400).json({ error: referenceError });
        updateData.type = transaction.type;
        updateData.amount = transaction.amount;
        updateData.description = transaction.description;
        updateData.bucketId = transaction.bucketId || null;
      }

      if (frequency !== undefined) {
        if (!['daily', 'weekly', 'fortnightly', 'monthly', 'yearly'].includes(frequency)) {
          return res.status(400).json({ error: 'frequency must be daily, weekly, fortnightly, monthly, or yearly' });
        }
        updateData.frequency = frequency;
      }

      if (startDate !== undefined) {
        if (!startDate) {
          return res.status(400).json({ error: 'startDate cannot be empty when provided' });
        }
        updateData.startDate = startDate;
      }

      // Only update nullable fields if the key is present in the request body.
      if (Object.prototype.hasOwnProperty.call(body, 'endDate')) {
        updateData.endDate = endDate || null;
      }
      if (Object.prototype.hasOwnProperty.call(body, 'lastApplied')) {
        updateData.lastApplied = lastApplied || null;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
      }

      const { data, error } = await supabase
        .from('recurring_transactions')
        .update(updateData)
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
      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { error } = await supabase
        .from('recurring_transactions')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete recurring transaction error:', error);
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
