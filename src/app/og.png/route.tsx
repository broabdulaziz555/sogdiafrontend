import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const revalidate = 86400;

const BRAND = '#B7F36B';
const BG = '#090C16';

/** GET /og.png — the 1200×630 link-preview card for sogdia.site (Open Graph / X). */
export function GET() {
  const facts = [['80%', 'Profit split'], ['200×', 'Max leverage'], ['14 days', 'Payout cycle'], ['24/7', '50 USDT pairs']];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: BG, padding: '64px 72px', backgroundImage: `radial-gradient(ellipse at 85% 0%, ${BRAND}22, transparent 55%)`, color: '#EDF1F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ display: 'flex', width: 56, height: 56, borderRadius: 14, background: BRAND, alignItems: 'center', justifyContent: 'center', color: BG, fontSize: 34, fontWeight: 700 }}>S</div>
          <div style={{ display: 'flex', fontSize: 38, letterSpacing: 6, fontWeight: 600 }}>SOGDIA<span style={{ color: BRAND }}>.SITE</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>Crypto Prop Trading Firm</div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 30, color: '#96A2BB' }}>Get funded. Trade crypto 24/7. Keep 80% of the profit.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 44 }}>
            {facts.map(([v, l]) => (
              <div key={l} style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 40, fontWeight: 700, color: BRAND }}>{v}</div>
                <div style={{ display: 'flex', fontSize: 20, color: '#96A2BB', marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontSize: 22, color: '#96A2BB' }}>@sogdiacapital</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'cache-control': 'public, max-age=86400, s-maxage=604800' } },
  );
}
