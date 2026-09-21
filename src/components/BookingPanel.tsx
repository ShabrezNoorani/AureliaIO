import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import type { Booking } from '@/lib/useBookings';
import { EMPTY_BOOKING, COMMISSION_DEFAULTS } from '@/lib/useBookings';
import { computeDerivedBookingFields } from '@/lib/bookingCalc';

interface BookingPanelProps {
  booking: Booking | null; // null = new booking
  productNames: string[];
  onSave: (booking: Booking) => void;
  onClose: () => void;
}

// Recomputes total_pax/commission_amount/net_revenue/net_profit on the way in, not just on the
// next edit — a legacy row saved before total_pax existed (or one a sync wrote without it) would
// otherwise show a stale/blank total the moment the panel opens, before the owner has touched
// anything.
const withFreshTotals = (b: Booking): Booking => ({ ...b, ...computeDerivedBookingFields(b) });

export default function BookingPanel({ booking, productNames, onSave, onClose }: BookingPanelProps) {
  const [draft, setDraft] = useState<Booking>(() => withFreshTotals(booking ? { ...booking } : { ...EMPTY_BOOKING }));

  useEffect(() => {
    setDraft(withFreshTotals(booking ? { ...booking } : { ...EMPTY_BOOKING }));
  }, [booking]);

  const update = <K extends keyof Booking>(field: K, value: Booking[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value };

      // Auto-fill commission rate on channel change
      if (field === 'channel') {
        next.commission_rate = COMMISSION_DEFAULTS[value as string] ?? 0;
      }

      // Cancelled early: zero out revenue + ticket cost — before the recompute below, so those
      // zeros flow straight into commission/net figures rather than needing a second branch there.
      if (next.status === 'CANCELLED_EARLY') {
        next.gross_revenue = 0;
        next.ticket_cost = 0;
      }

      // Auto-calculate financials — this preview and LedgerPage's actual save both run through
      // the SAME function (lib/bookingCalc.ts), so what the owner sees here is exactly what gets
      // persisted. Treats any still-blank input as 0 for the calculation only; never mutates the
      // blank field itself, which stays null (needs input) until the owner enters a value.
      return { ...next, ...computeDerivedBookingFields(next) };
    });
  };

  // Shared onChange for the five fields that can be blank ("needs input") — an emptied input
  // goes back to null rather than snapping to 0, so clearing a field is how the owner re-flags it
  // as unknown rather than asserting "this genuinely costs €0".
  const updateMoneyField = (field: 'gross_revenue' | 'ticket_cost' | 'guide_cost' | 'extra_cost' | 'gyg_cost', raw: string) => {
    update(field, raw === '' ? null : Math.max(0, Number(raw)));
  };

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
      <div className="fixed right-0 top-0 h-full w-full md:w-[560px] bg-card border-l border-border z-[201] overflow-y-auto animate-fade-in">
        <div className="p-4 md:p-8">
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
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product Code</label>
                <input
                  className="aurelia-input"
                  value={draft.product_code ?? ''}
                  onChange={(e) => update('product_code', e.target.value === '' ? null : e.target.value)}
                  placeholder="e.g. P13 or 5591586P13"
                />
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

          {/* Customer */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Customer</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer Name</label>
                <input className="aurelia-input" value={draft.customer_name} onChange={(e) => update('customer_name', e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer Phone</label>
                <input className="aurelia-input" value={draft.customer_phone} onChange={(e) => update('customer_phone', e.target.value)} placeholder="Optional" />
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
            <p className="text-xs text-muted-foreground mt-2 tabular-nums">Total: {draft.total_pax ?? 0} pax</p>
          </section>

          {/* Financials */}
          <section className="mb-8">
            <h3 className="aurelia-section-title mb-4">Financials</h3>
            <p className="text-xs text-muted-foreground mb-4 -mt-1">
              Any channel can leave revenue or cost blank in the booking data — those show as{' '}
              <span className="text-amber-700 font-semibold">Needs input</span> until entered here.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gross Revenue €</label>
                <input type="number" min={0} placeholder="Needs input"
                  className={`aurelia-input ${draft.gross_revenue === null ? 'border-amber-600/50 placeholder:text-amber-700/70' : ''}`}
                  value={draft.gross_revenue ?? ''}
                  onChange={(e) => updateMoneyField('gross_revenue', e.target.value)}
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
                <input type="number" min={0} placeholder="Needs input"
                  className={`aurelia-input ${draft.ticket_cost === null ? 'border-amber-600/50 placeholder:text-amber-700/70' : ''}`}
                  value={draft.ticket_cost ?? ''}
                  onChange={(e) => updateMoneyField('ticket_cost', e.target.value)}
                  disabled={draft.status === 'CANCELLED_EARLY'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Guide Cost €</label>
                <input type="number" min={0} placeholder="Needs input"
                  className={`aurelia-input ${draft.guide_cost === null ? 'border-amber-600/50 placeholder:text-amber-700/70' : ''}`}
                  value={draft.guide_cost ?? ''}
                  onChange={(e) => updateMoneyField('guide_cost', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Extra Cost €</label>
                <input type="number" min={0} placeholder="Needs input"
                  className={`aurelia-input ${draft.extra_cost === null ? 'border-amber-600/50 placeholder:text-amber-700/70' : ''}`}
                  value={draft.extra_cost ?? ''}
                  onChange={(e) => updateMoneyField('extra_cost', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">GYG Cost €</label>
                <input type="number" min={0} placeholder="Needs input"
                  className={`aurelia-input ${draft.gyg_cost === null ? 'border-amber-600/50 placeholder:text-amber-700/70' : ''}`}
                  value={draft.gyg_cost ?? ''}
                  onChange={(e) => updateMoneyField('gyg_cost', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Marketplace Fee €</label>
                <input type="number" className="aurelia-input bg-background/50" value={draft.marketplace_fee ?? 0} readOnly />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Net Profit</label>
                <input
                  type="text"
                  className={`aurelia-input bg-background/50 font-bold ${
                    draft.gross_revenue === null ? 'text-muted-foreground' :
                    draft.net_profit >= 0 ? 'text-profit-positive' : 'text-profit-negative'
                  }`}
                  value={draft.gross_revenue === null ? '—' : draft.net_profit}
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
              <div className="mt-3 p-3 rounded-lg bg-blue-600/10 border border-blue-600/20 text-xs text-blue-700">
                ℹ Revenue = €0. Ticket costs = €0 (refunded).
              </div>
            )}
            {draft.status === 'CANCELLED_LATE' && (
              <div className="mt-3 p-3 rounded-lg bg-orange-600/10 border border-orange-600/20 text-xs text-orange-700">
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
