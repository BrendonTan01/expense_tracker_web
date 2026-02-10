import * as SecureStore from 'expo-secure-store';
import { AppState, Bucket, Transaction, RecurringTransaction, Budget, MonthlySummary, YearlySummary } from '../types';

// IMPORTANT: Update this to your actual API base URL
// For local dev: 'http://YOUR_LOCAL_IP:3001/api'
// For production: 'https://your-vercel-app.vercel.app/api'
const API_BASE_URL = 'http://localhost:3001/api';

const TOKEN_KEY = 'auth_token';

let _cachedToken: string | null = null;

export async function getAuthToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  try {
    _cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
    return _cachedToken;
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  _cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  _cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function getAuthHeaders(additionalHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    ),
  ]);
}

let _onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(callback: () => void) {
  _onUnauthorized = callback;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      await clearAuthToken();
      _onUnauthorized?.();
    }
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP error! status: ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

// Auth API
export const authApi = {
  login: async (email: string, password: string): Promise<{ token: string; user: { id: string; email: string } }> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }
    return response.json();
  },

  register: async (email: string, password: string): Promise<{ token: string; user: { id: string; email: string } }> => {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(error.error || 'Registration failed');
    }
    return response.json();
  },

  verify: async (): Promise<{ user: { id: string; email: string } }> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/verify`, { headers });
    if (!response.ok) throw new Error('Token invalid');
    return response.json();
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to change password' }));
      throw new Error(error.error || 'Failed to change password');
    }
  },
};

// Buckets API
export const bucketsApi = {
  getAll: async (): Promise<Bucket[]> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets`, { headers }).catch((err) => {
      throw new Error(`Failed to fetch buckets: ${err.message}`);
    });
    return handleResponse<Bucket[]>(response);
  },
  getById: async (id: string): Promise<Bucket> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets/${id}`, { headers }).catch((err) => {
      throw new Error(`Failed to fetch bucket: ${err.message}`);
    });
    return handleResponse<Bucket>(response);
  },
  create: async (bucket: Bucket): Promise<Bucket> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets`, {
      method: 'POST', headers, body: JSON.stringify(bucket),
    }).catch((err) => { throw new Error(`Failed to create bucket: ${err.message}`); });
    return handleResponse<Bucket>(response);
  },
  update: async (id: string, updates: Partial<Bucket>): Promise<Bucket> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(updates),
    }).catch((err) => { throw new Error(`Failed to update bucket: ${err.message}`); });
    return handleResponse<Bucket>(response);
  },
  delete: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/buckets/${id}`, {
      method: 'DELETE', headers,
    }).catch((err) => { throw new Error(`Failed to delete bucket: ${err.message}`); });
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
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(url, { headers }).catch((err) => {
      throw new Error(`Failed to fetch transactions: ${err.message}`);
    });
    const transactions = await handleResponse<any[]>(response);
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
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions/${id}`, { headers }).catch((err) => {
      throw new Error(`Failed to fetch transaction: ${err.message}`);
    });
    const t = await handleResponse<any>(response);
    return { ...t, isRecurring: Boolean(t.isRecurring), bucketId: t.bucketId || undefined, recurringId: t.recurringId || undefined, tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined, notes: t.notes || undefined };
  },
  create: async (transaction: Omit<Transaction, 'id'> & { id?: string }): Promise<Transaction> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions`, {
      method: 'POST', headers, body: JSON.stringify(transaction),
    }).catch((err) => { throw new Error(`Failed to create transaction: ${err.message}`); });
    const t = await handleResponse<any>(response);
    return { ...t, isRecurring: Boolean(t.isRecurring), bucketId: t.bucketId || undefined, recurringId: t.recurringId || undefined };
  },
  update: async (id: string, updates: Partial<Transaction>): Promise<Transaction> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(updates),
    }).catch((err) => { throw new Error(`Failed to update transaction: ${err.message}`); });
    const t = await handleResponse<any>(response);
    return { ...t, isRecurring: Boolean(t.isRecurring), bucketId: t.bucketId || undefined, recurringId: t.recurringId || undefined, tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined, notes: t.notes || undefined };
  },
  delete: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions/${id}`, {
      method: 'DELETE', headers,
    }).catch((err) => { throw new Error(`Failed to delete transaction: ${err.message}`); });
    return handleResponse<void>(response);
  },
  updateByRecurringId: async (
    recurringId: string,
    transaction: { type: Transaction['type']; amount: number; description: string; bucketId?: string },
    options?: { fromDate?: string }
  ): Promise<{ updated: number; transactions: Transaction[] }> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/transactions/recurring/${recurringId}`, {
      method: 'PUT', headers, body: JSON.stringify({ transaction, ...(options?.fromDate ? { fromDate: options.fromDate } : {}) }),
    }).catch((err) => { throw new Error(`Failed to bulk update recurring transactions: ${err.message}`); });
    const result = await handleResponse<{ updated: number; transactions: any[] }>(response);
    return {
      updated: Number(result.updated) || 0,
      transactions: (result.transactions || []).map((t) => ({ ...t, isRecurring: Boolean(t.isRecurring), bucketId: t.bucketId || undefined, recurringId: t.recurringId || undefined, tags: t.tags ? (typeof t.tags === 'string' ? JSON.parse(t.tags) : t.tags) : undefined, notes: t.notes || undefined })),
    };
  },
};

// Recurring Transactions API
const isValidRecurringTransaction = (r: RecurringTransaction | null): r is RecurringTransaction => r !== null;

export const recurringApi = {
  getAll: async (): Promise<RecurringTransaction[]> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring`, { headers }).catch((err) => {
      throw new Error(`Failed to fetch recurring transactions: ${err.message}`);
    });
    const recurring = await handleResponse<any[]>(response);
    const mapped: (RecurringTransaction | null)[] = (recurring || []).map(r => {
      if (!r || !r.id || !r.startDate || !r.frequency || !r.transaction) {
        console.warn('Invalid recurring transaction data:', r);
        return null;
      }
      return {
        id: String(r.id),
        transaction: { type: r.transaction.type || 'expense', amount: Number(r.transaction.amount) || 0, description: String(r.transaction.description || ''), bucketId: r.transaction.bucketId || undefined },
        frequency: r.frequency,
        startDate: String(r.startDate),
        endDate: r.endDate ? String(r.endDate) : undefined,
        lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
      };
    });
    return mapped.filter(isValidRecurringTransaction);
  },
  getById: async (id: string): Promise<RecurringTransaction> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring/${id}`, { headers }).catch((err) => {
      throw new Error(`Failed to fetch recurring transaction: ${err.message}`);
    });
    const r = await handleResponse<any>(response);
    return {
      id: String(r.id),
      transaction: { type: r.transaction?.type || r.type || 'expense', amount: Number(r.transaction?.amount || r.amount || 0), description: String(r.transaction?.description || r.description || ''), bucketId: r.transaction?.bucketId || r.bucketId || undefined },
      frequency: r.frequency, startDate: String(r.startDate), endDate: r.endDate ? String(r.endDate) : undefined, lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
    };
  },
  create: async (recurring: RecurringTransaction): Promise<RecurringTransaction> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring`, {
      method: 'POST', headers, body: JSON.stringify(recurring),
    }).catch((err) => { throw new Error(`Failed to create recurring transaction: ${err.message}`); });
    const r = await handleResponse<any>(response);
    return {
      id: String(r.id),
      transaction: { type: r.transaction?.type || 'expense', amount: Number(r.transaction?.amount || 0), description: String(r.transaction?.description || ''), bucketId: r.transaction?.bucketId || undefined },
      frequency: r.frequency, startDate: String(r.startDate), endDate: r.endDate ? String(r.endDate) : undefined, lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
    };
  },
  update: async (id: string, updates: Partial<RecurringTransaction>): Promise<RecurringTransaction> => {
    const payload: any = { ...updates };
    if (updates.transaction) payload.transaction = updates.transaction;
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(payload),
    }).catch((err) => { throw new Error(`Failed to update recurring transaction: ${err.message}`); });
    const r = await handleResponse<any>(response);
    return {
      id: String(r.id),
      transaction: { type: r.transaction?.type || r.type || 'expense', amount: Number(r.transaction?.amount || r.amount || 0), description: String(r.transaction?.description || r.description || ''), bucketId: r.transaction?.bucketId || r.bucketId || undefined },
      frequency: r.frequency, startDate: String(r.startDate), endDate: r.endDate ? String(r.endDate) : undefined, lastApplied: r.lastApplied ? String(r.lastApplied) : undefined,
    };
  },
  delete: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/recurring/${id}`, {
      method: 'DELETE', headers,
    }).catch((err) => { throw new Error(`Failed to delete recurring transaction: ${err.message}`); });
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
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(url, { headers }).catch((err) => {
      throw new Error(`Failed to fetch budgets: ${err.message}`);
    });
    return handleResponse<Budget[]>(response);
  },
  getById: async (id: string): Promise<Budget> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets/${id}`, { headers }).catch((err) => {
      throw new Error(`Failed to fetch budget: ${err.message}`);
    });
    return handleResponse<Budget>(response);
  },
  create: async (budget: Budget): Promise<Budget> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets`, {
      method: 'POST', headers, body: JSON.stringify(budget),
    }).catch((err) => { throw new Error(`Failed to create budget: ${err.message}`); });
    return handleResponse<Budget>(response);
  },
  update: async (id: string, updates: Partial<Budget>): Promise<Budget> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(updates),
    }).catch((err) => { throw new Error(`Failed to update budget: ${err.message}`); });
    return handleResponse<Budget>(response);
  },
  delete: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/budgets/${id}`, {
      method: 'DELETE', headers,
    }).catch((err) => { throw new Error(`Failed to delete budget: ${err.message}`); });
    return handleResponse<void>(response);
  },
};

