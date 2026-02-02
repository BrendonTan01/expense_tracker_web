import express from 'express';
import { getDatabase } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const db = getDatabase();

// All routes require authentication
router.use(authenticateToken);

// PUT bulk update transactions for a recurringId (must belong to user)
// Supports updating all generated transactions, or only those from a cutoff date onwards.
router.put('/recurring/:recurringId', (req, res) => {
  try {
    const { recurringId } = req.params;
    const { transaction, fromDate } = req.body || {};

    if (!recurringId) {
      return res.status(400).json({ error: 'recurringId is required' });
    }

    if (!transaction || typeof transaction !== 'object') {
      return res.status(400).json({ error: 'transaction is required' });
    }

    if (!['expense', 'income', 'investment'].includes(transaction.type)) {
      return res.status(400).json({ error: 'transaction.type must be either "expense", "income", or "investment"' });
    }

    if (transaction.amount === undefined || transaction.amount === null || Number.isNaN(Number(transaction.amount))) {
      return res.status(400).json({ error: 'transaction.amount must be a number' });
    }

    if (typeof transaction.description !== 'string' || transaction.description.length === 0) {
      return res.status(400).json({ error: 'transaction.description must be a non-empty string' });
    }

    let cutoff = null;
    if (fromDate !== undefined && fromDate !== null) {
      cutoff = String(fromDate).split('T')[0];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
        return res.status(400).json({ error: 'fromDate must be an ISO date (YYYY-MM-DD)' });
      }
    }

    let updateSql = `
      UPDATE transactions
      SET type = ?, amount = ?, description = ?, bucketId = ?
      WHERE user_id = ? AND recurringId = ?
    `;
    const updateParams = [
      transaction.type,
      Number(transaction.amount),
      transaction.description,
      transaction.bucketId || null,
      req.userId,
      recurringId,
    ];

    if (cutoff) {
      updateSql += ' AND date >= ?';
      updateParams.push(cutoff);
    }

    db.prepare(updateSql).run(...updateParams);

    let selectSql = 'SELECT * FROM transactions WHERE user_id = ? AND recurringId = ?';
    const selectParams = [req.userId, recurringId];
    if (cutoff) {
      selectSql += ' AND date >= ?';
      selectParams.push(cutoff);
    }
    selectSql += ' ORDER BY date DESC, id DESC';

    const updatedRows = db.prepare(selectSql).all(...selectParams);
    const parsed = updatedRows.map((t) => ({
      ...t,
      tags: t.tags ? JSON.parse(t.tags) : null,
    }));

    return res.status(200).json({ updated: parsed.length, transactions: parsed });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

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
    
    if (!['expense', 'income', 'investment'].includes(type)) {
      return res.status(400).json({ error: 'type must be either "expense", "income", or "investment"' });
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
    
    if (!['expense', 'income', 'investment'].includes(type)) {
      return res.status(400).json({ error: 'type must be either "expense", "income", or "investment"' });
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
