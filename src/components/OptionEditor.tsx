import { useState, useMemo } from 'react';
import { Trash2, Copy, ArrowLeft, Plus } from 'lucide-react';
import type { AppData, Option } from '@/lib/types';
import { calculateMetrics, formatEuroDetailed } from '@/lib/calculations';

const CHANNEL_PRESETS = ['Viator', 'GYG', 'Airbnb', 'Own Website', 'Agent', 'Custom'];

interface OptionEditorProps {
  data: AppData;
  optionId: string;
  initialChannelIdx?: number;
  onBack: () => void;
  updateOption: (optionId: string, updater: (o: Option) => void) => void;
  addTicket: (optionId: string) => void;
  deleteTicket: (optionId: string, ticketId: string) => void;
  addGuide: (optionId: string) => void;
  deleteGuide: (optionId: string, guideId: string) => void;
  addExtraCost: (optionId: string) => void;
  deleteExtraCost: (optionId: string, costId: string) => void;
  addTier: (optionId: string) => void;
  deleteTier: (optionId: string, tierId: string) => void;
  addChannel: (optionId: string, name: string) => void;
  deleteChannel: (optionId: string, channelId: string) => void;
}

function ResultRow({ label, value, subText }: { label: string; value: number; subText?: string }) {
  return (
    <div className="flex justify-between items-center py-2">
      <div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {subText && <div className="text-[10px] text-muted-foreground/70">{subText}</div>}
      </div>
      <div className="text-sm font-bold tabular-nums text-foreground">
        {formatEuroDetailed(value || 0)}
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

  const metrics = useMemo(() => {
    if (!option || !channel) return null;
    return calculateMetrics(option, channel);
  }, [option, channel]);

  if (!option || !channel) return null;

  const update = (updater: (o: Option) => void) => updateOption(optionId, updater);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* LEFT PANEL */}
      <div className="flex-1 overflow-y-auto p-8 bg-card">
        <button
          onClick={onBack}
          className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-8 flex items-center hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} className="mr-2" />
          Back to Dashboard
        </button>

        <div className="max-w-2xl">
          {/* Basic Info */}
          <section className="mb-10">
            <h2 className="aurelia-section-title mb-6">Basic Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Option Name</label>
                <input
                  className="aurelia-input"
                  value={option.name}
                  onChange={(e) => update((o) => { o.name = e.target.value; })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-muted-foreground">Bokun Product ID</label>
                <input
                  className="aurelia-input"
                  value={option.bokunId}
                  onChange={(e) => update((o) => { o.bokunId = e.target.value; })}
                />
              </div>
            </div>
            <div className="space-y-1 mt-4">
              <label className="text-xs font-bold text-muted-foreground">Notes</label>
              <textarea
                className="aurelia-input min-h-[60px] resize-none"
                value={option.notes}
                onChange={(e) => update((o) => { o.notes = e.target.value; })}
              />
            </div>
          </section>

          {/* Tickets */}
          <section className="mb-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="aurelia-section-title">Ticket Types</h2>
              <button onClick={() => addTicket(optionId)} className="text-xs font-bold text-gold hover:underline flex items-center gap-1">
                <Plus size={12} /> Add Type
              </button>
            </div>
            <div className="space-y-2">
              {option.tickets.map((t, idx) => (
                <div key={t.id} className="grid grid-cols-6 gap-2 items-end">
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground">Type</label>
                    <input className="aurelia-input" value={t.type} onChange={(e) => update((o) => { o.tickets[idx].type = e.target.value; })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground">Price €</label>
                    <input type="number" className="aurelia-input" value={t.price} onChange={(e) => update((o) => { o.tickets[idx].price = Number(e.target.value); })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground">Cost €</label>
                    <input type="number" className="aurelia-input" value={t.cost} onChange={(e) => update((o) => { o.tickets[idx].cost = Number(e.target.value); })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground">Age</label>
                    <div className="flex items-center gap-1">
                      <input type="number" className="aurelia-input w-12 text-center" value={t.minAge} onChange={(e) => update((o) => { o.tickets[idx].minAge = Number(e.target.value); })} />
                      <span className="text-muted-foreground text-xs">-</span>
                      <input type="number" className="aurelia-input w-12 text-center" value={t.maxAge} onChange={(e) => update((o) => { o.tickets[idx].maxAge = Number(e.target.value); })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground">Pax</label>
                    <input type="number" className="aurelia-input" value={t.pax} onChange={(e) => update((o) => { o.tickets[idx].pax = Number(e.target.value); })} />
                  </div>
                  <button onClick={() => deleteTicket(optionId, t.id)} className="p-2 text-muted-foreground hover:text-profit-negative transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
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
                <input type="number" className="aurelia-input w-24" value={g.amount} onChange={(e) => update((o) => { o.guides[idx].amount = Number(e.target.value); })} />
                <button onClick={() => deleteGuide(optionId, g.id)} className="p-2 text-muted-foreground hover:text-profit-negative transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>

          {/* Special Rules */}
          <section className="mb-10 bg-secondary/50 p-6 rounded-2xl space-y-6">
            <h2 className="aurelia-section-title">Special Rules</h2>

            {/* Min Ticket */}
            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={option.rules.minTicket.enabled}
                    onChange={(e) => update((o) => { o.rules.minTicket.enabled = e.target.checked; })}
                    className="w-4 h-4 rounded accent-gold"
                  />
                  <span className="text-sm font-bold text-foreground">Minimum Ticket Purchase</span>
                </label>
              </div>
              {option.rules.minTicket.enabled && (
                <div className="flex items-center space-x-3 mt-3 ml-7 text-xs">
                  <span className="text-muted-foreground">Block size:</span>
                  <input type="number" className="aurelia-input w-16" value={option.rules.minTicket.blockSize} onChange={(e) => update((o) => { o.rules.minTicket.blockSize = Number(e.target.value); })} />
                  <span className="text-muted-foreground">Price per block €:</span>
                  <input type="number" className="aurelia-input w-20" value={option.rules.minTicket.blockPrice} onChange={(e) => update((o) => { o.rules.minTicket.blockPrice = Number(e.target.value); })} />
                </div>
              )}
            </div>

            {/* RTS */}
            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={option.rules.rts.enabled}
                    onChange={(e) => update((o) => { o.rules.rts.enabled = e.target.checked; })}
                    className="w-4 h-4 rounded accent-gold"
                  />
                  <span className="text-sm font-bold text-foreground">Right to Speak (RTS)</span>
                </label>
              </div>
              {option.rules.rts.enabled && (
                <div className="flex items-center space-x-2 mt-3 ml-7 text-xs flex-wrap gap-y-2">
                  <span className="text-muted-foreground">0 to</span>
                  <input type="number" className="aurelia-input w-12" value={option.rules.rts.t1Max} onChange={(e) => update((o) => { o.rules.rts.t1Max = Number(e.target.value); })} />
                  <span className="text-muted-foreground">pax = €</span>
                  <input type="number" className="aurelia-input w-16" value={option.rules.rts.t1Price} onChange={(e) => update((o) => { o.rules.rts.t1Price = Number(e.target.value); })} />
                  <span className="text-muted-foreground ml-2">|</span>
                  <span className="text-muted-foreground ml-2">{option.rules.rts.t1Max + 1}+ pax = €</span>
                  <input type="number" className="aurelia-input w-16" value={option.rules.rts.t2Price} onChange={(e) => update((o) => { o.rules.rts.t2Price = Number(e.target.value); })} />
                </div>
              )}
            </div>

            {/* Tier Pricing */}
            <div>
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-3">
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
                      <input type="number" className="aurelia-input w-16" value={tier.min} onChange={(e) => update((o) => { o.rules.tierPricing.tiers[idx].min = Number(e.target.value); })} />
                      <span className="text-muted-foreground">to</span>
                      <input type="number" className="aurelia-input w-16" value={tier.max} onChange={(e) => update((o) => { o.rules.tierPricing.tiers[idx].max = Number(e.target.value); })} />
                      <span className="text-muted-foreground">pax = €</span>
                      <input type="number" className="aurelia-input w-20" value={tier.price} onChange={(e) => update((o) => { o.rules.tierPricing.tiers[idx].price = Number(e.target.value); })} />
                      <button onClick={() => deleteTier(optionId, tier.id)} className="text-muted-foreground hover:text-profit-negative"><Trash2 size={12} /></button>
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
                <input className="aurelia-input flex-1" value={ec.label} onChange={(e) => update((o) => { o.extraCosts[idx].label = e.target.value; })} />
                <input type="number" className="aurelia-input w-24" value={ec.amount} onChange={(e) => update((o) => { o.extraCosts[idx].amount = Number(e.target.value); })} />
                <button onClick={() => deleteExtraCost(optionId, ec.id)} className="p-2 text-muted-foreground hover:text-profit-negative transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-[450px] bg-background overflow-y-auto p-8 border-l border-border">
        {/* Channel tabs */}
        <div className="flex space-x-1 bg-secondary p-1 rounded-xl mb-8 flex-wrap gap-y-1">
          {option.channels.map((c, idx) => (
            <button
              key={c.id}
              onClick={() => setActiveChannelIdx(idx)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all min-w-[60px] ${
                activeChannelIdx === idx
                  ? 'bg-card text-foreground shadow-sm'
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
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-secondary rounded transition-colors"
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Channel settings */}
        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="aurelia-section-title">Commission %</label>
              <input
                type="number"
                className="aurelia-input p-3 font-bold text-base"
                value={channel.commission}
                onChange={(e) => update((o) => { o.channels[activeChannelIdx].commission = Number(e.target.value); })}
              />
            </div>
            <div className="space-y-1">
              <label className="aurelia-section-title">Promotion %</label>
              <input
                type="number"
                className="aurelia-input p-3 font-bold text-base"
                value={channel.promo}
                onChange={(e) => update((o) => { o.channels[activeChannelIdx].promo = Number(e.target.value); })}
              />
            </div>
          </div>

          <div className="aurelia-card p-4 flex items-center justify-between">
            <span className="text-sm font-bold text-foreground">VAT Enabled</span>
            <input
              type="checkbox"
              checked={channel.vatEnabled}
              onChange={(e) => update((o) => { o.channels[activeChannelIdx].vatEnabled = e.target.checked; })}
              className="w-5 h-5 rounded accent-gold"
            />
          </div>

          {channel.vatEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="aurelia-section-title">VAT Rate %</label>
                <input
                  type="number"
                  className="aurelia-input p-3 font-bold"
                  value={channel.vatRate}
                  onChange={(e) => update((o) => { o.channels[activeChannelIdx].vatRate = Number(e.target.value); })}
                />
              </div>
              <div className="space-y-1">
                <label className="aurelia-section-title">VAT Type</label>
                <select
                  className="aurelia-input p-3 font-bold"
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
              className="text-xs font-bold text-profit-negative hover:underline"
            >
              Remove this channel
            </button>
          )}
        </div>

        {/* Live Results */}
        <div className="space-y-2">
          <h3 className="aurelia-section-title mb-4">Live Results</h3>
          <ResultRow label="Gross Revenue" value={metrics?.grossRevenue ?? 0} />
          <ResultRow label="Price After Promo" value={metrics?.priceAfterPromo ?? 0} />
          <ResultRow label="Net After Commission" value={metrics?.netRevenue ?? 0} />
          <div className="border-t border-border my-3" />
          <ResultRow label="Ticket Costs" value={metrics?.ticketCosts ?? 0} />
          <ResultRow label="Guide Costs" value={metrics?.guideCosts ?? 0} />
          <ResultRow label="RTS Cost" value={metrics?.rtsCost ?? 0} />
          <ResultRow label="Min Ticket Cost" value={metrics?.minTicketCost ?? 0} />
          <ResultRow label="Extra Costs" value={metrics?.extraCosts ?? 0} />
          <ResultRow label="Total Costs" value={metrics?.totalCosts ?? 0} subText="All operational costs" />
          <div className="border-t border-border my-3" />
          <ResultRow label="Gross Profit" value={metrics?.grossProfit ?? 0} />
          <ResultRow label="VAT Amount" value={metrics?.vatAmount ?? 0} />

          <div className="pt-4 border-t border-border mt-4">
            <div className="flex justify-between items-end">
              <span className="aurelia-section-title">Net Profit</span>
              <span
                className={`text-3xl font-black tabular-nums transition-colors duration-200 ${
                  metrics && metrics.netProfit > 0 ? 'text-profit-positive' : 'text-profit-negative'
                }`}
              >
                {formatEuroDetailed(metrics?.netProfit ?? 0)}
              </span>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs font-medium text-muted-foreground">
                Margin: {metrics?.margin?.toFixed(1) ?? '0.0'}%
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                Break-even: {metrics?.breakEven?.toFixed(1) ?? '0.0'} pax
              </span>
            </div>
          </div>
        </div>

        <button className="w-full mt-10 py-4 bg-sidebar-bg text-card rounded-xl font-bold text-sm flex items-center justify-center space-x-2 hover:opacity-90 transition-opacity">
          <Copy size={16} />
          <span>Copy to other channels</span>
        </button>
      </div>
    </div>
  );
}
