import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1fr_minmax(480px,560px)]">
      {/* Left brand panel */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-panel2 lg:block">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="absolute -left-32 top-1/3 h-[480px] w-[480px] rounded-full bg-accent/10 blur-[110px]" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/"><Logo /></Link>
          <div className="max-w-md space-y-5">
            <p className="font-mono text-xs text-accent">Institutional crypto prop trading</p>
            <h2 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-[-0.03em]">
              Trade Crypto 24/7.
              <span className="block text-accent">Keep More of What You Earn.</span>
            </h2>
            <p className="text-md text-muted">SOGDIA is built for traders who refuse to wait.</p>
          </div>
          <dl className="grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {[['80%', 'Profit split'], ['200×', 'Max leverage'], ['24/7', 'Markets']].map(([v, l]) => (
              <div key={l} className="bg-panel px-4 py-3.5">
                <dd className="num text-xl font-bold">{v}</dd>
                <dt className="text-xs text-muted">{l}</dt>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      {/* Form panel */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Link href="/" className="lg:invisible"><Logo /></Link>
          <div className="flex items-center gap-2"><LocaleSwitcher /><ThemeToggle /></div>
        </div>
        <main className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center px-5 pb-16">{children}</main>
      </div>
    </div>
  );
}