// Summaries API
export const summariesApi = {
  getAll: async (params?: { type?: 'monthly' | 'yearly'; year?: number; month?: number }): Promise<any> => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.year) queryParams.append('year', params.year.toString());
    if (params?.month) queryParams.append('month', params.month.toString());
    const url = `${API_BASE_URL}/summaries${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(url, { headers }).catch((err) => {
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
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(url, { headers }).catch((err) => {
      throw new Error(`Failed to fetch monthly summaries: ${err.message}`);
    });
    return handleResponse<MonthlySummary[]>(response);
  },
  getYearly: async (year?: number): Promise<YearlySummary[]> => {
    const queryParams = new URLSearchParams();
    queryParams.append('type', 'yearly');
    if (year) queryParams.append('year', year.toString());
    const url = `${API_BASE_URL}/summaries?${queryParams.toString()}`;
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(url, { headers }).catch((err) => {
      throw new Error(`Failed to fetch yearly summaries: ${err.message}`);
    });
    return handleResponse<YearlySummary[]>(response);
  },
  create: async (summary: MonthlySummary | YearlySummary): Promise<MonthlySummary | YearlySummary> => {
    const type = 'month' in summary ? 'monthly' : 'yearly';
    const body = { id: summary.id, type, year: summary.year, summary: summary.summary, ...(type === 'monthly' && { month: (summary as MonthlySummary).month }) };
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/summaries`, {
      method: 'POST', headers, body: JSON.stringify(body),
    }).catch((err) => { throw new Error(`Failed to create summary: ${err.message}`); });
    return handleResponse<MonthlySummary | YearlySummary>(response);
  },
  update: async (id: string, summary: string, type: 'monthly' | 'yearly'): Promise<MonthlySummary | YearlySummary> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/summaries`, {
      method: 'PUT', headers, body: JSON.stringify({ id, summary, type }),
    }).catch((err) => { throw new Error(`Failed to update summary: ${err.message}`); });
    return handleResponse<MonthlySummary | YearlySummary>(response);
  },
  delete: async (id: string): Promise<void> => {
    const headers = await getAuthHeaders();
    const response = await fetchWithTimeout(`${API_BASE_URL}/summaries?id=${id}`, {
      method: 'DELETE', headers,
    }).catch((err) => { throw new Error(`Failed to delete summary: ${err.message}`); });
    return handleResponse<void>(response);
  },
};

// App State API
export const appStateApi = {
  load: async (): Promise<AppState> => {
    const [buckets, transactions, recurring, budgets] = await Promise.all([
      bucketsApi.getAll(),
      transactionsApi.getAll(),
      recurringApi.getAll(),
      budgetsApi.getAll(),
    ]);
    return { buckets, transactions, recurringTransactions: recurring, budgets };
  },
};
