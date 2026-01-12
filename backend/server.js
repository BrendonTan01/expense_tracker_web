import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDatabase } from './database.js';
import bucketRoutes from './routes/buckets.js';
import transactionRoutes from './routes/transactions.js';
import recurringRoutes from './routes/recurring.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const isDevelopment = process.env.NODE_ENV !== 'production';

// Middleware
// Configure CORS to allow requests from frontend
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

// Initialize database
initDatabase();

// API Routes (must come before static file serving)
app.use('/api/buckets', bucketRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/recurring', recurringRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Expense Tracker API is running' });
});

// Serve static files from the React app in production
if (!isDevelopment) {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  if (isDevelopment) {
    console.log('Development mode: Frontend should be served separately with "npm run dev"');
  } else {
    console.log('Production mode: Serving frontend from Express server');
    console.log(`Visit http://localhost:${PORT} to view the app`);
  }
});
