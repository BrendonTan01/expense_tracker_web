import express from 'express';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const db = getDatabase();

// All routes require authentication
router.use(authenticateToken);

// GET all transactions for the authenticated user
router.get('/', (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params = [req.userId];
    
    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
    }
    
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY date DESC, id DESC';
    
    const transactions = db.prepare(query).all(...params);
    // Parse tags from JSON string
    const parsedTransactions = transactions.map(t => ({
      ...t,
      tags: t.tags ? JSON.parse(t.tags) : null,
    }));
    res.json(parsedTransactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET a single transaction by ID (must belong to user)
router.get('/:id', (req, res) => {
  try {
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    // Parse tags from JSON string
    const parsedTransaction = {
      ...transaction,
      tags: transaction.tags ? JSON.parse(transaction.tags) : null,
    };
    res.json(parsedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a new transaction
router.post('/', (req, res) => {
  try {
    const { id, type, amount, description, bucketId, date, isRecurring, recurringId, tags, notes } = req.body;
    
    if (!id || !type || amount === undefined || !description || !date) {
      return res.status(400).json({ error: 'id, type, amount, description, and date are required' });
    }
    
    if (type !== 'expense' && type !== 'income') {
      return res.status(400).json({ error: 'type must be either "expense" or "income"' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO transactions (id, user_id, type, amount, description, bucketId, date, isRecurring, recurringId, tags, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      req.userId,
      type,
      amount,
      description,
      bucketId || null,
      date,
      isRecurring ? 1 : 0,
      recurringId || null,
      tags && tags.length > 0 ? JSON.stringify(tags) : null,
      notes || null
    );
    
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    const parsedTransaction = {
      ...transaction,
      tags: transaction.tags ? JSON.parse(transaction.tags) : null,
    };
    res.status(201).json(parsedTransaction);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Transaction with this ID already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT update a transaction (must belong to user)
router.put('/:id', (req, res) => {
  try {
    const { type, amount, description, bucketId, date, isRecurring, recurringId, tags, notes } = req.body;
    
    if (!type || amount === undefined || !description || !date) {
      return res.status(400).json({ error: 'type, amount, description, and date are required' });
    }
    
    if (type !== 'expense' && type !== 'income') {
      return res.status(400).json({ error: 'type must be either "expense" or "income"' });
    }
    
    const stmt = db.prepare(`
      UPDATE transactions 
      SET type = ?, amount = ?, description = ?, bucketId = ?, date = ?, isRecurring = ?, recurringId = ?, tags = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `);
    
    const result = stmt.run(
      type,
      amount,
      description,
      bucketId || null,
      date,
      isRecurring ? 1 : 0,
      recurringId || null,
      tags && tags.length > 0 ? JSON.stringify(tags) : null,
      notes || null,
      req.params.id,
      req.userId
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    const parsedTransaction = {
      ...transaction,
      tags: transaction.tags ? JSON.parse(transaction.tags) : null,
    };
    res.json(parsedTransaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a transaction (must belong to user)
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
