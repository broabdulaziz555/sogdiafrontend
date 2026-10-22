import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Execution Disclosure' };

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'How orders are executed',
    body: "Orders submitted through SOGDIA accounts are executed against SOGDIA's execution engine using reference prices obtained from third-party venues. A spread of 0.05% is applied against the trader on entry and exit. Trader orders are not routed to an external execution venue.",
  },
  {
    title: 'Reference prices',
    body: 'Displayed prices are obtained from third-party market data providers and are not a guarantee of execution price. Market data may be delayed, interrupted or inaccurate.',
  },
  {
    title: 'Trading costs',
    body: 'Traders are responsible for the trading costs disclosed for their account. The 0.05% spread described above is applied by SOGDIA and is not a third-party market cost.',
  },
  {
    title: 'Payouts',
    body: "Profit payable to a trader is calculated from the trader's recorded fills and is subject to the payout split, cycle and eligibility conditions in the applicable account terms. The current split is 80% to the trader, over a 14-day cycle.",
  },
  {
    title: 'Risk controls and records',
    body: 'Trading activity is subject to the position limits, drawdown requirements and exposure restrictions disclosed for the relevant account. Orders, execution reports and account activity are recorded and reconciled for risk management, compliance, dispute resolution and account administration.',
  },
];

export default function ExecutionDisclosurePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <article className="max-w-[70ch]">
        <h1 className="text-4xl font-bold tracking-tight">Execution Disclosure</h1>
        <div className="mt-10 space-y-10">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="mb-3 border-b border-line pb-2 text-xl font-semibold tracking-tight">{s.title}</h2>
              <p className="text-sm leading-relaxed text-muted">{s.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-muted">See also the full <Link href="/legal" className="text-accent hover:underline">Legal &amp; Disclosures</Link>.</p>
      </article>
    </div>
  );
}
