'use client';

import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, RefreshCw, Share2 } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import { renderTradeCard } from '@/lib/tradeCardCanvas';
import { canNativeShare, saveOrOpen, shareImage } from '@/lib/shareImage';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useTerminal } from './store';

/** Shareable 1200×630 trade card, rendered by the API at /api/og/trade/{id}. Opened from any position / history row. */
export function TradeCardModal() {
  const toast = useToast();
  const card = useTerminal((s) => s.tradeCard);
  const set = useTerminal((s) => s.set);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<'dl' | 'share' | null>(null);

  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => { setState('loading'); setAttempt(0); }, [card?.id]);

  // Draw the card here in the browser (always works, no network). The API image is only a fallback when we have no trade data.
  const data = card?.data;
  useEffect(() => {
    if (!data || !card) { setLocal(null); return; }
    let url: string | null = null;
    let dead = false;
    renderTradeCard(data, card.live).then((b) => {
      if (dead) return;
      url = URL.createObjectURL(b); setLocal(url); setState('ok');
    }).catch(() => { if (!dead) setState('error'); });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [data, card, attempt]);

  if (!card) return null;
  const url = assetUrl(`/api/og/trade/${card.id}`);
  const src = data ? (local ?? '') : `${url}?r=${attempt}`;
  const file = `sogdia-trade-${card.id.slice(0, 8)}.png`;
  const close = () => set({ tradeCard: null });

  const download = async () => {
    setBusy('dl');
    const r = await saveOrOpen(src, file);
    if (r === 'opened') toast.info('Image opened in a new tab', 'Press and hold (or right-click) the image to save it.');
    setBusy(null);
  };
  const share = async () => {
    setBusy('share');
    try { await shareImage(src, file, `My ${card.label} trade on SOGDIA`); } catch (e) { if ((e as Error)?.name !== 'AbortError') toast.error('Could not open the share sheet'); }
    setBusy(null);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied', 'Anyone with the link can see this card.'); } catch { toast.error('Clipboard is blocked', url); }
  };

  return (
    <Modal open onClose={close} size="lg" title={`Trade card · ${card.label}`} description={card.live ? 'Live card — it updates while the position is open.' : 'Shareable image of this closed trade.'}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {!data && <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={copy}>Copy link</Button>}
          {src && <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted hover:bg-fg/[0.06] hover:text-fg"><ExternalLink className="h-3.5 w-3.5" />Open</a>}
          {canNativeShare() && <Button size="sm" variant="secondary" loading={busy === 'share'} icon={<Share2 className="h-3.5 w-3.5" />} onClick={share}>Share</Button>}
          <Button size="sm" variant="primary" loading={busy === 'dl'} disabled={state !== 'ok'} icon={<Download className="h-3.5 w-3.5" />} onClick={download} data-autofocus>Download PNG</Button>
        </div>
      }>
      <div className="p-4">
        <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-lg border border-line bg-panel2">
          {state === 'loading' && <Skeleton className="absolute inset-0 rounded-none" />}
          {state === 'error' ? (
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              <div className="space-y-2">
                <p className="text-sm font-medium">The card could not be rendered.</p>
                <p className="text-xs text-muted">{data ? 'Your browser could not draw the image.' : 'The image service did not answer. Try again in a moment.'}</p>
                <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => { setState('loading'); setAttempt((n) => n + 1); }}>Retry</Button>
              </div>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            src && <img key={attempt} src={src} alt={`${card.label} trade card`} onLoad={() => setState('ok')} onError={() => setState('error')}
              className={`h-full w-full object-contain transition-opacity duration-300 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`} />
          )}
        </div>
      </div>
    </Modal>
  );
}
