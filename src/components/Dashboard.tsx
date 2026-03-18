import { useState } from 'react';
import type { AppData } from '@/lib/types';
import { calculateMetrics, formatEuro } from '@/lib/calculations';

interface DashboardProps {
  data: AppData;
  onEditOption: (optionId: string, channelIdx?: number) => void;
}

export default function Dashboard({ data, onEditOption }: DashboardProps) {
  const [simulatePax, setSimulatePax] = useState(15);

  const allOptions = data.products.flatMap((p) =>
    p.options.map((o) => ({ ...o, productName: p.name }))
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Good morning, {data.companyName}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here is your current pricing performance.
          </p>
        </div>
        <div className="aurelia-card p-4 flex items-center space-x-4">
          <label className="aurelia-section-title">Simulate for</label>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={simulatePax}
              onChange={(e) => setSimulatePax(Number(e.target.value))}
              className="w-16 text-center font-bold text-lg bg-transparent outline-none text-foreground"
              min={1}
            />
            <span className="text-muted-foreground font-medium">pax</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {allOptions.map((option) => (
          <div key={option.id} className="aurelia-card overflow-hidden">
            <div className="px-6 py-4 flex justify-between items-center bg-surface-subtle">
              <div>
                <h3 className="font-semibold text-foreground">
                  {option.productName} — {option.name}
                </h3>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Bokun ID: #{option.bokunId || 'N/A'}
                </p>
              </div>
              <button
                onClick={() => onEditOption(option.id)}
                className="text-xs font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
              >
                Edit Option
              </button>
            </div>
            <div
              className="grid divide-x divide-border"
              style={{ gridTemplateColumns: `repeat(${option.channels.length}, 1fr)` }}
            >
              {option.channels.map((channel, idx) => {
                const metrics = calculateMetrics(option, channel, simulatePax);
                const isProfitable = metrics ? metrics.netProfit > 0 : false;
                return (
                  <div
                    key={channel.id}
                    className="p-6 hover:bg-surface-subtle transition-colors cursor-pointer"
                    onClick={() => onEditOption(option.id, idx)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="font-bold text-sm text-foreground">{channel.name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {channel.commission}% / {channel.promo}%
                      </span>
                    </div>
                    <div
                      className={`text-2xl font-bold tabular-nums mb-1 transition-colors duration-200 ${
                        isProfitable ? 'text-profit-positive' : 'text-profit-negative'
                      }`}
                    >
                      {metrics ? formatEuro(metrics.netProfit) : '—'}
                      <span className="ml-2 text-sm">{metrics ? (isProfitable ? '✅' : '🔴') : ''}</span>
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">
                      {simulatePax} pax simulation
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
