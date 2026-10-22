import type { Metadata } from 'next';
import Link from 'next/link';
import { TERMS_CLOSING, TERMS_SECTIONS, TERMS_TITLE } from '@/lib/legal';

export const metadata: Metadata = { title: 'Terms of Trading and Execution' };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <article className="max-w-[70ch]">
        <h1 className="text-4xl font-bold tracking-tight">{TERMS_TITLE.replace(/^SOGDIA\s*—\s*/, '')}</h1>
        <div className="mt-10 space-y-10">
          {TERMS_SECTIONS.map((s, i) => (
            <section key={s.title}>
              <h2 className="mb-3 border-b border-line pb-2 text-xl font-semibold tracking-tight">{i + 1}. {s.title}</h2>
              <div className="space-y-3">
                {s.paras.map((p) => (
                  <p key={p} className="text-sm leading-relaxed text-muted">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted">{TERMS_CLOSING}</p>
        <p className="mt-6 text-sm text-muted">
          See also the <Link href="/legal/execution" className="text-accent hover:underline">Execution Disclosure</Link> and the full{' '}
          <Link href="/legal" className="text-accent hover:underline">Legal &amp; Disclosures</Link>.
        </p>
      </article>
    </div>
  );
}
