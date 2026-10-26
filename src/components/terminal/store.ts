'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AggTrade, Level, SocketStatus, Ticker24, TimeframeKey } from '@/lib/binance';
import type { MarketPrice, MarketSymbol, Side } from '@/lib/types';
import { DEFAULT_CARD_OPTS, type CardData, type CardOpts } from '@/lib/tradeCardCanvas';

export interface PendingOrder {
  id: string;
  accountId: string;
  symbol: string;
  side: Side;
  kind: 'limit' | 'stop';
  trigger: number;
  leverage: number;
  margin: number;
  tp: number | null;
  sl: number | null;
  createdAt: number;
  status: 'working' | 'filling' | 'failed';
  error?: string;
  /** Rests on the server (survives a closed tab). Orders without this flag are watched by the browser. */
  server?: boolean;
}

export type MobileTab = 'markets' | 'chart' | 'trade' | 'positions' | 'history';
export type BookView = 'both' | 'bids' | 'asks';

export type DrawTool = 'hline' | 'vline' | 'trend' | 'ray' | 'rect';
export type DrawDash = 'solid' | 'dashed' | 'dotted';
/** A chart drawing, anchored in (unix seconds, price) so it survives zoom, pan and timeframe changes. */
export interface Drawing {
  id: string;
  tool: DrawTool;
  a: { t: number; p: number };
  b?: { t: number; p: number };
  color: string;
  width: 1 | 2 | 3 | 4;
  dash: DrawDash;
  /** rectangle fill opacity 0…0.5 */
  fill?: number;
  extendLeft?: boolean;
  extendRight?: boolean;
  label?: string;
  locked?: boolean;
}

interface State {
  // persisted preferences
  symbol: string;
  timeframe: TimeframeKey;
  favorites: string[];
  confirmOrders: boolean;
  soundOn: boolean;
  magnet: boolean;
  /** drawings per symbol */
  drawings: Record<string, Drawing[]>;
  drawTool: DrawTool | null;
  drawBarOpen: boolean;
  setDrawings: (symbol: string, fn: (list: Drawing[]) => Drawing[]) => void;
  showMA: boolean;
  bookView: BookView;
  bookGroup: number; // index into the per-symbol group ladder
  showVol: boolean;
  showEMA: boolean;
  showBB: boolean;
  showLevels: boolean;
  /** highest high / lowest low of the visible candles, as price-scale labels and (optionally) lines */
  showHiLo: boolean;
  showHiLoLines: boolean;
  showOrders: boolean;
  showQuotes: boolean;
  cardOpts: CardOpts;
  leverage: number;
  pending: PendingOrder[];

  // session
  accountId: string | null;
  symbols: MarketSymbol[];
  prices: Record<string, MarketPrice>;
  tickers: Record<string, Ticker24>;
  last: number | null;
  lastDir: 1 | -1 | 0;
  book: { bids: Level[]; asks: Level[]; at: number };
  trades: AggTrade[];
  socket: SocketStatus;
  tickerSocket: SocketStatus;
  pricesOk: boolean;
  mobileTab: MobileTab;
  hotkeysOpen: boolean;
  pickedPrice: { price: number; n: number } | null;
  tradeCard: { id: string; label: string; live: boolean; data?: CardData } | null;

  set: (p: Partial<State>) => void;
  setSymbol: (s: string) => void;
  toggleFavorite: (s: string) => void;
  mergeTickers: (list: Ticker24[]) => void;
  setPrices: (list: MarketPrice[]) => void;
  setLast: (p: number) => void;
  addPending: (o: PendingOrder) => void;
  updatePending: (id: string, p: Partial<PendingOrder>) => void;
  removePending: (id: string) => void;
}

const noopStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

