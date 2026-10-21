'use client';

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtUsd0 } from '@/lib/format';

export interface DayPoint { day: string; revenue: number; sales: number }

const col = (v: string, a = 1) => `rgb(var(--${v}) / ${a})`;

export default function RevenueChart({ data }: { data: DayPoint[] }) {
  return (
    <div className="h-[280px] w-full" role="img" aria-label="Estimated daily sales value, last 30 days">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={col('accent', 0.35)} />
              <stop offset="1" stopColor={col('accent', 0)} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={col('line')} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(5)} stroke={col('subtle')} tick={{ fontSize: 11, fill: col('subtle') }} tickLine={false} axisLine={{ stroke: col('line') }} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => fmtUsd0(v)} stroke={col('subtle')} tick={{ fontSize: 11, fill: col('subtle') }} tickLine={false} axisLine={false} width={64} />
          <Tooltip
            cursor={{ stroke: col('subtle', 0.5) }}
            contentStyle={{ background: col('panel'), border: `1px solid ${col('line')}`, borderRadius: 8, fontSize: 12, color: col('fg') }}
            labelStyle={{ color: col('muted') }}
            formatter={(v: number, _n: string, p: { payload?: DayPoint }) => [`${fmtUsd0(v)} · ${p.payload?.sales ?? 0} sold`, 'Sales value']}
          />
          <Area type="monotone" dataKey="revenue" stroke={col('accent')} strokeWidth={2} fill="url(#rev)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
