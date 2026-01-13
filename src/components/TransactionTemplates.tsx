import { useState, useEffect } from 'react';
import { TransactionTemplate, Bucket } from '../types';
import { saveToLocalStorage, loadFromLocalStorage, generateId } from '../utils/storage';

interface TransactionTemplatesProps {
  buckets: Bucket[];
  onUseTemplate: (template: TransactionTemplate) => void;
}

const STORAGE_KEY = 'transaction_templates';

export default function TransactionTemplates({ buckets, onUseTemplate }: TransactionTemplatesProps) {
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TransactionTemplate | null>(null);
  
  const [formData, setFormData] = useState<Omit<TransactionTemplate, 'id'>>({
    name: '',
    type: 'expense',
    amount: undefined,
    description: '',
    bucketId: '',
    tags: [],
    notes: '',
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    const saved = loadFromLocalStorage<TransactionTemplate[]>(STORAGE_KEY, []);
    setTemplates(saved);
  }, []);

  const saveTemplates = (newTemplates: TransactionTemplate[]) => {
    setTemplates(newTemplates);
    saveToLocalStorage(STORAGE_KEY, newTemplates);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.description) return;

    const template: TransactionTemplate = {
      id: editingTemplate?.id || generateId(),
      ...formData,
      bucketId: formData.type === 'expense' && formData.bucketId ? formData.bucketId : undefined,
    };

    if (editingTemplate) {
      saveTemplates(templates.map(t => t.id === editingTemplate.id ? template : t));
    } else {
      saveTemplates([...templates, template]);
    }

    setFormData({
      name: '',
      type: 'expense',
      amount: undefined,
      description: '',
      bucketId: '',
      tags: [],
      notes: '',
    });
    setTagInput('');
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this template?')) {
      saveTemplates(templates.filter(t => t.id !== id));
    }
  };

  const handleEdit = (template: TransactionTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      type: template.type,
      amount: template.amount,
      description: template.description,
      bucketId: template.bucketId || '',
      tags: template.tags || [],
      notes: template.notes || '',
    });
    setShowForm(true);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput('');
    }
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3>Transaction Templates</h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) {
              setEditingTemplate(null);
              setFormData({
                name: '',
                type: 'expense',
                amount: undefined,
                description: '',
                bucketId: '',
                tags: [],
                notes: '',
              });
            }
          }}
          className="btn btn-secondary btn-sm"
        >
          {showForm ? 'Cancel' : '+ New Template'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          padding: '16px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid var(--border-color)'
        }}>
          <div className="form-group">
            <label>Template Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
              placeholder="e.g., Grocery Shopping"
            />
          </div>

          <div className="form-group">
            <label>Type</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  value="expense"
                  checked={formData.type === 'expense'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'expense' | 'income', bucketId: '' })}
                />
                Expense
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="income"
                  checked={formData.type === 'income'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'expense' | 'income', bucketId: '' })}
                />
                Income
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>Description *</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              required
            />
          </div>

          <div className="form-group">
            <label>Amount (optional)</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value ? parseFloat(e.target.value) : undefined })}
              className="input"
            />
          </div>

          {formData.type === 'expense' && (
            <div className="form-group">
              <label>Bucket (optional)</label>
              <select
                value={formData.bucketId}
                onChange={(e) => setFormData({ ...formData, bucketId: e.target.value })}
                className="input"
              >
                <option value="">None</option>
                {buckets.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Tags</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {formData.tags?.map((tag, idx) => (
                <span key={idx} className="tag" style={{
                  backgroundColor: 'var(--light-bg)',
                  color: 'var(--text-color)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  border: '1px solid var(--border-color)',
                }}>
                  {tag}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tags: formData.tags?.filter((_, i) => i !== idx) })}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                className="input"
                placeholder="Add tag"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={handleAddTag} className="btn btn-secondary btn-sm">
                Add
              </button>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingTemplate ? 'Update' : 'Create'} Template
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingTemplate(null);
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 && !showForm ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
          No templates yet. Create one to quickly add common transactions.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {templates.map(template => (
            <div
              key={template.id}
              style={{
                padding: '12px',
                background: 'var(--light-bg)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 500 }}>{template.name}</div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                  {template.description}
                  {template.amount && ` - $${template.amount.toFixed(2)}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => onUseTemplate(template)}
                  className="btn btn-primary btn-sm"
                  title="Use this template"
                >
                  Use
                </button>
                <button
                  onClick={() => handleEdit(template)}
                  className="btn btn-secondary btn-sm"
                  title="Edit template"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="btn btn-danger btn-sm"
                  title="Delete template"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
