import express from 'express';
import { getDatabase } from '../database.js';

const router = express.Router();
const db = getDatabase();

// GET all transactions
router.get('/', (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];
    
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

// GET a single transaction by ID
router.get('/:id', (req, res) => {
  try {
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
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
      INSERT INTO transactions (id, type, amount, description, bucketId, date, isRecurring, recurringId, tags, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
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

// PUT update a transaction
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
      WHERE id = ?
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
      req.params.id
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

// DELETE a transaction
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
