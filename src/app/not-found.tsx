import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
      <div className="space-y-4">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">Error 404</p>
        <h1 className="text-4xl font-bold tracking-tight">Page not found</h1>
        <p className="mx-auto max-w-sm text-sm text-muted">The page you are looking for does not exist or has been moved.</p>
        <Link href="/" className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:brightness-110">
          Back to home
        </Link>
      </div>
    </main>
  );
}
