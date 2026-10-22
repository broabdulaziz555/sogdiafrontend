/** Draws the shareable trade card (1200×630) locally, so it never depends on an image service. */
export interface CardData {
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  entry: number;
  exit: number; // close price, or the live mark for an open position
  pnl: number;
  margin: number;
  size: number;
  opened: string | null;
  closed: string | null; // null while open
  reason?: string | null;
}

export interface CardOpts {
  roi: boolean; pnl: boolean; leverage: boolean; entry: boolean; exit: boolean; size: boolean; margin: boolean; date: boolean; fullName: boolean; referral: boolean;
}
export const DEFAULT_CARD_OPTS: CardOpts = { roi: true, pnl: false, leverage: true, entry: true, exit: true, size: false, margin: false, date: true, fullName: true, referral: true };

const W = 1200, H = 630;
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const px = (n: number) => (!Number.isFinite(n) ? '—' : n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : n.toPrecision(5));
const usd = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');

export function renderTradeCard(d: CardData, live: boolean, o: CardOpts = DEFAULT_CARD_OPTS, username = '', ref: { code: string; discount: number } | null = null): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return Promise.reject(new Error('Canvas is not supported'));

  const win = d.pnl >= 0;
  const accent = win ? '#22c55e' : '#ef4444';
  const roi = d.margin > 0 ? (d.pnl / d.margin) * 100 : 0;

  // background
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1018'); bg.addColorStop(1, '#101826');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.82, H * 0.2, 0, W * 0.82, H * 0.2, 520);
  glow.addColorStop(0, win ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.20)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);

  // brand
  g.fillStyle = '#e6ecf4'; g.font = `800 34px ${SANS}`; g.textBaseline = 'alphabetic';
  g.fillText('SOGDIA', 64, 92);
  g.fillStyle = 'rgba(230,236,244,0.45)'; g.font = `500 20px ${SANS}`;
  g.fillText(live ? 'LIVE POSITION' : 'CLOSED TRADE', 64, 122);

  // symbol + side
  const base = d.symbol.replace('USDT', '');
  g.fillStyle = '#e6ecf4'; g.font = `700 64px ${SANS}`;
  g.fillText(`${base}/USDT`, 64, 230);
  const tw = g.measureText(`${base}/USDT`).width;
  const tag = o.leverage ? `${d.side === 'long' ? 'BUY' : 'SELL'} ${d.leverage}×` : (d.side === 'long' ? 'BUY' : 'SELL');
  g.font = `700 26px ${SANS}`;
  const tagW = g.measureText(tag).width + 36;
  const tagC = d.side === 'long' ? '#22c55e' : '#ef4444';
  g.fillStyle = d.side === 'long' ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)';
  g.beginPath(); g.roundRect(64 + tw + 24, 186, tagW, 48, 10); g.fill();
  g.fillStyle = tagC; g.fillText(tag, 64 + tw + 24 + 18, 220);

  // ROI + PnL
  let y = 392;
  if (o.roi) {
    g.fillStyle = accent; g.font = `800 136px ${MONO}`;
    g.fillText(`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`, 64, y);
    y += 58;
  }
  if (o.pnl) {
    g.fillStyle = accent; g.font = `600 ${o.roi ? 40 : 96}px ${MONO}`;
    if (!o.roi) y = 392;
    g.fillText(`${d.pnl >= 0 ? '+' : '−'}${usd(Math.abs(d.pnl))} USDT`, 68, y);
  }

  // stats (only the ones switched on)
  const cols: [string, string][] = [];
  if (o.entry) cols.push(['ENTRY PRICE', px(d.entry)]);
  if (o.exit) cols.push([live ? 'MARK PRICE' : 'EXIT PRICE', px(d.exit)]);
  if (o.size) cols.push(['POSITION SIZE', `${usd(d.size)} USDT`]);
  if (o.margin) cols.push(['MARGIN', `${usd(d.margin)} USDT`]);
  if (cols.length) {
    const x0 = 64, cw = (W - 128) / Math.max(cols.length, 2);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(64, 490); g.lineTo(W - 64, 490); g.stroke();
    cols.forEach(([k, v], i) => {
      g.fillStyle = 'rgba(230,236,244,0.45)'; g.font = `600 17px ${SANS}`; g.fillText(k, x0 + i * cw, 530);
      g.fillStyle = '#e6ecf4'; g.font = `600 28px ${MONO}`; g.fillText(v, x0 + i * cw, 566);
    });
  }

  // footer: site address (+ referral offer)
  {
    g.font = `600 22px ${SANS}`;
    g.fillStyle = 'rgba(230,236,244,0.75)'; g.fillText('sogdia.site · Institutional Crypto Prop Firm', 64, 606); // always shown
    if (o.referral && ref) {
      g.textAlign = 'right'; g.fillStyle = '#b6f35a';
      g.fillText(`Join with code ${ref.code}${ref.discount ? ` · ${ref.discount}% off` : ''}`, W - 64, 606);
      g.textAlign = 'left';
    }
  }

  // header right: username + date
  g.textAlign = 'right';
  let ty = 92;
  if (o.fullName && username) { g.fillStyle = '#e6ecf4'; g.font = `700 26px ${SANS}`; g.fillText(username, W - 64, ty); ty += 32; }
  if (o.date) {
    g.fillStyle = 'rgba(230,236,244,0.40)'; g.font = `500 18px ${SANS}`;
    g.fillText(live ? `Opened ${when(d.opened)}` : `${when(d.opened)}  →  ${when(d.closed)}`, W - 64, ty);
    if (!live && d.reason) g.fillText(d.reason.replace(/_/g, ' '), W - 64, ty + 26);
  }
  g.textAlign = 'left';

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), 'image/png'));
}
