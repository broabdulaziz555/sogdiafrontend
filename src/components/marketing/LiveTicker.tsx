'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApi } from '@/hooks/useApi';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmtPrice } from '@/lib/format';
import type { MarketPricesResponse } from '@/lib/types';
import { cn } from '@/lib/cn';

const SYMS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRXUSDT'];

function Cell({ symbol, price }: { symbol: string; price: number }) {
  const prev = useRef(price);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (price !== prev.current) {
      setDir(price > prev.current ? 'up' : 'down');
      prev.current = price;
      const t = setTimeout(() => setDir(null), 600);
      return () => clearTimeout(t);
    }
  }, [price]);
  return (
    <span className="inline-flex items-center gap-2 px-5">
      <span className="text-xs font-semibold text-muted">{symbol.replace('USDT', '')}<span className="text-subtle">/USDT</span></span>
      <span className={cn('num rounded px-1 font-mono text-xs font-medium', dir === 'up' && 'flash-up text-up', dir === 'down' && 'flash-down text-down')}>
        {fmtPrice(price)}
      </span>
    </span>
  );
}

/** Real prices from GET /api/market/prices (public). Silently hides itself if the feed is down. */
export function LiveTicker() {
  const t = useTranslations('ticker');
  const { data, error, isLoading } = useApi<MarketPricesResponse>('/market/prices', { symbols: SYMS.join(',') }, { refreshInterval: 5000 });

  if (error && !data) return null;

  return (
    <div className="relative border-y border-line bg-panel2/50" role="region" aria-label={t('live')}>
      <div className="mx-auto flex max-w-7xl items-center">
        <div className="z-10 flex shrink-0 items-center gap-2 border-r border-line bg-bg px-4 py-2.5 sm:px-5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
          </span>
          <span className="label whitespace-nowrap">{t('live')}</span>
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_4%,#000_96%,transparent)]">
          {isLoading && !data ? (
            <div className="flex gap-8 px-5 py-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-3 w-24" />)}</div>
          ) : (
            <div className="flex w-max animate-marquee py-2.5 hover:[animation-play-state:paused]">
              {[0, 1].map((k) => (
                <div key={k} className="flex shrink-0" aria-hidden={k === 1}>
                  {data?.prices.map((p) => <Cell key={p.symbol} symbol={p.symbol} price={p.price} />)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
