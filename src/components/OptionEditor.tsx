import { useState, useMemo } from 'react';
import { Trash2, ArrowLeft, Plus } from 'lucide-react';
import type { AppData, Option, AgeBucket } from '@/lib/types';
import { calculateMetrics, formatEuroDetailed, getAutoMappedPax } from '@/lib/calculations';

const CHANNEL_PRESETS = ['Viator', 'GYG', 'Airbnb', 'Own Website', 'Agent', 'Custom'];

interface OptionEditorProps {
  data: AppData;
  optionId: string;
  initialChannelIdx?: number;
  onBack: () => void;
  updateOption: (optionId: string, updater: (o: Option) => void) => void;
  addTicket: (optionId: string, channelId: string) => void;
  deleteTicket: (optionId: string, channelId: string, ticketId: string) => void;
  addGuide: (optionId: string) => void;
  deleteGuide: (optionId: string, guideId: string) => void;
  addExtraCost: (optionId: string) => void;
  deleteExtraCost: (optionId: string, costId: string) => void;
  addTier: (optionId: string) => void;
  deleteTier: (optionId: string, tierId: string) => void;
  addChannel: (optionId: string, name: string) => void;
  deleteChannel: (optionId: string, channelId: string) => void;
}

function ResultRow({ label, value, subText, isCost }: { label: string; value: number; subText?: string; isCost?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {subText && <div className="text-[10px] text-muted-foreground/60">{subText}</div>}
      </div>
      <div className={`text-sm font-bold tabular-nums ${isCost && value > 0 ? 'text-profit-negative' : 'text-foreground'}`}>
        {isCost && value > 0 ? '-' : ''}{formatEuroDetailed(Math.abs(value || 0))}
      </div>
    </div>
  );
}

