import { useState } from 'react';
import type { AppData, Option } from '@/lib/types';
import { calculateMetrics, formatEuro } from '@/lib/calculations';

interface DashboardProps {
  data: AppData;
  onEditOption: (optionId: string, channelIdx?: number) => void;
  updateOption: (optionId: string, updater: (o: Option) => void) => void;
}

export default function Dashboard({ data, onEditOption, updateOption }: DashboardProps) {
  const allOptions = data.products.flatMap((p) =>
    p.options.map((o) => ({ ...o, productName: p.name }))
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Good morning, {data.companyName}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here is your current pricing performance.
        </p>
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
                const metrics = calculateMetrics(option, channel);
                const isProfitable = metrics ? metrics.netProfit > 0 : false;
                const totalPax = channel.tickets.reduce((s, t) => s + Number(t.pax), 0);
                return (
                  <div
                    key={channel.id}
                    className="p-5 cursor-pointer hover:bg-surface-subtle transition-colors"
                    onClick={() => onEditOption(option.id, idx)}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="font-bold text-sm text-foreground">{channel.name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {channel.commission}% / {channel.promo}%
                      </span>
                    </div>

                    {/* Per-channel pax inputs */}
                    <div className="space-y-1.5 mb-4">
                      {channel.tickets.map((ticket, tIdx) => (
                        <div key={ticket.id} className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">
                            {ticket.type} ({ticket.minAge}-{ticket.maxAge}):
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={ticket.pax}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              updateOption(option.id, (o) => {
                                const ch = o.channels.find((c) => c.id === channel.id);
                                if (ch) ch.tickets[tIdx].pax = val;
                              });
                            }}
                            className="w-14 text-center text-sm font-bold bg-secondary rounded-lg px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-gold"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                      Your Net Profit
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
                      {totalPax} pax total
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
