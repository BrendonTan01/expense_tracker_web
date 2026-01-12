import express from 'express';
import { getDatabase } from '../database.js';

const router = express.Router();
const db = getDatabase();

// GET all buckets
router.get('/', (req, res) => {
  try {
    const buckets = db.prepare('SELECT * FROM buckets ORDER BY name').all();
    res.json(buckets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET a single bucket by ID
router.get('/:id', (req, res) => {
  try {
    const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(req.params.id);
    if (!bucket) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    res.json(bucket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create a new bucket
router.post('/', (req, res) => {
  try {
    const { id, name, color } = req.body;
    
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }
    
    const stmt = db.prepare('INSERT INTO buckets (id, name, color) VALUES (?, ?, ?)');
    stmt.run(id, name, color || null);
    
    const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(id);
    res.status(201).json(bucket);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Bucket with this ID already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT update a bucket
router.put('/:id', (req, res) => {
  try {
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const stmt = db.prepare('UPDATE buckets SET name = ?, color = ? WHERE id = ?');
    const result = stmt.run(name, color || null, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    
    const bucket = db.prepare('SELECT * FROM buckets WHERE id = ?').get(req.params.id);
    res.json(bucket);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a bucket
router.delete('/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM buckets WHERE id = ?');
    const result = stmt.run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bucket not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
