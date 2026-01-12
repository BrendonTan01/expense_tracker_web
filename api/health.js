export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'ok', 
      message: 'Expense Tracker API is running' 
    });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
