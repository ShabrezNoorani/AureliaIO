import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Clock, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TodayToursPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const loadTodayBookings = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];

    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.id)
      .eq('travel_date', today)
      .order('travel_time', { ascending: true });

    if (data) setBookings(data);
    setLoading(false);
  };

  useEffect(() => {
    loadTodayBookings();
    const interval = setInterval(() => {
      loadTodayBookings();
    }, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [user]);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleMarkDone = async (bookingId: string) => {
    if (!user) return;
    
    // Optimistic update
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'DONE' } : b));
    
    await supabase
      .from('bookings')
      .update({ status: 'DONE' })
      .eq('id', bookingId)
      .eq('user_id', user.id);
  };

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const totalAdults = bookings.reduce((sum, b) => sum + (Number(b.adult) || 0), 0);
  const totalYouth = bookings.reduce((sum, b) => sum + (Number(b.youth) || 0), 0);
  const totalChildren = bookings.reduce((sum, b) => sum + (Number(b.children) || 0), 0);
  const totalNoShows = bookings.reduce((sum, b) => sum + (b.status === 'NO_SHOW' ? 1 : 0), 0);
  const totalTours = bookings.length;

  // Group by Time -> Product -> Option
  const grouped: Record<string, Record<string, Record<string, any[]>>> = {};

  bookings.forEach(b => {
    const time = b.travel_time || 'No Time';
    const prod = b.product_code || 'Unknown Product';
    const opt = b.option_selected || 'Standard';

    if (!grouped[time]) grouped[time] = {};
    if (!grouped[time][prod]) grouped[time][prod] = {};
    if (!grouped[time][prod][opt]) grouped[time][prod][opt] = [];

    grouped[time][prod][opt].push(b);
  });

  // Sort times natively
  const sortedTimes = Object.keys(grouped).sort((a,b) => {
    if(a === 'No Time') return 1;
    if(b === 'No Time') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="p-8 pb-32 max-w-5xl mx-auto space-y-8 animate-fade-in text-foreground">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-border/50">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Today's Tours</h1>
          <div className="flex items-center gap-2 text-muted-foreground font-medium">
            <CalendarIcon size={16} className="text-gold" />
            <span>{todayStr}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2 text-2xl font-mono font-bold text-gold drop-shadow-md mb-2">
            <Clock size={20} />
            <span>{timeStr}</span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="text-xs font-semibold text-muted-foreground bg-white/5 px-3 py-1 rounded-md border border-border">
              {totalTours} tours &middot; {totalAdults + totalYouth + totalChildren} pax &middot; <span className={totalNoShows > 0 ? "text-orange-400" : ""}>{totalNoShows} no-shows</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="aurelia-card p-12 text-center flex flex-col items-center max-w-md mx-auto mt-12">
          <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-bold mb-2">No tours scheduled for today</h3>
          <p className="text-muted-foreground mb-6">Check your ledger or sync from Google Sheets.</p>
        </div>
      ) : (
        <div className="space-y-12">
          {sortedTimes.map(time => (
            <div key={time} className="space-y-6">
              {/* TIME DIVIDER */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gold font-bold text-lg bg-gold/10 px-4 py-1.5 rounded-full border border-gold/20">
                  <Clock size={18} />
                  <span>{time}</span>
                </div>
                <div className="h-[1px] flex-1 bg-border/50" />
              </div>

              {/* PRODUCTS */}
              {Object.keys(grouped[time]).map(prod => (
                <div key={prod} className="pl-6 md:pl-10 space-y-4">
                  {Object.keys(grouped[time][prod]).map(opt => {
                    const rowBookings = grouped[time][prod][opt];
                    
                    return (
                      <div key={opt} className="aurelia-card overflow-hidden">
                        {/* Header */}
                        <div className="bg-surface-subtle px-5 py-3 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <h3 className="font-bold text-sm md:text-base">{prod} <span className="text-muted-foreground font-normal mx-2">—</span> <span className="text-gold">{opt}</span></h3>
                          <span className="text-xs font-semibold text-muted-foreground bg-background px-2.5 py-1 rounded border border-border">
                            {rowBookings.length} bookings
                          </span>
                        </div>

                        {/* Booking Rows */}
                        <div className="divide-y divide-border/30">
                          {rowBookings.map(b => {
                            const isDone = b.status?.toUpperCase() === 'DONE';
                            return (
                              <div key={b.id} className={`px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${isDone ? 'bg-profit-positive/5' : 'hover:bg-white/[0.02]'}`}>
                                {/* Left Info */}
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-center">
                                  <div className="font-mono text-xs text-muted-foreground">{b.booking_ref}</div>
                                  <div className="font-semibold text-sm truncate">{b.customer_name}</div>
                                  <div className="text-xs text-muted-foreground bg-background/50 w-fit px-2 py-1 rounded border border-border/50">
                                    <span className="font-bold text-foreground">A:{b.adult || 0}</span>
                                    {(b.youth > 0 || b.children > 0) && ' · '}
                                    {b.youth > 0 && `Y:${b.youth} `}
                                    {b.children > 0 && `C:${b.children}`}
                                  </div>
                                  <div className="font-mono text-sm font-bold text-gold">€{b.gross_revenue || 0}</div>
                                </div>

                                {/* Right Actions */}
                                <div className="flex items-center gap-4 justify-between md:justify-end min-w-[140px]">
                                  {isDone ? (
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-profit-positive tracking-wider uppercase">
                                      DONE <CheckCircle2 size={14} />
                                    </span>
                                  ) : b.status === 'NO_SHOW' ? (
                                    <span className="text-[10px] font-bold text-[#f5a623] bg-[#f5a623]/10 border border-[#f5a623]/20 px-2 py-1 rounded tracking-wider uppercase">
                                      NO SHOW
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase">
                                      {b.status || 'UPCOMING'}
                                    </span>
                                  )}
                                  
                                  {(!isDone && b.status !== 'NO_SHOW') && (
                                    <button 
                                      onClick={() => handleMarkDone(b.id)}
                                      className="px-4 py-1.5 rounded text-xs font-bold bg-white/5 border border-border hover:bg-profit-positive hover:text-white hover:border-profit-positive transition-all active:scale-95"
                                    >
                                      Mark Done
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
