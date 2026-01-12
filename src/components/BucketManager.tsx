import { useState } from 'react';
import { Bucket } from '../types';

interface BucketManagerProps {
  buckets: Bucket[];
  onAddBucket: (bucket: Bucket) => void;
  onUpdateBucket: (id: string, bucket: Partial<Bucket>) => void;
  onDeleteBucket: (id: string) => void;
}

const DEFAULT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#82E0AA'
];

export default function BucketManager({
  buckets,
  onAddBucket,
  onUpdateBucket,
  onDeleteBucket,
}: BucketManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [bucketName, setBucketName] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bucketName.trim()) return;

    if (editingId) {
      onUpdateBucket(editingId, { name: bucketName, color: selectedColor });
      setEditingId(null);
    } else {
      onAddBucket({
        id: Date.now().toString(),
        name: bucketName,
        color: selectedColor,
      });
    }

    setBucketName('');
    setSelectedColor(DEFAULT_COLORS[0]);
    setShowForm(false);
  };

  const handleEdit = (bucket: Bucket) => {
    setEditingId(bucket.id);
    setBucketName(bucket.name);
    setSelectedColor(bucket.color || DEFAULT_COLORS[0]);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setBucketName('');
    setSelectedColor(DEFAULT_COLORS[0]);
  };

  return (
    <div className="bucket-manager">
      <div className="bucket-manager-header">
        <h2>Spending Buckets</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            Add Bucket
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bucket-form">
          <input
            type="text"
            value={bucketName}
            onChange={(e) => setBucketName(e.target.value)}
            placeholder="Bucket name"
            className="input"
            autoFocus
          />
          <div className="color-picker">
            <label>Color:</label>
            <div className="color-options">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${selectedColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update' : 'Add'} Bucket
            </button>
            <button type="button" onClick={handleCancel} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bucket-list">
        {buckets.length === 0 ? (
          <p className="empty-state">No buckets yet. Create one to get started!</p>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.id} className="bucket-item">
              <div className="bucket-info">
                <span
                  className="bucket-color"
                  style={{ backgroundColor: bucket.color || DEFAULT_COLORS[0] }}
                />
                <span className="bucket-name">{bucket.name}</span>
              </div>
              <div className="bucket-actions">
                <button
                  onClick={() => handleEdit(bucket)}
                  className="btn btn-sm btn-secondary"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDeleteBucket(bucket.id)}
                  className="btn btn-sm btn-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}