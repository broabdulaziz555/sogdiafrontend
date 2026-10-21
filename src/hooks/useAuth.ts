'use client';

import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { get, post } from '@/lib/api';
import { AUTH_EVENT, clearSession, getSession, setSession } from '@/lib/auth';
import type { Session, User } from '@/lib/types';

interface MeResponse {
  user: User;
  accounts_count: number;
  active_accounts: number;
}

/** Whether a session cookie exists. `null` until mounted (avoids hydration mismatch). */
export function useHasSession(): boolean | null {
  const [has, setHas] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => setHas(!!getSession());
    read();
    window.addEventListener(AUTH_EVENT, read);
    return () => window.removeEventListener(AUTH_EVENT, read);
  }, []);
  return has;
}

export function useMe() {
  const has = useHasSession();
  const swr = useSWR<MeResponse>(has ? '/me' : null, () => get<MeResponse>('/me'), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  return { ...swr, hasSession: has, user: swr.data?.user ?? null, me: swr.data ?? null };
}

export function useAuthActions() {
  const login = useCallback(async (email: string, password: string) => {
    const data = await post<{ user: User; session: Session }>('/auth/login', { email, password }, { auth: false });
    setSession(data.session);
    return data;
  }, []);

  const register = useCallback(
    async (body: { email: string; password: string; full_name?: string; country?: string; referral_code?: string }) => {
      const data = await post<{
        user: Partial<User>;
        session: Session | null;
        email_confirmation_required: boolean;
      }>('/auth/register', body, { auth: false });
      if (data.session) setSession(data.session);
      return data;
    },
    [],
  );

  const logout = useCallback(() => clearSession(), []);
  return { login, register, logout };
}
