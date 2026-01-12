import { AppState, Bucket, Transaction, RecurringTransaction, Budget, MonthlySummary, YearlySummary } from '../types';

// Use relative URLs for API calls (works with Vercel serverless functions)
const API_BASE_URL = '/api';

// Helper function to create a fetch with timeout
function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    ),
  ]);
}

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
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets`).catch((err) => {
      throw new Error(`Failed to fetch buckets: ${err.message}`);
    });
    return handleResponse<Bucket[]>(response);
  },
  
  getById: async (id: string): Promise<Bucket> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets/${id}`).catch((err) => {
      throw new Error(`Failed to fetch bucket: ${err.message}`);
    });
    return handleResponse<Bucket>(response);
  },
  
  create: async (bucket: Bucket): Promise<Bucket> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bucket),
    }).catch((err) => {
      throw new Error(`Failed to create bucket: ${err.message}`);
    });
    return handleResponse<Bucket>(response);
  },
  
  update: async (id: string, updates: Partial<Bucket>): Promise<Bucket> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch((err) => {
      throw new Error(`Failed to update bucket: ${err.message}`);
    });
    return handleResponse<Bucket>(response);
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets/${id}`, {
      method: 'DELETE',
    }).catch((err) => {
      throw new Error(`Failed to delete bucket: ${err.message}`);
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
    const response = await fetchWithTimeout(url).catch((err) => {
      throw new Error(`Failed to fetch transactions: ${err.message}`);
    });
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
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions/${id}`).catch((err) => {
      throw new Error(`Failed to fetch transaction: ${err.message}`);
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
  
  create: async (transaction: Omit<Transaction, 'id'> & { id?: string }): Promise<Transaction> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    }).catch((err) => {
      throw new Error(`Failed to create transaction: ${err.message}`);
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
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch((err) => {
      throw new Error(`Failed to update transaction: ${err.message}`);
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
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions/${id}`, {
      method: 'DELETE',
    }).catch((err) => {
      throw new Error(`Failed to delete transaction: ${err.message}`);
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
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring`).catch((err) => {
      throw new Error(`Failed to fetch recurring transactions: ${err.message}`);
    });
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
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring/${id}`).catch((err) => {
      throw new Error(`Failed to fetch recurring transaction: ${err.message}`);
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
  
  create: async (recurring: RecurringTransaction): Promise<RecurringTransaction> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recurring),
    }).catch((err) => {
      throw new Error(`Failed to create recurring transaction: ${err.message}`);
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
    
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      throw new Error(`Failed to update recurring transaction: ${err.message}`);
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
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring/${id}`, {
      method: 'DELETE',
    }).catch((err) => {
      throw new Error(`Failed to delete recurring transaction: ${err.message}`);
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
    const response = await fetchWithTimeout(url).catch((err) => {
      throw new Error(`Failed to fetch budgets: ${err.message}`);
    });
    return handleResponse<Budget[]>(response);
  },
  
  getById: async (id: string): Promise<Budget> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets/${id}`).catch((err) => {
      throw new Error(`Failed to fetch budget: ${err.message}`);
    });
    return handleResponse<Budget>(response);
  },
  
  create: async (budget: Budget): Promise<Budget> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budget),
    }).catch((err) => {
      throw new Error(`Failed to create budget: ${err.message}`);
    });
    return handleResponse<Budget>(response);
  },
  
  update: async (id: string, updates: Partial<Budget>): Promise<Budget> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch((err) => {
      throw new Error(`Failed to update budget: ${err.message}`);
    });
    return handleResponse<Budget>(response);
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets/${id}`, {
      method: 'DELETE',
    }).catch((err) => {
      throw new Error(`Failed to delete budget: ${err.message}`);
    });
    return handleResponse<void>(response);
  },
};

// Summaries API
export const summariesApi = {
  getAll: async (params?: { type?: 'monthly' | 'yearly'; year?: number; month?: number }): Promise<{ monthly: MonthlySummary[]; yearly: YearlySummary[] } | MonthlySummary[] | YearlySummary[]> => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.year) queryParams.append('year', params.year.toString());
    if (params?.month) queryParams.append('month', params.month.toString());
    
    const url = `${API_BASE_URL}/summaries${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const response = await fetchWithTimeout(url).catch((err) => {
      throw new Error(`Failed to fetch summaries: ${err.message}`);
    });
    return handleResponse<any>(response);
  },
  
  getMonthly: async (year?: number, month?: number): Promise<MonthlySummary[]> => {
    const queryParams = new URLSearchParams();
    queryParams.append('type', 'monthly');
    if (year) queryParams.append('year', year.toString());
    if (month) queryParams.append('month', month.toString());
    
    const url = `${API_BASE_URL}/summaries?${queryParams.toString()}`;
    const response = await fetchWithTimeout(url).catch((err) => {
      throw new Error(`Failed to fetch monthly summaries: ${err.message}`);
    });
    return handleResponse<MonthlySummary[]>(response);
  },
  
  getYearly: async (year?: number): Promise<YearlySummary[]> => {
    const queryParams = new URLSearchParams();
    queryParams.append('type', 'yearly');
    if (year) queryParams.append('year', year.toString());
    
    const url = `${API_BASE_URL}/summaries?${queryParams.toString()}`;
    const response = await fetchWithTimeout(url).catch((err) => {
      throw new Error(`Failed to fetch yearly summaries: ${err.message}`);
    });
    return handleResponse<YearlySummary[]>(response);
  },
  
  getById: async (id: string): Promise<MonthlySummary | YearlySummary> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/summaries/${id}`).catch((err) => {
      throw new Error(`Failed to fetch summary: ${err.message}`);
    });
    return handleResponse<MonthlySummary | YearlySummary>(response);
  },
  
  create: async (summary: MonthlySummary | YearlySummary): Promise<MonthlySummary | YearlySummary> => {
    const type = 'month' in summary ? 'monthly' : 'yearly';
    const body = {
      id: summary.id,
      type,
      year: summary.year,
      summary: summary.summary,
      ...(type === 'monthly' && { month: (summary as MonthlySummary).month }),
    };
    
    const response = await fetchWithTimeout(`${API_BASE_URL}/summaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err) => {
      throw new Error(`Failed to create summary: ${err.message}`);
    });
    return handleResponse<MonthlySummary | YearlySummary>(response);
  },
  
  update: async (id: string, summary: string, type: 'monthly' | 'yearly'): Promise<MonthlySummary | YearlySummary> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/summaries/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, type }),
    }).catch((err) => {
      throw new Error(`Failed to update summary: ${err.message}`);
    });
    return handleResponse<MonthlySummary | YearlySummary>(response);
  },
  
  delete: async (id: string): Promise<void> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/summaries/${id}`, {
      method: 'DELETE',
    }).catch((err) => {
      throw new Error(`Failed to delete summary: ${err.message}`);
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
