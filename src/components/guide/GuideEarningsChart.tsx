import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartColors } from '@/lib/theme';
import type { MonthlyEarningPoint } from '@/lib/guidePerformance';

const fmtEuro = (v: number) => `€${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function GuideEarningsChart({ data }: { data: MonthlyEarningPoint[] }) {
  const colors = useChartColors();

  return (
    <div className="aurelia-card p-5">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">Monthly Earnings</h3>
      <div className="h-[220px]">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: -10, right: 10, bottom: 0, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
              <XAxis dataKey="label" stroke={colors.text} fontSize={10} />
              <YAxis stroke={colors.text} fontSize={11} tickFormatter={(v) => `€${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltip.bg, borderColor: colors.tooltip.border, borderRadius: '8px', fontSize: '12px', color: colors.tooltip.text }}
                itemStyle={{ color: colors.tooltip.text }}
                formatter={(v: number) => fmtEuro(v)}
              />
              <Bar dataKey="total" name="Earned" fill={colors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">No tour history yet.</div>
        )}
      </div>
    </div>
  );
}
