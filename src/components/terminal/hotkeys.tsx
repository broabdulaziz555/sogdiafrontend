'use client';

import { useCallback, useEffect, useState } from 'react';
import { errMsg, post } from '@/lib/api';
import { TIMEFRAMES } from '@/lib/binance';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useTerminalData } from './data';
import { OPEN_SYMBOL_SEARCH } from './PairBar';
import { useTerminal } from './store';
import { ticketApi } from './ticketApi';

export const HOTKEYS: { keys: string[]; label: string }[] = [
  { keys: ['Shift', 'B'], label: 'Open long (uses the ticket values)' },
  { keys: ['Shift', 'S'], label: 'Open short (uses the ticket values)' },
  { keys: ['Shift', 'M'], label: 'Cycle order type — Market / Limit / Stop' },
  { keys: ['M'], label: 'Focus the margin field' },
  { keys: ['Shift', 'X'], label: 'Close all positions' },
  { keys: ['Shift', 'F'], label: 'Flatten the current symbol' },
  { keys: ['Alt', '1…9'], label: 'Chart timeframe 1m · 3m · 5m · 15m · 30m · 1H · 2H · 4H · 6H' },
  { keys: ['Alt', '↑ / ↓'], label: 'Previous / next pair' },
  { keys: ['/'], label: 'Search pairs (also Ctrl + K)' },
  { keys: ['G'], label: 'Toggle magnet crosshair' },
  { keys: ['?'], label: 'Show this cheat-sheet' },
  { keys: ['Esc'], label: 'Close dialogs and menus' },
];

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

/** Registers global shortcuts and renders the cheat-sheet and close-all confirmation. */
export function Hotkeys() {
  const toast = useToast();
  const { positions, refresh } = useTerminalData();
  const open = useTerminal((s) => s.hotkeysOpen);
  const set = useTerminal((s) => s.set);
  const [flat, setFlat] = useState<null | { label: string; ids: string[] }>(null);
  const [busy, setBusy] = useState(false);

  const closeMany = useCallback(async () => {
    if (!flat) return;
    setBusy(true);
    const res = await Promise.allSettled(flat.ids.map((id) => post('/trade/close', { order_id: id })));
    const bad = res.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (bad.length) toast.warn('Some positions did not close', `${bad.length} of ${flat.ids.length} failed: ${errMsg(bad[0].reason)}`);
    else toast.success(`Closed ${flat.ids.length} position${flat.ids.length > 1 ? 's' : ''}`);
    await refresh();
    setBusy(false);
    setFlat(null);
  }, [flat, toast, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return;
      const st = useTerminal.getState();
      const inField = typing(e.target);

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') { e.preventDefault(); window.dispatchEvent(new Event(OPEN_SYMBOL_SEARCH)); return; }
      if (inField || e.ctrlKey || e.metaKey) return;

      if (e.altKey && !e.shiftKey) {
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (m) { e.preventDefault(); st.set({ timeframe: TIMEFRAMES[Number(m[1]) - 1].key }); return; }
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
          e.preventDefault();
          const list = st.symbols.map((s) => s.symbol);
          if (!list.length) return;
          const i = Math.max(0, list.indexOf(st.symbol));
          st.setSymbol(list[(i + (e.code === 'ArrowDown' ? 1 : -1) + list.length) % list.length]);
          return;
        }
        return;
      }
      if (e.altKey) return;

      if (e.shiftKey) {
        if (e.code === 'KeyB') { e.preventDefault(); ticketApi.submit?.('long'); return; }
        if (e.code === 'KeyS') { e.preventDefault(); ticketApi.submit?.('short'); return; }
        if (e.code === 'KeyM') { e.preventDefault(); ticketApi.cycleType?.(); return; }
        if (e.code === 'KeyX') {
          e.preventDefault();
          if (!positions.length) { toast.info('Nothing to close', 'You have no open positions.'); return; }
          setFlat({ label: `all ${positions.length} open position${positions.length > 1 ? 's' : ''}`, ids: positions.map((p) => p.id) });
          return;
        }
        if (e.code === 'KeyF') {
          e.preventDefault();
          const mine = positions.filter((p) => p.symbol === st.symbol);
          if (!mine.length) { toast.info('Nothing to flatten', `No open ${st.symbol.replace('USDT', '/USDT')} positions.`); return; }
          setFlat({ label: `${mine.length} ${st.symbol.replace('USDT', '/USDT')} position${mine.length > 1 ? 's' : ''}`, ids: mine.map((p) => p.id) });
          return;
        }
        if (e.key === '?' || e.code === 'Slash') { e.preventDefault(); st.set({ hotkeysOpen: !st.hotkeysOpen }); }
        return;
      }

      if (e.code === 'Slash') { e.preventDefault(); window.dispatchEvent(new Event(OPEN_SYMBOL_SEARCH)); return; }
      if (e.code === 'KeyG') { st.set({ magnet: !st.magnet }); return; }
      if (e.code === 'KeyM') { e.preventDefault(); ticketApi.focusMargin?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [positions, toast]);

  return (
    <>
      <Modal open={open} onClose={() => set({ hotkeysOpen: false })} title="Keyboard shortcuts" description="Shortcuts are ignored while you type in a field." size="md">
        <ul className="divide-y divide-line px-5 pb-4">
          {HOTKEYS.map((h) => (
            <li key={h.label} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-muted">{h.label}</span>
              <span className="flex shrink-0 items-center gap-1">{h.keys.map((k, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-subtle">+</span>}<kbd className="kbd">{k}</kbd></span>)}</span>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal open={!!flat} onClose={() => !busy && setFlat(null)} size="sm" title="Close positions?"
        footer={<><Button variant="ghost" disabled={busy} onClick={() => setFlat(null)}>Cancel</Button><Button variant="down" loading={busy} onClick={closeMany} data-autofocus>Close at market</Button></>}>
        <p className="px-5 py-4 text-sm text-muted">This closes {flat?.label} at the current engine price, including the exit spread. It can’t be undone.</p>
      </Modal>
    </>
  );
}
