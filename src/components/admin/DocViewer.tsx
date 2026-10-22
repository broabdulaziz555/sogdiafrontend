'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Maximize2, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/cn';

const MIN = 0.5, MAX = 8;
const isPdf = (u: string) => /\.pdf(\?|#|$)/i.test(u);

/** Zoomable, pannable document viewer. Wheel or +/- to zoom, drag to pan, R to rotate, 0 to fit. */
export function DocViewer({ url, label }: { url: string | null; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(1);
  const [rot, setRot] = useState(0);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const reset = useCallback(() => { setZ(1); setRot(0); setPos({ x: 0, y: 0 }); }, []);
  useEffect(() => { reset(); setState('loading'); }, [url, reset]);

  const zoom = useCallback((f: number) => setZ((v) => Math.min(MAX, Math.max(MIN, +(v * f).toFixed(3)))), []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.25); }
    else if (e.key === '-') { e.preventDefault(); zoom(0.8); }
    else if (e.key === '0') { e.preventDefault(); reset(); }
    else if (e.key.toLowerCase() === 'r') { e.preventDefault(); setRot((r) => (r + 90) % 360); }
  };

  // wheel needs a non-passive listener to prevent page scroll
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [zoom, url]);

  if (!url) return null;
  const pdf = isPdf(url);

  return (
    <div className="flex h-full min-h-[320px] flex-col overflow-hidden bg-bg">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line/60 bg-panel/60 px-3">
        <span className="mr-auto truncate px-1 text-sm font-medium text-muted">{label ?? 'Document'}</span>
        {!pdf && (<>
          <button onClick={() => zoom(0.8)} aria-label="Zoom out" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/10 hover:text-fg"><ZoomOut className="h-4 w-4" /></button>
          <span className="num w-12 text-center text-xs text-muted">{Math.round(z * 100)}%</span>
          <button onClick={() => zoom(1.25)} aria-label="Zoom in" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/10 hover:text-fg"><ZoomIn className="h-4 w-4" /></button>
          <button onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Rotate" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/10 hover:text-fg"><RotateCw className="h-4 w-4" /></button>
          <button onClick={reset} aria-label="Fit to view" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/10 hover:text-fg"><Maximize2 className="h-4 w-4" /></button>
        </>)}
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open in new tab" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-fg/10 hover:text-fg"><ExternalLink className="h-4 w-4" /></a>
      </div>

      {pdf ? (
        <iframe src={url} title={label ?? 'Document'} className="min-h-0 flex-1 bg-white" onLoad={() => setState('ready')} />
      ) : (
        <div ref={box} tabIndex={0} onKeyDown={onKey} aria-label="Document viewer. Use plus and minus to zoom, R to rotate, 0 to reset, drag to pan."
          className={cn('relative min-h-0 flex-1 touch-none select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accent', z > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
          onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }); }}
          onPointerUp={() => { drag.current = null; }}
          onDoubleClick={() => (z > 1 ? reset() : zoom(2.5))}>
          {state === 'loading' && <div className="absolute inset-0 grid place-items-center"><div className="skeleton h-3/4 w-3/4 rounded-2xl" /></div>}
          {state === 'error' && <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-down">The document couldn’t be loaded. The signed link may have expired — reload the list.</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={label ?? 'KYC document'} draggable={false} onLoad={() => setState('ready')} onError={() => setState('error')}
            className={cn('absolute left-1/2 top-1/2 max-h-full max-w-full rounded-lg object-contain transition-opacity', state !== 'ready' && 'opacity-0')}
            style={{ transform: `translate(-50%,-50%) translate(${pos.x}px,${pos.y}px) rotate(${rot}deg) scale(${z})`, transformOrigin: 'center' }} />
        </div>
      )}
    </div>
  );
}