export default function OptionEditor({
  data,
  optionId,
  initialChannelIdx = 0,
  onBack,
  updateOption,
  addTicket,
  deleteTicket,
  addGuide,
  deleteGuide,
  addExtraCost,
  deleteExtraCost,
  addTier,
  deleteTier,
  addChannel,
  deleteChannel,
}: OptionEditorProps) {
  const option = data.products.flatMap((p) => p.options).find((o) => o.id === optionId);
  const [activeChannelIdx, setActiveChannelIdx] = useState(initialChannelIdx);
  const [showAddChannel, setShowAddChannel] = useState(false);

  const channel = option?.channels[activeChannelIdx];
  const ageBuckets = data.ageBuckets;

  const metrics = useMemo(() => {
    if (!option || !channel) return null;
    return calculateMetrics(option, channel, ageBuckets);
  }, [option, channel, ageBuckets]);

  if (!option || !channel) return null;

  const update = (updater: (o: Option) => void) => updateOption(optionId, updater);

  const totalPax = metrics?.totalPax ?? 0;

  return (
    <div className="flex h-screen overflow-hidden animate-fade-in">
      {/* LEFT PANEL */}
      <div className="flex-1 overflow-y-auto p-8" style={{ maxWidth: '540px' }}>
        <button
          onClick={onBack}
          className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-8 flex items-center hover:text-gold transition-colors"
        >
          <ArrowLeft size={14} className="mr-2" />
          Back to Dashboard
        </button>

        {/* Basic Info */}
        <section className="mb-10">
          <h2 className="aurelia-section-title mb-5">Basic Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Option Name</label>
              <input
                className="aurelia-input"
                value={option.name}
                onChange={(e) => update((o) => { o.name = e.target.value; })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bokun Product ID</label>
              <input
                className="aurelia-input"
                value={option.bokunId}
                onChange={(e) => update((o) => { o.bokunId = e.target.value; })}
              />
            </div>
          </div>
          <div className="space-y-1.5 mt-4">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Notes</label>
            <textarea
              className="aurelia-input min-h-[60px] resize-none"
              value={option.notes}
              onChange={(e) => update((o) => { o.notes = e.target.value; })}
            />
          </div>
        </section>

        {/* Guides */}
        <section className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="aurelia-section-title">Guide Costs</h2>
            <button onClick={() => addGuide(optionId)} className="text-xs font-bold text-gold hover:underline flex items-center gap-1">
              <Plus size={12} /> Add Guide
            </button>
          </div>
          {option.guides.map((g, idx) => (
            <div key={g.id} className="flex space-x-2 mb-2 items-center">
              <input className="aurelia-input flex-1" value={g.label} onChange={(e) => update((o) => { o.guides[idx].label = e.target.value; })} />
              <select
                className="aurelia-input w-28"
                value={g.type}
                onChange={(e) => update((o) => { o.guides[idx].type = e.target.value as 'Fixed' | 'Per Pax'; })}
              >
                <option>Fixed</option>
                <option>Per Pax</option>
              </select>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                <input
                  type="number"
                  min={0}
                  className="aurelia-input w-24 pl-6"
                  value={g.amount}
                  onChange={(e) => update((o) => { o.guides[idx].amount = Math.max(0, Number(e.target.value)); })}
                />
              </div>
              <button onClick={() => deleteGuide(optionId, g.id)} className="p-2 text-muted-foreground hover:text-profit-negative transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </section>

        {/* Special Rules */}
        <section className="mb-10 aurelia-card p-6 space-y-6">
          <h2 className="aurelia-section-title">Special Rules</h2>

          {/* Min Ticket */}
          <div>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={option.rules.minTicket.enabled}
                onChange={(e) => update((o) => { o.rules.minTicket.enabled = e.target.checked; })}
                className="w-4 h-4 rounded accent-gold"
              />
              <span className="text-sm font-bold text-foreground">Minimum Ticket Purchase</span>
            </label>
            {option.rules.minTicket.enabled && (
              <div className="flex items-center space-x-3 mt-3 ml-7 text-xs">
                <span className="text-muted-foreground">Min block:</span>
                <input type="number" min={1} className="aurelia-input w-16" value={option.rules.minTicket.blockSize}
                  onChange={(e) => update((o) => { o.rules.minTicket.blockSize = Math.max(1, Number(e.target.value)); })} />
                <span className="text-muted-foreground">pax · Price per block: €</span>
                <input type="number" min={0} className="aurelia-input w-20" value={option.rules.minTicket.blockPrice}
                  onChange={(e) => update((o) => { o.rules.minTicket.blockPrice = Math.max(0, Number(e.target.value)); })} />
              </div>
            )}
            {option.rules.minTicket.enabled && totalPax > 0 && (
              <p className="text-[10px] text-muted-foreground/60 ml-7 mt-2">
                ceil({totalPax}/{option.rules.minTicket.blockSize}) × €{option.rules.minTicket.blockPrice} = €
                {Math.ceil(totalPax / Math.max(1, option.rules.minTicket.blockSize)) * option.rules.minTicket.blockPrice}
              </p>
            )}
          </div>

          {/* RTS */}
          <div>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={option.rules.rts.enabled}
                onChange={(e) => update((o) => { o.rules.rts.enabled = e.target.checked; })}
                className="w-4 h-4 rounded accent-gold"
              />
              <span className="text-sm font-bold text-foreground">Right to Speak (RTS)</span>
            </label>
            {option.rules.rts.enabled && (
              <div className="flex items-center space-x-2 mt-3 ml-7 text-xs flex-wrap gap-y-2">
                <span className="text-muted-foreground">Tier 1: 0 to</span>
                <input type="number" min={0} className="aurelia-input w-12" value={option.rules.rts.t1Max}
                  onChange={(e) => update((o) => { o.rules.rts.t1Max = Math.max(0, Number(e.target.value)); })} />
                <span className="text-muted-foreground">pax = €</span>
                <input type="number" min={0} className="aurelia-input w-16" value={option.rules.rts.t1Price}
                  onChange={(e) => update((o) => { o.rules.rts.t1Price = Math.max(0, Number(e.target.value)); })} />
                <span className="text-muted-foreground ml-2">|</span>
                <span className="text-muted-foreground ml-2">Tier 2: {option.rules.rts.t1Max + 1}+ pax = €</span>
                <input type="number" min={0} className="aurelia-input w-16" value={option.rules.rts.t2Price}
                  onChange={(e) => update((o) => { o.rules.rts.t2Price = Math.max(0, Number(e.target.value)); })} />
              </div>
            )}
          </div>

          {/* Tier Pricing */}
          <div>
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={option.rules.tierPricing.enabled}
                  onChange={(e) => update((o) => { o.rules.tierPricing.enabled = e.target.checked; })}
                  className="w-4 h-4 rounded accent-gold"
                />
                <span className="text-sm font-bold text-foreground">Tier Pricing</span>
              </label>
              {option.rules.tierPricing.enabled && (
                <button onClick={() => addTier(optionId)} className="text-xs font-bold text-gold hover:underline">+ Add Tier</button>
              )}
            </div>
            {option.rules.tierPricing.enabled && (
              <div className="mt-3 ml-7 space-y-2">
                {option.rules.tierPricing.tiers.map((tier, idx) => (
                  <div key={tier.id} className="flex items-center space-x-2 text-xs">
                    <input type="number" min={0} className="aurelia-input w-16" value={tier.min}
                      onChange={(e) => update((o) => { o.rules.tierPricing.tiers[idx].min = Math.max(0, Number(e.target.value)); })} />
                    <span className="text-muted-foreground">to</span>
                    <input type="number" min={0} className="aurelia-input w-16" value={tier.max}
                      onChange={(e) => update((o) => { o.rules.tierPricing.tiers[idx].max = Math.max(0, Number(e.target.value)); })} />
                    <span className="text-muted-foreground">pax = €</span>
                    <input type="number" min={0} className="aurelia-input w-20" value={tier.price}
                      onChange={(e) => update((o) => { o.rules.tierPricing.tiers[idx].price = Math.max(0, Number(e.target.value)); })} />
                    <button onClick={() => deleteTier(optionId, tier.id)} className="text-muted-foreground hover:text-profit-negative">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Extra Costs */}
        <section className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="aurelia-section-title">Extra Costs</h2>
            <button onClick={() => addExtraCost(optionId)} className="text-xs font-bold text-gold hover:underline flex items-center gap-1">
              <Plus size={12} /> Add Cost
            </button>
          </div>
          {option.extraCosts.map((ec, idx) => (
            <div key={ec.id} className="flex space-x-2 mb-2 items-center">
              <input className="aurelia-input flex-1" value={ec.label}
                onChange={(e) => update((o) => { o.extraCosts[idx].label = e.target.value; })} />
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">€</span>
                <input type="number" min={0} className="aurelia-input w-24 pl-6" value={ec.amount}
                  onChange={(e) => update((o) => { o.extraCosts[idx].amount = Math.max(0, Number(e.target.value)); })} />
              </div>
              <button onClick={() => deleteExtraCost(optionId, ec.id)} className="p-2 text-muted-foreground hover:text-profit-negative transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </section>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-[420px] bg-card overflow-y-auto p-8 border-l border-border flex-shrink-0">
        {/* Channel tabs */}
        <div className="flex space-x-1 bg-background p-1 rounded-xl mb-8 flex-wrap gap-y-1">
          {option.channels.map((c, idx) => (
            <button
              key={c.id}
              onClick={() => setActiveChannelIdx(idx)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-w-[60px] ${
                activeChannelIdx === idx
                  ? 'bg-card text-gold shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.name}
            </button>
          ))}
          <div className="relative">
            <button
              onClick={() => setShowAddChannel(!showAddChannel)}
              className="py-2 px-3 text-xs font-bold text-gold rounded-lg hover:bg-card transition-all"
            >
              +
            </button>
            {showAddChannel && (
              <div className="absolute right-0 top-10 z-50 aurelia-card p-2 min-w-[140px]">
                {CHANNEL_PRESETS.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => {
                      const name = ch === 'Custom' ? prompt('Channel name:') || 'Custom' : ch;
                      addChannel(optionId, name);
                      setShowAddChannel(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-hover rounded transition-colors"
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Channel Settings */}
        <section className="mb-6">
          <h3 className="aurelia-section-title mb-3">Channel Settings</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Commission %</label>
              <input
                type="number" min={0} max={100}
                className="aurelia-input font-bold"
                value={channel.commission}
                onChange={(e) => update((o) => { o.channels[activeChannelIdx].commission = Math.max(0, Number(e.target.value)); })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Promotion %</label>
              <input
                type="number" min={0} max={100}
                className="aurelia-input font-bold"
                value={channel.promo}
                onChange={(e) => update((o) => { o.channels[activeChannelIdx].promo = Math.max(0, Number(e.target.value)); })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 aurelia-card p-3">
            <span className="text-sm font-semibold text-foreground">VAT</span>
            <input
              type="checkbox"
              checked={channel.vatEnabled}
              onChange={(e) => update((o) => { o.channels[activeChannelIdx].vatEnabled = e.target.checked; })}
              className="w-4 h-4 rounded accent-gold cursor-pointer"
            />
          </div>

          {channel.vatEnabled && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">VAT Rate %</label>
                <input
                  type="number" min={0}
                  className="aurelia-input font-bold"
                  value={channel.vatRate}
                  onChange={(e) => update((o) => { o.channels[activeChannelIdx].vatRate = Math.max(0, Number(e.target.value)); })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">VAT Type</label>
                <select
                  className="aurelia-input font-bold"
                  value={channel.vatType}
                  onChange={(e) => update((o) => { o.channels[activeChannelIdx].vatType = e.target.value as 'Included' | 'On Payout' | 'On Gross'; })}
                >
                  <option value="Included">Included in price</option>
                  <option value="On Payout">On payout</option>
                  <option value="On Gross">On gross</option>
                </select>
              </div>
            </div>
          )}

          {option.channels.length > 1 && (
            <button
              onClick={() => {
                if (confirm(`Remove ${channel.name} channel?`)) {
                  deleteChannel(optionId, channel.id);
                  setActiveChannelIdx(0);
                }
              }}
              className="text-xs font-bold text-profit-negative hover:underline mt-3"
            >
              Remove this channel
            </button>
          )}
        </section>

        {/* Ticket Types */}
        <section className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <h3 className="aurelia-section-title">Ticket Types — {channel.name}</h3>
            <button onClick={() => addTicket(optionId, channel.id)} className="text-xs font-bold text-gold hover:underline flex items-center gap-1">
              <Plus size={12} /> Add Type
            </button>
          </div>
          <div className="space-y-2">
            {channel.tickets.map((t, idx) => {
              const pax = getAutoMappedPax(t, ageBuckets);
              return (
                <div key={t.id} className="aurelia-card p-3">
                  <div className="grid grid-cols-[1fr_60px_60px_70px_70px] gap-2 items-end">
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase">Name</label>
                      <input className="aurelia-input text-xs" value={t.type}
                        onChange={(e) => update((o) => { o.channels[activeChannelIdx].tickets[idx].type = e.target.value; })} />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase">Min</label>
                      <input type="number" min={0} className="aurelia-input text-xs text-center" value={t.minAge}
                        onChange={(e) => update((o) => { o.channels[activeChannelIdx].tickets[idx].minAge = Math.max(0, Number(e.target.value)); })} />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase">Max</label>
                      <input type="number" min={0} className="aurelia-input text-xs text-center" value={t.maxAge}
                        onChange={(e) => update((o) => { o.channels[activeChannelIdx].tickets[idx].maxAge = Math.max(0, Number(e.target.value)); })} />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase">Price €</label>
                      <input type="number" min={0} className="aurelia-input text-xs" value={t.price}
                        onChange={(e) => update((o) => { o.channels[activeChannelIdx].tickets[idx].price = Math.max(0, Number(e.target.value)); })} />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase">Cost €</label>
                      <input type="number" min={0} className="aurelia-input text-xs" value={t.cost}
                        onChange={(e) => update((o) => { o.channels[activeChannelIdx].tickets[idx].cost = Math.max(0, Number(e.target.value)); })} />
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/50">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      Auto-mapped pax: <span className="font-bold text-foreground">{pax}</span>
                    </span>
                    <button onClick={() => deleteTicket(optionId, channel.id, t.id)} className="p-1 text-muted-foreground hover:text-profit-negative transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Live Calculation Breakdown */}
        <div className="aurelia-card p-5">
          <h3 className="aurelia-section-title mb-4">Live Calculation</h3>

          <ResultRow label="Gross Revenue" value={metrics?.grossRevenue ?? 0} />
          <ResultRow label={`After Promo (${channel.promo}%)`} value={metrics?.priceAfterPromo ?? 0} />
          <ResultRow label={`After Commission (${channel.commission}%)`} value={metrics?.netRevenue ?? 0} />

          <div className="border-t border-border my-3" />

          <ResultRow label="Ticket Costs" value={metrics?.ticketCosts ?? 0} isCost />
          <ResultRow label="Guide Costs" value={metrics?.guideCosts ?? 0} isCost />
          <ResultRow label="RTS" value={metrics?.rtsCost ?? 0} isCost />
          <ResultRow label="Min Ticket" value={metrics?.minTicketCost ?? 0} isCost />
          <ResultRow label="Extra Costs" value={metrics?.extraCosts ?? 0} isCost />

          <div className="border-t border-border my-3" />

          <ResultRow label="Gross Profit" value={metrics?.grossProfit ?? 0} />
          {channel.vatEnabled && (
            <ResultRow label="VAT" value={metrics?.vatAmount ?? 0} isCost />
          )}

          <div className="pt-4 border-t border-border mt-3">
            <div className="flex justify-between items-end">
              <span className="aurelia-section-title">Net Profit</span>
              <span
                className={`text-2xl font-black tabular-nums transition-colors duration-200 ${
                  metrics && metrics.netProfit > 0 ? 'text-profit-positive' : 'text-profit-negative'
                }`}
              >
                {formatEuroDetailed(metrics?.netProfit ?? 0)}
              </span>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                Margin: {metrics?.margin?.toFixed(1) ?? '0.0'}%
              </span>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                Break-even: {metrics?.breakEven?.toFixed(1) ?? '0.0'} pax
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
