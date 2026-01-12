import { AppState, Bucket, Transaction, RecurringTransaction, Budget } from '../types';

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
  getAll: async (params?: { startDate?: string; endDate?: string; type?: string }): Promise<Transaction[]> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.type) queryParams.append('type', params.type);
    
    const url = `${API_BASE_URL}/transactions${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);
    const transactions = await handleResponse<any[]>(response);
    // Convert database format (isRecurring as 0/1) to app format (boolean)
    return transactions.map(t => ({
      ...t,
      isRecurring: Boolean(t.isRecurring),
      bucketId: t.bucketId || undefined,
      recurringId: t.recurringId || undefined,
      tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined,
      notes: t.notes || undefined,
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
      tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined,
      notes: t.notes || undefined,
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
      tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined,
      notes: t.notes || undefined,
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
const isValidRecurringTransaction = (r: RecurringTransaction | null): r is RecurringTransaction => {
  return r !== null;
};

export const recurringApi = {
  getAll: async (): Promise<RecurringTransaction[]> => {
    const response = await fetch(`${API_BASE_URL}/recurring`);
    const recurring = await handleResponse<any[]>(response);
    // API already returns data in app format, just validate and ensure types are correct
    const mapped: (RecurringTransaction | null)[] = (recurring || []).map(r => {
      // Validate required fields - data is already in app format with nested transaction
      if (!r || !r.id || !r.startDate || !r.frequency || !r.transaction) {
        console.warn('Invalid recurring transaction data:', r);
        return null;
      }
      
      return {
        id: String(r.id),
        transaction: {
          type: r.transaction.type || 'expense',
          amount: Number(r.transaction.amount) || 0,
          description: String(r.transaction.description || ''),
          bucketId: r.transaction.bucketId || undefined,
        },
        frequency: r.frequency,
        startDate: String(r.startDate),
        endDate: r.endDate ? String(r.endDate) : undefined,
        lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
      };
    });
    return mapped.filter(isValidRecurringTransaction);
  },
  
  getById: async (id: string): Promise<RecurringTransaction> => {
    const response = await fetch(`${API_BASE_URL}/recurring/${id}`);
    const r = await handleResponse<any>(response);
    // API already returns data in app format with nested transaction
    return {
      id: String(r.id),
      transaction: {
        type: r.transaction?.type || r.type || 'expense',
        amount: Number(r.transaction?.amount || r.amount || 0),
        description: String(r.transaction?.description || r.description || ''),
        bucketId: r.transaction?.bucketId || r.bucketId || undefined,
      },
      frequency: r.frequency,
      startDate: String(r.startDate),
      endDate: r.endDate ? String(r.endDate) : undefined,
      lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
    };
  },
  
  create: async (recurring: RecurringTransaction): Promise<RecurringTransaction> => {
    const response = await fetch(`${API_BASE_URL}/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recurring),
    });
    const r = await handleResponse<any>(response);
    // API already returns data in app format with nested transaction
    return {
      id: String(r.id),
      transaction: {
        type: r.transaction?.type || 'expense',
        amount: Number(r.transaction?.amount || 0),
        description: String(r.transaction?.description || ''),
        bucketId: r.transaction?.bucketId || undefined,
      },
      frequency: r.frequency,
      startDate: String(r.startDate),
      endDate: r.endDate ? String(r.endDate) : undefined,
      lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
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
    // API already returns data in app format with nested transaction
    return {
      id: String(r.id),
      transaction: {
        type: r.transaction?.type || r.type || 'expense',
        amount: Number(r.transaction?.amount || r.amount || 0),
        description: String(r.transaction?.description || r.description || ''),
        bucketId: r.transaction?.bucketId || r.bucketId || undefined,
      },
      frequency: r.frequency,
      startDate: String(r.startDate),
      endDate: r.endDate ? String(r.endDate) : undefined,
      lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
    };
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/recurring/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  },
};

// Budgets API
export const budgetsApi = {
  getAll: async (params?: { bucketId?: string; period?: string; year?: number; month?: number }): Promise<Budget[]> => {
    const queryParams = new URLSearchParams();
    if (params?.bucketId) queryParams.append('bucketId', params.bucketId);
    if (params?.period) queryParams.append('period', params.period);
    if (params?.year) queryParams.append('year', params.year.toString());
    if (params?.month) queryParams.append('month', params.month.toString());
    
    const url = `${API_BASE_URL}/budgets${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetch(url);
    return handleResponse<Budget[]>(response);
  },
  
  getById: async (id: string): Promise<Budget> => {
    const response = await fetch(`${API_BASE_URL}/budgets/${id}`);
    return handleResponse<Budget>(response);
  },
  
  create: async (budget: Budget): Promise<Budget> => {
    const response = await fetch(`${API_BASE_URL}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budget),
    });
    return handleResponse<Budget>(response);
  },
  
  update: async (id: string, updates: Partial<Budget>): Promise<Budget> => {
    const response = await fetch(`${API_BASE_URL}/budgets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    return handleResponse<Budget>(response);
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/budgets/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  },
};

// App State API (for loading all data at once)
export const appStateApi = {
  load: async (): Promise<AppState> => {
    const [buckets, transactions, recurring, budgets] = await Promise.all([
      bucketsApi.getAll(),
      transactionsApi.getAll(),
      recurringApi.getAll(),
      budgetsApi.getAll(),
    ]);
    
    // Convert database format to app format
    return {
      buckets,
      transactions,
      recurringTransactions: recurring,
      budgets,
    };
  },
};
