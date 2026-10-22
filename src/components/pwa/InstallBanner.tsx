'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { useInstall } from '@/lib/pwa';
import { Button } from '@/components/ui/Button';

const KEY = 'sg-install-dismissed';
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

/**
 * One-tap "install this app" card for phones and tablets. Each of the four sites (www / app / trade / xdepartment) has its
 * own manifest, so each installs as its own home-screen app — this card just makes that discoverable instead of buried in a menu.
 * Android/Chrome: uses the browser's native install prompt. iPhone/iPad: Safari has no prompt, so it explains Share → Add to Home Screen.
 */
export function InstallBanner({ name }: { name: string }) {
  const { canInstall, installed, ios, install } = useInstall();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    let snoozed = false;
    try { snoozed = Date.now() - Number(localStorage.getItem(KEY) || 0) < SNOOZE_MS; } catch { /* storage blocked */ }
    const touch = window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
    // give the page a moment so the card never competes with first paint
    const t = setTimeout(() => setOpen(!snoozed && touch), 2500);
    return () => clearTimeout(t);
  }, []);

  if (!open || installed || (!canInstall && !ios)) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ } setOpen(false); };

  return (
    <div role="dialog" aria-label={`Install ${name}`} className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-[60] mx-auto max-w-md animate-slide-up rounded-2xl border border-line2/70 bg-panel/95 p-3.5 shadow-pop backdrop-blur-md">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Download className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install {name}</p>
          {steps && ios
            ? <p className="mt-1 text-xs leading-relaxed text-muted">Tap <Share className="mx-0.5 inline h-3.5 w-3.5 align-text-bottom text-fg" /> <b className="text-fg">Share</b>, then <b className="text-fg">Add to Home Screen</b>.</p>
            : <p className="mt-0.5 text-xs text-muted">Full-screen, faster to open, lives on your home screen.</p>}
          {!(steps && ios) && (
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" variant="primary" onClick={async () => { if (canInstall) { const ok = await install(); if (ok) setOpen(false); } else setSteps(true); }}>{canInstall ? 'Install' : 'How to install'}</Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
            </div>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-fg/10 hover:text-fg"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
