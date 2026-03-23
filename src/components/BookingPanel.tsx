import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import type { Booking } from '@/lib/useBookings';
import { EMPTY_BOOKING, COMMISSION_DEFAULTS } from '@/lib/useBookings';

interface BookingPanelProps {
  booking: Booking | null; // null = new booking
  productNames: string[];
  onSave: (booking: Booking) => void;
  onClose: () => void;
}

export default function BookingPanel({ booking, productNames, onSave, onClose }: BookingPanelProps) {
  const [draft, setDraft] = useState<Booking>(() => booking ? { ...booking } : { ...EMPTY_BOOKING });

  useEffect(() => {
    setDraft(booking ? { ...booking } : { ...EMPTY_BOOKING });
  }, [booking]);

  const update = <K extends keyof Booking>(field: K, value: Booking[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };

      // Auto-fill commission rate on channel change
      if (field === 'channel') {
        next.commission_rate = COMMISSION_DEFAULTS[value as string] ?? 0;
      }

      // Auto-calculate financials
      next.commission_amount = +(next.gross_revenue * next.commission_rate / 100).toFixed(2);
      next.net_revenue = +(next.gross_revenue - next.commission_amount).toFixed(2);
      next.net_profit = +(next.net_revenue - next.ticket_cost - next.guide_cost - next.extra_cost).toFixed(2);

      // Cancelled early: zero out revenue + ticket cost
      if (next.status === 'CANCELLED_EARLY') {
        next.gross_revenue = 0;
        next.ticket_cost = 0;
        next.commission_amount = 0;
        next.net_revenue = 0;
        next.net_profit = +(0 - next.guide_cost - next.extra_cost).toFixed(2);
      }

      return next;
    });
  };

  const totalPax = draft.pax_adult + draft.pax_youth + draft.pax_child + draft.pax_infant;

  // Product autocomplete
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filteredProducts = useMemo(() => {
    if (!draft.product_name) return productNames;
    const q = draft.product_name.toLowerCase();
    return productNames.filter((p) => p.toLowerCase().includes(q));
  }, [draft.product_name, productNames]);

  const handleSubmit = () => {
    onSave(draft);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-[200]" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[560px] bg-card border-l border-border z-[201] overflow-y-auto animate-fade-in">
        <div className="p-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-lg font-bold text-foreground">
              {booking?.id ? 'Edit Booking' : 'Add Booking'}
            </h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Booking Info */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Booking Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Booking Ref</label>
                <input className="aurelia-input" value={draft.booking_ref} onChange={(e) => update('booking_ref', e.target.value)} placeholder="e.g. BR-20251234" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ext. Booking Ref</label>
                <input className="aurelia-input" value={draft.ext_ref} onChange={(e) => update('ext_ref', e.target.value)} placeholder="External reference" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Channel</label>
                <select className="aurelia-input" value={draft.channel} onChange={(e) => update('channel', e.target.value)}>
                  <option>Viator</option><option>GYG</option><option>Airbnb</option>
                  <option>Website</option><option>Agent</option><option>Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Promo Code</label>
                <input className="aurelia-input" value={draft.promo_code} onChange={(e) => update('promo_code', e.target.value)} placeholder="Optional" />
              </div>
            </div>
          </section>

          {/* Tour Info */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Tour Info</h3>
            <div className="space-y-3">
              <div className="space-y-1.5 relative">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product Name</label>
                <input
                  className="aurelia-input"
                  value={draft.product_name}
                  onChange={(e) => { update('product_name', e.target.value); setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Start typing to search..."
                />
                {showSuggestions && filteredProducts.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-50 aurelia-card p-1 max-h-36 overflow-y-auto">
                    {filteredProducts.map((p) => (
                      <button
                        key={p}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { update('product_name', p); setShowSuggestions(false); }}
                        className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-hover rounded transition-colors"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Option Name</label>
                <input className="aurelia-input" value={draft.option_name} onChange={(e) => update('option_name', e.target.value)} placeholder="e.g. Exterior Only" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea className="aurelia-input min-h-[50px] resize-none" value={draft.notes} onChange={(e) => update('notes', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Dates */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Dates</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Travel Date</label>
                <input type="date" className="aurelia-input" value={draft.travel_date} onChange={(e) => update('travel_date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Travel Time</label>
                <input type="time" className="aurelia-input" value={draft.travel_time} onChange={(e) => update('travel_time', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Booking Date</label>
                <input type="date" className="aurelia-input" value={draft.booking_date} onChange={(e) => update('booking_date', e.target.value)} />
              </div>
            </div>
          </section>

          {/* Passengers */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Passengers</h3>
            <div className="grid grid-cols-4 gap-3">
              {(['pax_adult', 'pax_youth', 'pax_child', 'pax_infant'] as const).map((field) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {field.replace('pax_', '')}
                  </label>
                  <input
                    type="number" min={0}
                    className="aurelia-input text-center"
                    value={draft[field]}
                    onChange={(e) => update(field, Math.max(0, Number(e.target.value)))}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 tabular-nums">Total: {totalPax} pax</p>
          </section>

          {/* Financials */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Financials</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gross Revenue €</label>
                <input type="number" min={0} className="aurelia-input" value={draft.gross_revenue}
                  onChange={(e) => update('gross_revenue', Math.max(0, Number(e.target.value)))}
                  disabled={draft.status === 'CANCELLED_EARLY'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Commission %</label>
                <input type="number" min={0} max={100} className="aurelia-input" value={draft.commission_rate}
                  onChange={(e) => update('commission_rate', Math.max(0, Number(e.target.value)))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Commission Amount</label>
                <input type="number" className="aurelia-input bg-background/50" value={draft.commission_amount} readOnly />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Net Revenue</label>
                <input type="number" className="aurelia-input bg-background/50" value={draft.net_revenue} readOnly />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Ticket Cost €</label>
                <input type="number" min={0} className="aurelia-input" value={draft.ticket_cost}
                  onChange={(e) => update('ticket_cost', Math.max(0, Number(e.target.value)))}
                  disabled={draft.status === 'CANCELLED_EARLY'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Guide Cost €</label>
                <input type="number" min={0} className="aurelia-input" value={draft.guide_cost}
                  onChange={(e) => update('guide_cost', Math.max(0, Number(e.target.value)))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Extra Cost €</label>
                <input type="number" min={0} className="aurelia-input" value={draft.extra_cost}
                  onChange={(e) => update('extra_cost', Math.max(0, Number(e.target.value)))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Net Profit</label>
                <input
                  type="number"
                  className={`aurelia-input bg-background/50 font-bold ${draft.net_profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'}`}
                  value={draft.net_profit}
                  readOnly
                />
              </div>
            </div>
          </section>

          {/* Status */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Status</h3>
            <select className="aurelia-input" value={draft.status} onChange={(e) => update('status', e.target.value as Booking['status'])}>
              <option value="UPCOMING">UPCOMING</option>
              <option value="DONE">DONE</option>
              <option value="NO_SHOW">NO SHOW</option>
              <option value="CANCELLED_EARLY">CANCELLED EARLY</option>
              <option value="CANCELLED_LATE">CANCELLED LATE</option>
            </select>
            {draft.status === 'CANCELLED_EARLY' && (
              <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
                ℹ Revenue = €0. Ticket costs = €0 (refunded).
              </div>
            )}
            {draft.status === 'CANCELLED_LATE' && (
              <div className="mt-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 text-xs text-orange-400">
                ⚠ Revenue kept. Ticket costs are a loss.
              </div>
            )}
          </section>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <button onClick={handleSubmit} className="aurelia-gold-btn flex-1">
              Save Booking
            </button>
            <button onClick={onClose} className="aurelia-ghost-btn flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
