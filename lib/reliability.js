// Missing migration must fail closed; never fall back to destructive client writes.
export function rpcErrorResponse(res, error) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return res.status(503).json({ error: 'This operation requires the database reliability update. No changes were made.' });
  }
  if (['P0001', '22023', '23514', '23503', '23505', '22P02', '22007', '22008'].includes(error.code)) {
    return res.status(400).json({ error: 'The data contains invalid values, duplicate records, or missing linked records. No changes were made.' });
  }
  console.error('Reliability operation failed:', error.code);
  return res.status(500).json({ error: 'Could not confirm completion. Check your data before retrying.' });
}
