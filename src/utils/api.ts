import { AppState, Bucket, Transaction, RecurringTransaction } from '../types';

// Use relative URLs for API calls (works with Vercel serverless functions)
const API_BASE_URL = '/api';

// Helper function to handle API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

// Buckets API
export const bucketsApi = {
  getAll: async (): Promise<Bucket[]> => {
    const response = await fetch(`${API_BASE_URL}/buckets`);
    return handleResponse<Bucket[]>(response);
  },
  
  getById: async (id: string): Promise<Bucket> => {
    const response = await fetch(`${API_BASE_URL}/buckets/${id}`);
    return handleResponse<Bucket>(response);
  },
  
  create: async (bucket: Bucket): Promise<Bucket> => {
    const response = await fetch(`${API_BASE_URL}/buckets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bucket),
    });
    return handleResponse<Bucket>(response);
  },
  
  update: async (id: string, updates: Partial<Bucket>): Promise<Bucket> => {
    const response = await fetch(`${API_BASE_URL}/buckets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<Bucket>(response);
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/buckets/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  },
};

// Transactions API
export const transactionsApi = {
  getAll: async (): Promise<Transaction[]> => {
    const response = await fetch(`${API_BASE_URL}/transactions`);
    const transactions = await handleResponse<any[]>(response);
    // Convert database format (isRecurring as 0/1) to app format (boolean)
    return transactions.map(t => ({
      ...t,
      isRecurring: Boolean(t.isRecurring),
      bucketId: t.bucketId || undefined,
      recurringId: t.recurringId || undefined,
    }));
  },
  
  getById: async (id: string): Promise<Transaction> => {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}`);
    const t = await handleResponse<any>(response);
    return {
      ...t,
      isRecurring: Boolean(t.isRecurring),
      bucketId: t.bucketId || undefined,
      recurringId: t.recurringId || undefined,
    };
  },
  
  create: async (transaction: Omit<Transaction, 'id'> & { id?: string }): Promise<Transaction> => {
    const response = await fetch(`${API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    });
    const t = await handleResponse<any>(response);
    return {
      ...t,
      isRecurring: Boolean(t.isRecurring),
      bucketId: t.bucketId || undefined,
      recurringId: t.recurringId || undefined,
    };
  },
  
  update: async (id: string, updates: Partial<Transaction>): Promise<Transaction> => {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const t = await handleResponse<any>(response);
    return {
      ...t,
      isRecurring: Boolean(t.isRecurring),
      bucketId: t.bucketId || undefined,
      recurringId: t.recurringId || undefined,
    };
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  },
};

// Recurring Transactions API
export const recurringApi = {
  getAll: async (): Promise<RecurringTransaction[]> => {
    const response = await fetch(`${API_BASE_URL}/recurring`);
    const recurring = await handleResponse<any[]>(response);
    // Transform database format to app format
    return recurring.map(r => ({
      id: r.id,
      transaction: {
        type: r.type,
        amount: r.amount,
        description: r.description,
        bucketId: r.bucketId || undefined,
      },
      frequency: r.frequency,
      startDate: r.startDate,
      endDate: r.endDate || undefined,
      lastApplied: r.lastApplied || undefined,
    }));
  },
  
  getById: async (id: string): Promise<RecurringTransaction> => {
    const response = await fetch(`${API_BASE_URL}/recurring/${id}`);
    const r = await handleResponse<any>(response);
    return {
      id: r.id,
      transaction: {
        type: r.type,
        amount: r.amount,
        description: r.description,
        bucketId: r.bucketId || undefined,
      },
      frequency: r.frequency,
      startDate: r.startDate,
      endDate: r.endDate || undefined,
      lastApplied: r.lastApplied || undefined,
    };
  },
  
  create: async (recurring: RecurringTransaction): Promise<RecurringTransaction> => {
    const response = await fetch(`${API_BASE_URL}/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recurring),
    });
    const r = await handleResponse<any>(response);
    return {
      id: r.id,
      transaction: {
        type: r.type,
        amount: r.amount,
        description: r.description,
        bucketId: r.bucketId || undefined,
      },
      frequency: r.frequency,
      startDate: r.startDate,
      endDate: r.endDate || undefined,
      lastApplied: r.lastApplied || undefined,
    };
  },
  
  update: async (id: string, updates: Partial<RecurringTransaction>): Promise<RecurringTransaction> => {
    // If updating transaction fields, we need to merge them properly
    const payload: any = { ...updates };
    if (updates.transaction) {
      payload.transaction = updates.transaction;
    }
    
    const response = await fetch(`${API_BASE_URL}/recurring/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const r = await handleResponse<any>(response);
    return {
      id: r.id,
      transaction: {
        type: r.type,
        amount: r.amount,
        description: r.description,
        bucketId: r.bucketId || undefined,
      },
      frequency: r.frequency,
      startDate: r.startDate,
      endDate: r.endDate || undefined,
      lastApplied: r.lastApplied || undefined,
    };
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/recurring/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  },
};

// App State API (for loading all data at once)
export const appStateApi = {
  load: async (): Promise<AppState> => {
    const [buckets, transactions, recurring] = await Promise.all([
      bucketsApi.getAll(),
      transactionsApi.getAll(),
      recurringApi.getAll(),
    ]);
    
    // Convert database format to app format
    return {
      buckets,
      transactions,
      recurringTransactions: recurring,
    };
  },
};
