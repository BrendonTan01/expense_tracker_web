import express from 'express';
import { getDatabase } from '../database.js';

const router = express.Router();
const db = getDatabase();

// GET all recurring transactions
router.get('/', (req, res) => {
  try {
    const recurring = db.prepare('SELECT * FROM recurring_transactions ORDER BY startDate DESC').all();
    res.json(recurring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET a single recurring transaction by ID
router.get('/:id', (req, res) => {
  try {
    const recurring = db.prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(req.params.id);
    if (!recurring) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }
    res.json(recurring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a new recurring transaction
router.post('/', (req, res) => {
  try {
    const { id, transaction, frequency, startDate, endDate, lastApplied } = req.body;
    
    if (!id || !transaction || !frequency || !startDate) {
      return res.status(400).json({ error: 'id, transaction, frequency, and startDate are required' });
    }
    
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency must be daily, weekly, monthly, or yearly' });
    }
    
    if (transaction.type !== 'expense' && transaction.type !== 'income') {
      return res.status(400).json({ error: 'transaction.type must be either "expense" or "income"' });
    }
    
    const stmt = db.prepare(`
      INSERT INTO recurring_transactions (id, type, amount, description, bucketId, frequency, startDate, endDate, lastApplied)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      transaction.type,
      transaction.amount,
      transaction.description,
      transaction.bucketId || null,
      frequency,
      startDate,
      endDate || null,
      lastApplied || null
    );
    
    const recurring = db.prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(id);
    res.status(201).json(recurring);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Recurring transaction with this ID already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT update a recurring transaction
router.put('/:id', (req, res) => {
  try {
    const { transaction, frequency, startDate, endDate, lastApplied } = req.body;
    
    if (!transaction || !frequency || !startDate) {
      return res.status(400).json({ error: 'transaction, frequency, and startDate are required' });
    }
    
    if (!['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)) {
      return res.status(400).json({ error: 'frequency must be daily, weekly, monthly, or yearly' });
    }
    
    if (transaction.type !== 'expense' && transaction.type !== 'income') {
      return res.status(400).json({ error: 'transaction.type must be either "expense" or "income"' });
    }
    
    const stmt = db.prepare(`
      UPDATE recurring_transactions 
      SET type = ?, amount = ?, description = ?, bucketId = ?, frequency = ?, startDate = ?, endDate = ?, lastApplied = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(
      transaction.type,
      transaction.amount,
      transaction.description,
      transaction.bucketId || null,
      frequency,
      startDate,
      endDate || null,
      lastApplied || null,
      req.params.id
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }
    
    const recurring = db.prepare('SELECT * FROM recurring_transactions WHERE id = ?').get(req.params.id);
    res.json(recurring);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a recurring transaction
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM recurring_transactions WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Recurring transaction not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
