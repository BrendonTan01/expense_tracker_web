import { useEffect, useRef, useState } from 'react';
import { generateId } from './storage';
import { todayIsoLocal } from './dateHelpers';

// A failed/ambiguous request keeps its identity and generated payload until the
// draft changes. The server can replay it without applying the write twice.
export function useMutationAttempt<T>(owner: string) {
  const attempt = useRef<{ fingerprint: string; requestId: string; today: string; payload: T } | null>(null);
  const locked = useRef(false);
  const lifetime = useRef({ owner, mounted: true });
  if (lifetime.current.owner !== owner) {
    lifetime.current = { owner, mounted: true };
    attempt.current = null;
    locked.current = false;
  }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const current = lifetime.current;
    current.mounted = true;
    setPending(false);
    setError(null);
    return () => { current.mounted = false; };
  }, [owner]);
  const clear = () => { if (!locked.current) { attempt.current = null; setError(null); } };
  const run = async (
    fingerprint: string,
    makePayload: () => T,
    save: (value: { requestId: string; today: string; payload: T }) => Promise<void>,
    onSuccess: () => void,
  ) => {
    if (locked.current) return;
    const current = lifetime.current;
    const active = () => current.mounted && lifetime.current === current;
    if (!active()) return;
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
        attempt.current = { fingerprint, requestId: generateId(), today: todayIsoLocal(), payload: makePayload() };
      }
      await save(attempt.current);
      if (!active()) return;
      attempt.current = null;
      onSuccess();
    } catch (err) {
      if (active()) setError(err instanceof Error ? err.message : 'Save failed. Your draft is still here; retry to confirm the outcome.');
    } finally {
      if (active()) { locked.current = false; setPending(false); }
    }
  };
  return { pending, error, run, clear };
}