export const useTerminal = create<State>()(
  persist(
    (set, get) => ({
      symbol: 'BTCUSDT',
      timeframe: '15m',
      favorites: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      confirmOrders: false,
      soundOn: false,
      magnet: false,
      showMA: false,
      drawings: {},
      drawTool: null,
      drawBarOpen: true,
      bookView: 'both',
      bookGroup: 0,
      showVol: false,
      showEMA: false,
      showBB: false,
      showLevels: true,
      showHiLo: true,
      showHiLoLines: false,
      showOrders: true,
      showQuotes: true,
      cardOpts: DEFAULT_CARD_OPTS,
      leverage: 20,
      pending: [],

      accountId: null,
      symbols: [],
      prices: {},
      tickers: {},
      last: null,
      lastDir: 0,
      book: { bids: [], asks: [], at: 0 },
      trades: [],
      socket: 'connecting',
      tickerSocket: 'connecting',
      pricesOk: true,
      mobileTab: 'chart',
      hotkeysOpen: false,
      pickedPrice: null,
      tradeCard: null,

      set: (p) => set(p),
      setDrawings: (symbol, fn) => set((st) => ({ drawings: { ...st.drawings, [symbol]: fn(st.drawings[symbol] ?? []) } })),
      setSymbol: (symbol) => {
        if (get().symbol === symbol) return;
        set({ symbol, last: null, lastDir: 0, book: { bids: [], asks: [], at: 0 }, trades: [], bookGroup: 0 });
      },
      toggleFavorite: (s) => set((st) => ({ favorites: st.favorites.includes(s) ? st.favorites.filter((x) => x !== s) : [...st.favorites, s] })),
      mergeTickers: (list) =>
        set((st) => {
          const next = { ...st.tickers };
          for (const t of list) {
            const prev = next[t.symbol];
            if (!prev || prev.last !== t.last || prev.high !== t.high || prev.low !== t.low || prev.quoteVol !== t.quoteVol || prev.open !== t.open) next[t.symbol] = t;
          }
          return { tickers: next };
        }),
      setPrices: (list) =>
        set((st) => {
          const next = { ...st.prices };
          for (const p of list) {
            const prev = next[p.symbol];
            if (!prev || prev.price !== p.price || prev.bid !== p.bid || prev.ask !== p.ask) next[p.symbol] = p;
          }
          return { prices: next, pricesOk: true };
        }),
      setLast: (p) => set((st) => (st.last === p ? st : { last: p, lastDir: st.last == null ? 0 : p > st.last ? 1 : p < st.last ? -1 : st.lastDir })),
      addPending: (o) => set((st) => ({ pending: [...st.pending, o] })),
      updatePending: (id, p) => set((st) => ({ pending: st.pending.map((o) => (o.id === id ? { ...o, ...p } : o)) })),
      removePending: (id) => set((st) => ({ pending: st.pending.filter((o) => o.id !== id) })),
    }),
    {
      name: 'sg-terminal-v1',
      version: 4,
      // v3: card options reset to the new defaults (referral code is always shown, no checkbox)
      // v4: free crosshair and a clean chart (no indicators) by default
      migrate: (persisted: unknown, from: number) => {
        const p = { ...(persisted as object), cardOpts: DEFAULT_CARD_OPTS } as Record<string, unknown>;
        if (from < 4) Object.assign(p, { magnet: false, showMA: false, showEMA: false, showBB: false, showVol: false });
        return p as never;
      },
      storage: createJSONStorage(() => (typeof window === 'undefined' ? noopStorage : window.localStorage)),
      partialize: (s) => ({
        symbol: s.symbol,
        timeframe: s.timeframe,
        favorites: s.favorites,
        confirmOrders: s.confirmOrders,
        soundOn: s.soundOn,
        magnet: s.magnet,
        drawings: s.drawings,
        drawBarOpen: s.drawBarOpen,
        showMA: s.showMA,
        bookView: s.bookView,
        showVol: s.showVol,
        showEMA: s.showEMA,
        showBB: s.showBB,
        showLevels: s.showLevels,
        showHiLo: s.showHiLo,
        showHiLoLines: s.showHiLoLines,
        showOrders: s.showOrders,
        showQuotes: s.showQuotes,
        cardOpts: s.cardOpts,
        leverage: s.leverage,
        // 'filling' is never persisted: other tabs must not see an in-flight order as fillable, and a crash mid-fill must not replay it.
        pending: s.pending.filter((o) => o.status !== 'filling'),
      }),
    },
  ),
);

/** Ladder of order-book price groupings for a given price level. */
export function groupLadder(price: number): number[] {
  if (!price || !Number.isFinite(price)) return [0.01];
  const exp = Math.floor(Math.log10(price));
  const base = Math.pow(10, exp - 5); // 5-6 significant digits at the finest grouping
  return [1, 10, 100, 1000].map((m) => +(base * m).toPrecision(2));
}
