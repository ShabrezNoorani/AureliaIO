import { useState, useMemo } from 'react';
import { Settings2, X } from 'lucide-react';
import type { AppData, Option, AgeBucket } from '@/lib/types';
import { calculateMetrics, formatEuro, getAutoMappedPax } from '@/lib/calculations';

interface DashboardProps {
  data: AppData;
  onEditOption: (optionId: string, channelIdx?: number) => void;
  updateBucketCount: (bucketId: string, count: number) => void;
  updateAgeBuckets: (buckets: AgeBucket[]) => void;
}

function EditBucketsModal({
  buckets,
  onSave,
  onClose,
}: {
  buckets: AgeBucket[];
  onSave: (b: AgeBucket[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AgeBucket[]>(
    buckets.map((b) => ({ ...b }))
  );

  const updateDraft = (idx: number, field: keyof AgeBucket, value: string | number) => {
    setDraft((prev) => {
      const next = prev.map((b) => ({ ...b }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (next[idx] as any)[field] = value;
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="aurelia-card p-6 w-[520px] animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-bold text-foreground">Edit Age Ranges</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          {draft.map((b, idx) => (
            <div key={b.id} className="grid grid-cols-[40px_1fr_80px_80px] gap-3 items-center">
              <span className="text-xl text-center">{b.emoji}</span>
              <input
                className="aurelia-input text-sm"
                value={b.label}
                onChange={(e) => updateDraft(idx, 'label', e.target.value)}
                placeholder="Label"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  className="aurelia-input text-sm text-center"
                  value={b.minAge}
                  onChange={(e) => updateDraft(idx, 'minAge', Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  className="aurelia-input text-sm text-center"
                  value={b.maxAge}
                  onChange={(e) => updateDraft(idx, 'maxAge', Math.max(0, Number(e.target.value)))}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <p className="text-[10px] text-muted-foreground">Age ranges should cover 0–120 with no gaps or overlaps.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="aurelia-ghost-btn">Cancel</button>
            <button
              onClick={() => { onSave(draft); onClose(); }}
              className="aurelia-gold-btn text-xs"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ data, onEditOption, updateBucketCount, updateAgeBuckets }: DashboardProps) {
  const [showEditBuckets, setShowEditBuckets] = useState(false);

  const totalPax = data.ageBuckets.reduce((s, b) => s + b.count, 0);

  // Compute summary stats
  const stats = useMemo(() => {
    const allOptions = data.products.flatMap((p) => p.options);
    const totalProducts = data.products.length;
    const allChannelNames = new Set<string>();
    let marginSum = 0;
    let marginCount = 0;

    for (const opt of allOptions) {
      for (const ch of opt.channels) {
        allChannelNames.add(ch.name);
        const m = calculateMetrics(opt, ch, data.ageBuckets);
        if (m && m.margin !== 0) {
          marginSum += m.margin;
          marginCount++;
        }
      }
    }

    return {
      totalProducts,
      totalOptions: allOptions.length,
      activeChannels: allChannelNames.size,
      avgMargin: marginCount > 0 ? marginSum / marginCount : 0,
    };
  }, [data]);

  return (
    <div className="p-8 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Good morning, <span className="text-foreground">{data.companyName}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.totalOptions} tours · {stats.totalProducts} products · updated just now
          </p>
        </div>
        <div className="flex gap-2">
          <div className="aurelia-pill">
            <span className="text-muted-foreground">Total Products</span>
            <span className="ml-2 text-foreground font-bold">{stats.totalProducts}</span>
          </div>
          <div className="aurelia-pill">
            <span className="text-muted-foreground">Active Channels</span>
            <span className="ml-2 text-foreground font-bold">{stats.activeChannels}</span>
          </div>
          <div className="aurelia-pill">
            <span className="text-muted-foreground">Avg Margin</span>
            <span className="ml-2 text-foreground font-bold">{stats.avgMargin.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Global Simulate Bar */}
      <div className="aurelia-card p-6 mb-8 border-l-[3px] border-l-gold">
        <div className="flex items-center justify-between mb-5">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-gold">
            Simulate Group Composition
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-foreground tabular-nums">
              Total: {totalPax} pax
            </span>
            <button
              onClick={() => setShowEditBuckets(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-gold transition-colors"
            >
              <Settings2 size={13} />
              Edit Age Ranges
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {data.ageBuckets.map((bucket) => (
            <div key={bucket.id} className="text-center">
              <div className="text-xl mb-1">{bucket.emoji}</div>
              <div className="text-xs font-bold text-foreground mb-0.5">{bucket.label}</div>
              <div className="text-[10px] text-muted-foreground mb-2">
                {bucket.minAge === 0 && bucket.maxAge >= 120
                  ? 'All'
                  : bucket.maxAge >= 120
                  ? `${bucket.minAge}+`
                  : `${bucket.minAge}–${bucket.maxAge}`}
              </div>
              <input
                type="number"
                min={0}
                value={bucket.count}
                onChange={(e) => updateBucketCount(bucket.id, Math.max(0, Number(e.target.value)))}
                onFocus={(e) => e.target.select()}
                className="w-full text-center text-lg font-bold bg-background border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:ring-1 focus:ring-gold/50 tabular-nums transition-all"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Products and Options */}
      <div className="space-y-6">
        {data.products.map((product) => (
          <div key={product.id}>
            {/* Product header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">{product.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {product.options.length} option{product.options.length !== 1 ? 's' : ''} · {' '}
                  {new Set(product.options.flatMap((o) => o.channels.map((c) => c.name))).size} channels
                </span>
              </div>
            </div>

            {/* Option cards */}
            <div className="space-y-4">
              {product.options.map((option) => (
                <OptionCard
                  key={option.id}
                  option={option}
                  ageBuckets={data.ageBuckets}
                  onEditOption={onEditOption}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Buckets Modal */}
      {showEditBuckets && (
        <EditBucketsModal
          buckets={data.ageBuckets}
          onSave={updateAgeBuckets}
          onClose={() => setShowEditBuckets(false)}
        />
      )}
    </div>
  );
}

function OptionCard({
  option,
  ageBuckets,
  onEditOption,
}: {
  option: Option & { productName?: string };
  ageBuckets: AgeBucket[];
  onEditOption: (optionId: string, channelIdx?: number) => void;
}) {
  return (
    <div className="aurelia-card overflow-hidden">
      {/* Option header */}
      <div className="px-6 py-3.5 flex justify-between items-center bg-surface-subtle border-b border-border">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm text-foreground">{option.name}</h3>
          {option.bokunId && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Bokun: #{option.bokunId}
            </span>
          )}
        </div>
        <button
          onClick={() => onEditOption(option.id)}
          className="text-[10px] font-bold text-muted-foreground hover:text-gold uppercase tracking-widest transition-colors"
        >
          Edit
        </button>
      </div>

      {/* Channel columns */}
      <div
        className="grid divide-x divide-border"
        style={{ gridTemplateColumns: `repeat(${option.channels.length}, 1fr)` }}
      >
        {option.channels.map((channel, idx) => {
          const metrics = calculateMetrics(option, channel, ageBuckets);
          const isProfitable = metrics ? metrics.netProfit > 0 : false;
          const totalPax = metrics?.totalPax ?? 0;

          return (
            <div
              key={channel.id}
              className={`p-5 cursor-pointer hover:bg-hover transition-colors relative ${
                metrics
                  ? isProfitable
                    ? 'border-l-2 border-l-profit-positive'
                    : 'border-l-2 border-l-profit-negative'
                  : 'border-l-2 border-l-transparent'
              }`}
              onClick={() => onEditOption(option.id, idx)}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="font-bold text-sm text-foreground">{channel.name}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-muted-foreground tabular-nums">
                  {channel.commission}% · {channel.promo}% promo
                </span>
              </div>

              {/* Auto-mapped pax */}
              <div className="space-y-1 mb-4">
                {channel.tickets.map((ticket) => {
                  const pax = getAutoMappedPax(ticket, ageBuckets);
                  return (
                    <div key={ticket.id} className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">{ticket.type}:</span>
                      <span className="text-xs font-bold text-foreground tabular-nums w-8 text-right">{pax}</span>
                    </div>
                  );
                })}
              </div>

              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                Net Profit
              </div>
              <div className="flex items-end gap-2">
                <span
                  className={`text-xl font-bold tabular-nums transition-colors duration-200 ${
                    metrics
                      ? isProfitable
                        ? 'text-profit-positive'
                        : 'text-profit-negative'
                      : 'text-muted-foreground'
                  }`}
                >
                  {metrics ? formatEuro(metrics.netProfit) : '—'}
                </span>
                {metrics && (
                  <span
                    className={`text-xs font-semibold mb-0.5 ${
                      isProfitable ? 'text-profit-positive' : 'text-profit-negative'
                    }`}
                  >
                    {isProfitable ? '✅' : '🔴'} {metrics.margin.toFixed(0)}% margin
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                {totalPax} pax total
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
