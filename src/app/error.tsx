'use client';

import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
      <div className="max-w-sm space-y-4">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-down/30 bg-down/10 text-down">
          <AlertOctagon className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Something broke on our side</h1>
        <p className="text-sm text-muted">An unexpected error occurred. {error.digest && <span className="font-mono text-2xs text-subtle">ref {error.digest}</span>}</p>
        <button onClick={reset} className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-110">
          Try again
        </button>
      </div>
    </main>
  );
}
