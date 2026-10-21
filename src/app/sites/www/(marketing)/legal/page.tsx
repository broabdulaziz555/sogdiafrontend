import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Legal & Disclosures' };

const ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY || 'SOGDIA';
const EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@sogdia.site';

const SECTIONS: { id: string; title: string; body: string[] }[] = [
  {
    id: 'terms',
    title: 'Terms of Service',
    body: [
      `These Terms govern your use of the websites, applications and services operated by ${ENTITY} ("SOGDIA", "we", "us"). By creating an account or purchasing a product you agree to them in full.`,
      'SOGDIA offers evaluation ("One-Step") and funded ("Instant") trading accounts. Each account is a service sold for a one-time fee. Purchasing an account does not create a brokerage, custodial, deposit or investment relationship between you and SOGDIA, and no funds you pay are held for trading on your behalf.',
      'You must be of legal age in your jurisdiction and legally permitted to use the service. You are responsible for the accuracy of the information you provide, for safeguarding your credentials, and for all activity under your account. One person may not operate multiple accounts to circumvent limits, and accounts may not be shared, resold or transferred.',
      'Prohibited conduct includes, without limitation: latency or feed arbitrage, tick scalping, exploitation of pricing or platform errors, coordinated trading between accounts, use of unauthorised automation, and any attempt to disrupt or reverse-engineer the platform. SOGDIA may freeze, breach or close an account, withhold payouts, and void results where such conduct is detected or reasonably suspected.',
      'Account fees are non-refundable except where required by law. We may change these Terms; material changes apply to purchases made after the change is published. Rules (drawdown limits, profit target, leverage, payout split and cycle) are snapshotted onto each account at purchase and do not change retroactively unless required for legal or security reasons.',
      'To the maximum extent permitted by law, SOGDIA is not liable for indirect, incidental or consequential losses, including lost profits, arising from use of the service, market data errors, downtime, or third-party failures.',
    ],
  },
  {
    id: 'risk',
    title: 'Risk Disclosure',
    body: [
      'Trading cryptocurrency derivatives and leveraged products carries a high level of risk and may not be suitable for all individuals. Leverage of up to 200× magnifies both gains and losses; a small adverse price move can result in the loss of your entire margin and the breach of your account.',
      'Crypto markets are open 24 hours a day, 7 days a week, can be extremely volatile, and can gap or experience low liquidity. Stops, take-profits and liquidation levels are not guaranteed to fill at the specified price.',
      'Past performance, including any results shown on this website or in certificates, is not a reliable indicator of future performance. Nothing on this website is investment, financial, legal or tax advice. You should consider your own objectives and seek independent advice where appropriate.',
      'You may lose the entire fee paid for an account. Achieving a profit target or receiving a payout is not guaranteed.',
    ],
  },
  {
    id: 'execution',
    title: 'Execution & Spread Disclosure',
    body: [
      'Trading on SOGDIA accounts is conducted within SOGDIA\'s own execution engine. Orders are not routed to an external exchange or liquidity provider. Reference prices are sourced from Binance and may differ from prices available on other venues or at other times.',
      'A spread of 0.05% is applied against the trader on every fill: long positions are filled at the ask and short positions at the bid, and the inverse applies on exit. Liquidation prices are computed from the entry price and leverage and are enforced by a server-side sweep.',
      'Because SOGDIA is the counterparty to trades executed in its engine, SOGDIA may benefit economically when traders lose. Prices, fills and account metrics are determined solely by SOGDIA\'s systems and are final, subject to correction of demonstrable errors.',
      'Market data, balances and positions may be delayed, interrupted or inaccurate due to connectivity or upstream failures. The risk engine evaluates drawdown on equity (balance plus unrealised PnL); if a limit is breached, all open positions are closed at market and the account is marked failed.',
    ],
  },
  {
    id: 'payouts',
    title: 'Payout Policy',
    body: [
      'A payout may be requested when: KYC is verified; a wallet address is on file; the account status is active or passed; the account balance exceeds its initial size; and the payout cycle (14 days from account creation or the last payout) has elapsed.',
      'The payout amount is 80% of the profit withdrawn; the remaining 20% is retained by SOGDIA. Payouts are made in USDT to the wallet address on file after review. You are responsible for providing a correct address and for any taxes due. Transfers to an incorrect address cannot be recovered.',
      'SOGDIA may reject or delay a payout while it investigates suspected violations of the Terms, and may require additional verification.',
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    body: [
      `${ENTITY} collects the information you provide (email, name, country, wallet address, and identity documents submitted for KYC), technical data (IP address, device and browser information, approximate location derived from IP) and platform activity (orders, positions, payouts, audit logs).`,
      'We use this information to provide and secure the service, verify identity, prevent fraud and abuse, process payments and payouts, meet legal obligations, and communicate with you. Identity documents are stored in a private, access-controlled bucket and are viewable only by authorised staff.',
      'We share data with service providers that process it on our behalf (for example hosting, authentication, payment processing via NOWPayments, and market data providers) and with authorities where legally required. We do not sell personal data.',
      'We use cookies and similar storage to keep you signed in across SOGDIA subdomains, remember your language and theme, and cache data for offline use. You may request access to, correction or deletion of your personal data by contacting us, subject to legal retention requirements.',
      `Contact: ${EMAIL}.`,
    ],
  },
];

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
      <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="label mb-4">On this page</p>
          <nav aria-label="Legal sections" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-fg/[0.05] hover:text-fg">
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight">Legal &amp; Disclosures</h1>
          <p className="mt-3 text-sm text-muted">Please read these documents carefully before purchasing an account.</p>

          <div className="mt-12 space-y-14">
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="mb-5 border-b border-line pb-3 text-2xl font-semibold tracking-tight">{s.title}</h2>
                <div className="space-y-4 text-sm leading-relaxed text-muted">
                  {s.body.map((p, i) => <p key={i}>{p}</p>)}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
