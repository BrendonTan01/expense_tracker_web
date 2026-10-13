import { checkOwnedReferences } from '../lib/validation.js';
import { budgetError, validRequestId, financialErrorResponse } from '../lib/financial.js';
import { getAuthenticatedClient } from '../lib/supabase.js';
export default async function handler(req,res) {
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
 if(req.method==='OPTIONS') return res.status(200).end();
 try {
  const {supabase,user,error:authError}=await getAuthenticatedClient(req.headers);
  if(authError) return res.status(401).json({error:authError});
  const {id,action}=req.query||{};
  if(req.method==='GET' && action==='capabilities') {
   res.setHeader('Cache-Control','no-store');
   const {data,error}=await supabase.rpc('financial_batch2_capabilities');
   if(error && !['PGRST202','42883'].includes(error.code)) return financialErrorResponse(res,error);
   return res.status(200).json(error||!data ? {budgetBatch:false,recurringEdit:false,recurringHistoryJump:false} : data);
  }
  if(req.method==='POST' && action==='batch') {
   const {budgets,requestId}=req.body||{};
   if(!validRequestId(requestId)||!Array.isArray(budgets)||budgets.length<1||budgets.length>12) return res.status(400).json({error:'Expected 1-12 budgets and a requestId'});
   for(const budget of budgets) { const invalid=budgetError(budget); if(invalid) return res.status(400).json({error:invalid}); }
   const {data,error}=await supabase.rpc('create_budget_batch',{p_budgets:budgets,p_request_id:requestId});
   if(error) return financialErrorResponse(res,error);
   if(!data || !Array.isArray(data.budgets)) return res.status(503).json({error:'Invalid financial database response'});
   return res.status(200).json(data);
  }
  if(id) {
   if(req.method==='GET') {
    const {data,error}=await supabase.from('budgets').select('*').eq('id',id).eq('user_id',user.id).single();
    if(error) return financialErrorResponse(res,error); return res.status(200).json(data);
   }
   if(req.method==='PUT') {
    const patch=req.body||{};
    // Validate supplied invalid money before querying; legacy amount-only patches
    // merge with the owned row rather than forcing an installed-client upgrade.
    if(patch.amount!==undefined) {
     const invalid=budgetError({id,bucketId:'placeholder',period:'yearly',year:2026,amount:patch.amount});
     if(invalid) return res.status(400).json({error:invalid});
    }
    if(!Object.keys(patch).length || Object.keys(patch).some(k=>!['id','bucketId','amount','period','year','month'].includes(k)) || (patch.id!==undefined && patch.id!==id)) return res.status(400).json({error:'Invalid budget updates'});
    const {data:current,error:readError}=await supabase.from('budgets').select('*').eq('id',id).eq('user_id',user.id).single();
    if(readError) return financialErrorResponse(res,readError);
    const budget={...current,...patch}; delete budget.user_id;
    const invalid=budgetError(budget); if(invalid) return res.status(400).json({error:invalid});
    const referenceError=await checkOwnedReferences(supabase,user.id,budget); if(referenceError) return res.status(400).json({error:referenceError});
    // Write only supplied fields: concurrent amount-only edits must not restore
    // stale period/bucket values read while validating the patch.
    const update=Object.fromEntries(Object.entries(patch).filter(([key])=>key!=='id'));
    const {data,error}=await supabase.from('budgets').update(update).eq('id',id).eq('user_id',user.id).select().single();
    if(error) return financialErrorResponse(res,error); return res.status(200).json(data);
   }
   if(req.method==='DELETE') {
    const {error}=await supabase.from('budgets').delete().eq('id',id).eq('user_id',user.id);
    if(error) return financialErrorResponse(res,error); return res.status(204).send();
   }
   return res.status(405).json({error:'Method not allowed'});
  }
  if(req.method==='GET') {
   const {bucketId,period,year,month}=req.query||{}; let query=supabase.from('budgets').select('*').eq('user_id',user.id);
   if(bucketId) query=query.eq('bucketId',bucketId);
   if(period) query=query.eq('period',period);
   for(const [key,value,max] of [['year',year,9999],['month',month,12]]) {
    if(value!==undefined) { if(typeof value!=='string'||!/^\d+$/.test(value)||Number(value)<1||Number(value)>max) return res.status(400).json({error:'Invalid budget filter'}); query=query.eq(key,Number(value)); }
   }
   const {data,error}=await query.order('year',{ascending:false}).order('month',{ascending:false});
   if(error) return financialErrorResponse(res,error); return res.status(200).json(data||[]);
  }
  if(req.method==='POST') {
   const budget=req.body; const invalid=budgetError(budget); if(invalid) return res.status(400).json({error:invalid});
   const referenceError=await checkOwnedReferences(supabase,user.id,budget); if(referenceError) return res.status(400).json({error:referenceError});
   const {data,error}=await supabase.from('budgets').insert([{id:budget.id,user_id:user.id,bucketId:budget.bucketId,amount:budget.amount,period:budget.period,year:budget.year,month:budget.month??null}]).select().single();
   if(error) return financialErrorResponse(res,error); return res.status(201).json(data);
  }
  return res.status(405).json({error:'Method not allowed'});
 } catch(error) { return financialErrorResponse(res,error); }
}
