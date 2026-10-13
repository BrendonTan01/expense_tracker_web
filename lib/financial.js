import { isDate, isValidAmount, MONEY_ERROR } from './validation.js';
export const validRequestId = value => typeof value === 'string' && value.length >= 1 && value.length <= 200;
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export function budgetError(budget, requireId = true) {
 if (!budget || typeof budget !== 'object' || Array.isArray(budget)) return 'Expected a budget object';
 if ((requireId && !validRequestId(budget.id)) || typeof budget.bucketId !== 'string' || !budget.bucketId || budget.user_id !== undefined) return 'A valid id and bucketId are required';
 if (!isValidAmount(budget.amount)) return MONEY_ERROR;
 if (!['monthly', 'yearly'].includes(budget.period) || !integer(budget.year, 1, 9999)) return 'Budget period and year (1-9999) must be valid';
 if (budget.period === 'monthly' && !integer(budget.month, 1, 12)) return 'Monthly budgets require a month from 1 to 12';
 if (budget.period === 'yearly' && budget.month != null) return 'Yearly budgets must have no month';
 return null;
}
export function recurringUpdatesError(updates) {
 if (!updates || typeof updates !== 'object' || Array.isArray(updates) || !Object.keys(updates).length || Object.keys(updates).some(k => !['transaction','frequency','startDate','endDate','lastApplied'].includes(k))) return 'Invalid recurring updates';
 if (updates.transaction !== undefined) {
  const tx=updates.transaction;
  if (!tx || typeof tx !== 'object' || Array.isArray(tx) || !['expense','income','investment'].includes(tx.type) || typeof tx.description !== 'string' || (tx.bucketId != null && typeof tx.bucketId !== 'string')) return 'Invalid transaction';
  if (!isValidAmount(tx.amount)) return MONEY_ERROR;
 }
 if (updates.frequency !== undefined && !['daily','weekly','fortnightly','monthly','yearly'].includes(updates.frequency)) return 'Invalid frequency';
 if (updates.startDate !== undefined && !isDate(updates.startDate)) return 'Invalid start date';
 for (const k of ['endDate','lastApplied']) if (updates[k] !== undefined && updates[k] !== null && !isDate(updates[k])) return 'Invalid recurring dates';
 if (updates.startDate && updates.endDate && updates.endDate < updates.startDate) return 'End date must not precede start date';
 return null;
}
export function financialErrorResponse(res,error) {
 if (['PGRST202','42883'].includes(error?.code)) return res.status(503).json({error:'This operation needs the Batch 2 database update. No fallback writes were attempted.'});
 if (error?.code==='P0002' || error?.code==='PGRST116') return res.status(404).json({error:'Record not found'});
 if (error?.code==='23505') return res.status(409).json({error:'This ID or budget period already exists, or this request ID was reused with different data.'});
 if (['22023','22007','22008','22P02','22003','23514','23502','23503'].includes(error?.code)) return res.status(400).json({error:'Invalid financial data, period or linked record. No changes were saved.'});
 return res.status(500).json({error:'Could not confirm whether the operation completed. Keep your input and retry the same request.'});
}
