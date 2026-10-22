/**
 * Public market-data access (no keys). Candles and 24h stats are read directly from public feeds.
 * Execution, balances and positions always go through the SOGDIA API.
 *
 * Override the hosts with NEXT_PUBLIC_BINANCE_REST / NEXT_PUBLIC_BINANCE_WS. A market-data-only
 * mirror is tried automatically when the primary host is unreachable.
 */
const trim = (s: string) => s.replace(/\/$/, '');

export const REST_HOSTS = [
  trim(process.env.NEXT_PUBLIC_BINANCE_REST || 'https://api.binance.com'),
  'https://data-api.binance.vision',
].filter((v, i, a) => a.indexOf(v) === i);

export const WS_HOSTS = [
  trim(process.env.NEXT_PUBLIC_BINANCE_WS || 'wss://stream.binance.com:9443'),
  'wss://data-stream.binance.vision',
].filter((v, i, a) => a.indexOf(v) === i);

const REST_TIMEOUT_MS = 6000;

/**
 * Asks every REST host at once and takes the first good answer, so a blocked / hanging primary host
 * (common on some ISPs) never stalls the terminal. Losers are aborted.
 */
export async function binanceGet<T>(path: string, params?: Record<string, string | number>, signal?: AbortSignal): Promise<T> {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}` : '';
  const ctrls = REST_HOSTS.map(() => new AbortController());
  const onAbort = () => ctrls.forEach((c) => c.abort());
  signal?.addEventListener('abort', onAbort);
  const timers = ctrls.map((c) => setTimeout(() => c.abort(), REST_TIMEOUT_MS));
  try {
    const attempts = REST_HOSTS.map(async (host, i) => {
      const res = await fetch(`${host}${path}${qs}`, { signal: ctrls[i].signal });
      if (!res.ok) throw new Error(`Market data ${res.status}`);
      const body = (await res.json()) as T;
      ctrls.forEach((c, j) => { if (j !== i) c.abort(); });
      return body;
    });
    return await Promise.any(attempts);
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error('Market data unreachable');
  } finally {
    signal?.removeEventListener('abort', onAbort);
    timers.forEach(clearTimeout);
  }
}

export type SocketStatus = 'connecting' | 'live' | 'down';

let wsPref = 0; // index of the host that last delivered data

/** WebSocket with exponential backoff, host rotation, a connect timeout and a stale-feed watchdog. */
export class FeedSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastMsg = 0;

  constructor(
    private streams: string[],
    private onMessage: (stream: string, data: any) => void,
    private onStatus?: (s: SocketStatus) => void,
    private staleMs = 15_000,
  ) {
    this.open();
    this.watchdog = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && Date.now() - this.lastMsg > this.staleMs) this.ws.close();
    }, 5_000);
  }

  private open() {
    if (this.closed) return;
    this.onStatus?.(this.attempt === 0 ? 'connecting' : 'down');
    const host = WS_HOSTS[(wsPref + this.attempt) % WS_HOSTS.length];
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${host}/stream?streams=${this.streams.join('/')}`);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    // a blocked host can hang for a minute: give up after 4 s and rotate to the next one
    const connectTimer = setTimeout(() => { if (ws.readyState !== WebSocket.OPEN) ws.close(); }, 4000);
    ws.onopen = () => { this.lastMsg = Date.now(); clearTimeout(connectTimer); };
    ws.onmessage = (ev) => {
      this.lastMsg = Date.now();
      if (this.attempt !== 0) { wsPref = (wsPref + this.attempt) % WS_HOSTS.length; this.attempt = 0; }
      this.onStatus?.('live');
      try {
        const m = JSON.parse(ev.data as string);
        if (m && m.stream) this.onMessage(m.stream, m.data);
      } catch { /* ignore malformed frame */ }
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => { clearTimeout(connectTimer); if (this.ws === ws) this.retry(); };
  }

  private retry() {
    if (this.closed) return;
    this.onStatus?.('down');
    this.attempt++;
    const delay = this.attempt <= 1 ? 150 : Math.min(15_000, 500 * 2 ** Math.min(this.attempt, 5)) * (0.75 + Math.random() * 0.5);
    this.timer = setTimeout(() => this.open(), delay);
  }

  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.watchdog) clearInterval(this.watchdog);
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; try { ws.close(); } catch { /* noop */ } }
  }
}

export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface Ticker24 { symbol: string; last: number; open: number; high: number; low: number; baseVol: number; quoteVol: number; changePct: number }
export type Level = [number, number];
export interface AggTrade { id: number; price: number; qty: number; time: number; sell: boolean }

export const TIMEFRAMES = [
  { key: '1m', label: '1m', seconds: 60 },
  { key: '3m', label: '3m', seconds: 180 },
  { key: '5m', label: '5m', seconds: 300 },
  { key: '15m', label: '15m', seconds: 900 },
  { key: '30m', label: '30m', seconds: 1800 },
  { key: '1h', label: '1H', seconds: 3600 },
  { key: '2h', label: '2H', seconds: 7200 },
  { key: '4h', label: '4H', seconds: 14400 },
  { key: '6h', label: '6H', seconds: 21600 },
  { key: '8h', label: '8H', seconds: 28800 },
  { key: '12h', label: '12H', seconds: 43200 },
  { key: '1d', label: '1D', seconds: 86400 },
  { key: '3d', label: '3D', seconds: 259200 },
  { key: '1w', label: '1W', seconds: 604800 },
  { key: '1M', label: '1Mo', seconds: 2592000 }, // calendar month: real close time is computed separately
] as const;
export type TimeframeKey = (typeof TIMEFRAMES)[number]['key'];

export function mapKline(k: (string | number)[]): Candle {
  return { time: Math.floor(Number(k[0]) / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] };
}

export function mapMini(t: { s: string; c: string; o: string; h: string; l: string; v: string; q: string }): Ticker24 {
  const last = +t.c, open = +t.o;
  return { symbol: t.s, last, open, high: +t.h, low: +t.l, baseVol: +t.v, quoteVol: +t.q, changePct: open ? ((last - open) / open) * 100 : 0 };
}

export function mapRest24(t: { symbol: string; lastPrice: string; openPrice: string; highPrice: string; lowPrice: string; volume: string; quoteVolume: string }): Ticker24 {
  const last = +t.lastPrice, open = +t.openPrice;
  return { symbol: t.symbol, last, open, high: +t.highPrice, low: +t.lowPrice, baseVol: +t.volume, quoteVol: +t.quoteVolume, changePct: open ? ((last - open) / open) * 100 : 0 };
}
