import express from 'express';
import { getDatabase } from '../database.js';

const router = express.Router();
const db = getDatabase();

// GET all budgets
router.get('/', (req, res) => {
  try {
    const { bucketId, period, year, month } = req.query;
    let query = 'SELECT * FROM budgets WHERE 1=1';
    const params = [];

    if (bucketId) {
      query += ' AND bucketId = ?';
      params.push(bucketId);
    }
    if (period) {
      query += ' AND period = ?';
      params.push(period);
    }
    if (year) {
      query += ' AND year = ?';
      params.push(parseInt(year));
    }
    if (month) {
      query += ' AND month = ?';
      params.push(parseInt(month));
    }

    query += ' ORDER BY year DESC, month DESC';

    const budgets = db.prepare(query).all(...params);
    res.json(budgets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET a single budget by ID
router.get('/:id', (req, res) => {
  try {
    const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.json(budget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a new budget
router.post('/', (req, res) => {
  try {
    const { id, bucketId, amount, period, year, month } = req.body;

    if (!id || !bucketId || amount === undefined || !period || !year) {
      return res.status(400).json({ error: 'id, bucketId, amount, period, and year are required' });
    }

    if (period !== 'monthly' && period !== 'yearly') {
      return res.status(400).json({ error: 'period must be either "monthly" or "yearly"' });
    }

    if (period === 'monthly' && !month) {
      return res.status(400).json({ error: 'month is required for monthly budgets' });
    }

    const stmt = db.prepare(`
      INSERT INTO budgets (id, bucketId, amount, period, year, month)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, bucketId, amount, period, parseInt(year), period === 'monthly' ? parseInt(month) : null);

    const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
    res.status(201).json(budget);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Budget with this ID already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT update a budget
router.put('/:id', (req, res) => {
  try {
    const { bucketId, amount, period, year, month } = req.body;

    if (!bucketId || amount === undefined || !period || !year) {
      return res.status(400).json({ error: 'bucketId, amount, period, and year are required' });
    }

    if (period !== 'monthly' && period !== 'yearly') {
      return res.status(400).json({ error: 'period must be either "monthly" or "yearly"' });
    }

    if (period === 'monthly' && !month) {
      return res.status(400).json({ error: 'month is required for monthly budgets' });
    }

    const stmt = db.prepare(`
      UPDATE budgets
      SET bucketId = ?, amount = ?, period = ?, year = ?, month = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      bucketId,
      amount,
      period,
      parseInt(year),
      period === 'monthly' ? parseInt(month) : null,
      req.params.id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
    res.json(budget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a budget
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM budgets WHERE id = ?');
    const result = stmt.run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Budget not found' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
