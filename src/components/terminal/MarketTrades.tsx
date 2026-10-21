'use client';

import { memo } from 'react';
import { cn } from '@/lib/cn';
import { fmtNum, fmtPrice, qtyDecimals } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';
import { useTerminal } from './store';

const hms = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });

function MarketTradesInner() {
  const trades = useTerminal((s) => s.trades);
  const symbol = useTerminal((s) => s.symbol);
  const socket = useTerminal((s) => s.socket);
  const ref = trades[0]?.price ?? 1;
  const qd = qtyDecimals(ref);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Market trades">
      <div className="grid grid-cols-3 border-b border-line px-2 py-1.5 text-2xs uppercase tracking-wider text-subtle">
        <span>Price</span><span className="text-right">Size ({symbol.replace('USDT', '')})</span><span className="text-right">Time (UTC)</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          socket === 'down' ? <div className="grid h-full place-items-center px-4 text-center text-xs text-muted">Trade feed is reconnecting…</div>
            : <div className="space-y-1 p-2">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-4" />)}</div>
        ) : (
          <ul>
            {trades.map((t) => (
              <li key={t.id} className="grid grid-cols-3 px-2 font-mono text-xs leading-[20px]">
                <span className={cn('num', t.sell ? 'text-down' : 'text-up')}>{fmtPrice(t.price)}</span>
                <span className="num text-right text-fg/90">{fmtNum(t.qty, qd)}</span>
                <span className="num text-right text-muted">{hms(t.time)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export const MarketTrades = memo(MarketTradesInner);
