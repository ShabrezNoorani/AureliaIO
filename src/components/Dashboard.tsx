import { useState, useMemo } from 'react';
import type { AppData, Option, Channel } from '@/lib/types';
import { calculateMetrics, formatEuro } from '@/lib/calculations';

interface DashboardProps {
  data: AppData;
  onEditOption: (optionId: string, channelIdx?: number) => void;
  updateOption: (optionId: string, updater: (o: Option) => void) => void;
}

interface GlobalPax {
  adult: number;
  youth: number;
  children: number;
  infant: number;
}

function mapGlobalToChannel(channel: Channel, global: GlobalPax): Channel {
  const name = channel.name.toLowerCase();
  const mapped = { ...channel, tickets: channel.tickets.map(t => ({ ...t })) };

  if (name === 'viator') {
    for (const t of mapped.tickets) {
      const tl = t.type.toLowerCase();
      if (tl.includes('adult')) t.pax = global.adult;
      else if (tl.includes('child')) t.pax = global.children + global.youth + global.infant;
      else t.pax = 0;
    }
  } else if (name === 'getyourguide' || name === 'gyg') {
    for (const t of mapped.tickets) {
      const tl = t.type.toLowerCase();
      if (tl.includes('old')) t.pax = 0;
      else if (tl.includes('adult')) t.pax = global.adult;
      else if (tl.includes('child')) t.pax = global.youth;
      else if (tl.includes('youth')) t.pax = global.children;
      else if (tl.includes('infant')) t.pax = global.infant;
      else t.pax = 0;
    }
  } else if (name === 'airbnb') {
    for (const t of mapped.tickets) {
      t.pax = global.adult + global.youth + global.children + global.infant;
    }
  } else {
    // Own Website, Agent, Custom
    for (const t of mapped.tickets) {
      const tl = t.type.toLowerCase();
      if (tl.includes('adult')) t.pax = global.adult;
      else if (tl.includes('child')) t.pax = global.children + global.youth + global.infant;
      else t.pax = 0;
    }
  }

  return mapped;
}

export default function Dashboard({ data, onEditOption }: DashboardProps) {
  const [global, setGlobal] = useState<GlobalPax>({ adult: 10, youth: 2, children: 2, infant: 1 });

  const allOptions = data.products.flatMap((p) =>
    p.options.map((o) => ({ ...o, productName: p.name }))
  );

  const fields: { key: keyof GlobalPax; label: string }[] = [
    { key: 'adult', label: 'Adult' },
    { key: 'youth', label: 'Youth' },
    { key: 'children', label: 'Children' },
    { key: 'infant', label: 'Infant' },
  ];

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

      {/* Global pax inputs */}
      <div className="aurelia-card px-6 py-4 mb-8 flex items-center gap-6 flex-wrap">
        <span className="text-sm font-bold text-foreground uppercase tracking-widest">Simulate</span>
        {fields.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">{label}:</label>
            <input
              type="number"
              min={0}
              value={global[key]}
              onChange={(e) => setGlobal(prev => ({ ...prev, [key]: Math.max(0, Number(e.target.value)) }))}
              className="w-16 text-center text-sm font-bold bg-secondary rounded-lg px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-gold"
            />
          </div>
        ))}
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
                const mappedChannel = mapGlobalToChannel(channel, global);
                const metrics = calculateMetrics(option, mappedChannel);
                const isProfitable = metrics ? metrics.netProfit > 0 : false;
                const totalPax = mappedChannel.tickets.reduce((s, t) => s + Number(t.pax), 0);
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

                    {/* Read-only mapped pax */}
                    <div className="space-y-1.5 mb-4">
                      {mappedChannel.tickets.map((ticket) => (
                        <div key={ticket.id} className="flex justify-between items-center">
                          <span className="text-xs text-muted-foreground">
                            {ticket.type}{ticket.minAge !== undefined && ticket.maxAge !== undefined ? ` (${ticket.minAge}-${ticket.maxAge})` : ''}:
                          </span>
                          <span className="w-14 text-center text-sm font-bold bg-secondary rounded-lg px-2 py-1 text-foreground">
                            {ticket.pax}
                          </span>
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
