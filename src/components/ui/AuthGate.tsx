'use client';

import { createContext, useContext, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useMe } from '@/hooks/useAuth';
import { siteHref } from '@/lib/sites';
import type { Role, User } from '@/lib/types';
import { LogoMark } from './Logo';
import { Button } from './Button';
import { ErrorState } from './States';
import { clearSession } from '@/lib/auth';

const UserCtx = createContext<User | null>(null);
export const useUser = () => {
  const u = useContext(UserCtx);
  if (!u) throw new Error('useUser must be used inside <AuthGate>');
  return u;
};

export function BootScreen({ label = 'Authenticating' }: { label?: string }) {
  return (
    <div className="grid h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <span className="absolute inset-0 animate-ping rounded-lg bg-accent/20" />
          <LogoMark className="relative h-10 w-10" />
        </div>
        <p className="text-xs uppercase tracking-[0.2em] text-subtle">{label}</p>
      </div>
    </div>
  );
}

export function AuthGate({ children, roles }: { children: React.ReactNode; roles?: Role[] }) {
  const { user, hasSession, error, isLoading, mutate } = useMe();

  const goLogin = () => {
    const next = encodeURIComponent(window.location.href);
    window.location.replace(siteHref('www', `/login?next=${next}`));
  };

  useEffect(() => {
    if (hasSession === false) goLogin();
  }, [hasSession]);

  useEffect(() => {
    if (error && (error as { status?: number }).status === 401) goLogin();
  }, [error]);

  if (hasSession === null || hasSession === false || (isLoading && !user)) return <BootScreen />;
  if (error && !user) {
    return (
      <div className="grid h-dvh place-items-center bg-bg">
        <ErrorState error={error} onRetry={() => mutate()} title="Could not verify your session" />
      </div>
    );
  }
  if (!user) return <BootScreen />;

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="grid h-dvh place-items-center bg-bg p-6">
        <div className="max-w-sm space-y-4 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-down/30 bg-down/10 text-down">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">Access restricted</h1>
          <p className="text-sm text-muted">
            Signed in as <span className="text-fg">{user.email}</span> ({user.role}). This workspace requires{' '}
            {roles.join(' or ')} privileges.
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => { window.location.href = siteHref('app', '/'); }}>Go to dashboard</Button>
            <Button variant="ghost" onClick={() => { clearSession(); }}>Sign out</Button>
          </div>
        </div>
      </div>
    );
  }

  return <UserCtx.Provider value={user}>{children}</UserCtx.Provider>;
}
