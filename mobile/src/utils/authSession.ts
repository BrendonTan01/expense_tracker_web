export interface SessionUser { id: string; email: string }
interface Session { token: string; user: SessionUser }
interface Credentials { email: string; password: string }
interface Dependencies {
  api: { login(email: string, password: string): Promise<Session>; register(email: string, password: string): Promise<Session>; verify(): Promise<{ user: SessionUser }> };
  getToken(): Promise<string | null>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  getCredentials(): Promise<Credentials | null>;
  saveCredentials(email: string, password: string): Promise<void>;
  clearCredentials(): Promise<void>;
  remember(enabled: boolean): Promise<void>;
  invalidate(): void;
  publish(session: Session | null): void;
}

// One lifecycle generation owns each asynchronous result. Persistence operations
// finish in order so a slow SecureStore write cannot run after logout cleanup.
export function createAuthSession(deps: Dependencies) {
  let generation = 0;
  let session: Session | null = null;
  let writes: Promise<unknown> = Promise.resolve();
  let refreshing = false;
  const current = (id: number) => id === generation;
  const persist = (id: number, action: () => Promise<void>) => {
    const task = writes.then(async () => { if (current(id)) await action(); });
    writes = task.catch(() => {});
    return task;
  };
  const publish = (value: Session | null) => { session = value; deps.publish(value); };
  const clear = (explicit: boolean) => {
    ++generation;
    deps.invalidate();
    publish(null);
    // Cleanup is never skipped: a subsequent failed login must not retain the
    // previous account's persisted token or remembered password.
    const cleanup = writes.then(async () => {
      const results = await Promise.allSettled([
        deps.clearToken(),
        ...(explicit ? [deps.clearCredentials(), deps.remember(false)] : []),
      ]);
      if (results.some(result => result.status === 'rejected')) {
        throw new Error('Saved sign-in details could not be completely cleared.');
      }
    });
    writes = cleanup.catch(() => {});
    return cleanup;
  };
  const authenticate = async (kind: 'login' | 'register', email: string, password: string, remember = false) => {
    const id = ++generation;
    deps.invalidate();
    publish(null);
    const result = await deps.api[kind](email, password);
    await persist(id, async () => {
      // Clear old credentials before publishing a different account, including registration.
      if (kind === 'login' && remember) await deps.saveCredentials(result.user.email, password);
      else await deps.clearCredentials();
      await deps.remember(kind === 'login' && remember);
      if (!current(id)) return;
      await deps.setToken(result.token);
      if (current(id)) publish(result);
    });
  };
  return {
    login: (email: string, password: string, remember = false) => authenticate('login', email, password, remember),
    register: (email: string, password: string) => authenticate('register', email, password),
    logout: () => clear(true),
    unauthorized: () => clear(false),
    async initialize() {
      const id = generation;
      const token = await deps.getToken();
      if (!token || !current(id)) return;
      try {
        const result = await deps.api.verify();
        if (current(id)) publish({ token, user: result.user });
      } catch {
        if (current(id)) await clear(false);
      }
    },
    async foreground() {
      if (!session || refreshing) return;
      refreshing = true;
      const id = generation;
      const owner = session.user;
      try {
        const credentials = await deps.getCredentials();
        if (!current(id)) return;
        // Legacy saved credentials have no user ID; email must match the verified owner.
        if (credentials && credentials.email.toLowerCase() === owner.email.toLowerCase()) {
          try {
            const result = await deps.api.login(credentials.email, credentials.password);
            if (result.user.id !== owner.id) throw new Error('Saved account changed');
            await persist(id, async () => {
              await deps.setToken(result.token);
              if (current(id)) publish(result);
            });
            return;
          } catch { /* Verify the current session if remembered login fails. */ }
        }
        if (!current(id)) return;
        const verified = await deps.api.verify();
        if (current(id) && verified.user.id !== owner.id) await clear(false);
      } catch {
        if (current(id)) await clear(false);
      } finally { refreshing = false; }
    },
  };
}
