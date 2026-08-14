import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar as CalendarIcon, Compass, Users } from 'lucide-react';

const paxTotal = (b: any) =>
  (Number(b?.pax_adult) || 0) + (Number(b?.pax_youth) || 0) + (Number(b?.pax_child) || 0) + (Number(b?.pax_infant) || 0);

export default function GuideHome() {
  const { guideId, guideName, guideUserId } = useAuth();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date().toISOString().split('T')[0];
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  useEffect(() => {
    const load = async () => {
      if (!guideId || !guideUserId) return;
      setLoading(true);

      const [aRes, bRes] = await Promise.all([
        supabase.from('guide_assignments').select('*').eq('user_id', guideUserId).eq('guide_id', guideId).eq('travel_date', today),
        supabase.from('bookings').select('*').eq('user_id', guideUserId).eq('travel_date', today).not('status', 'in', '("CANCELLED_EARLY","CANCELLED_LATE")'),
      ]);

      if (aRes.data) setAssignments(aRes.data);
      if (bRes.data) setBookings(bRes.data);
      setLoading(false);
    };
    load();
  }, [guideId, guideUserId, today]);

  // Only the tour groups (time + product + option) this guide is actually assigned to today.
  const myTourGroups = useMemo(() => {
    const grouped: Record<string, Record<string, Record<string, any[]>>> = {};
    bookings.forEach(b => {
      const time = b.travel_time || 'No Time';
      const prod = b.product_name || b.product_code || 'Unknown Product';
      const opt = b.option_selected || b.option_name || 'Standard';
      if (!grouped[time]) grouped[time] = {};
      if (!grouped[time][prod]) grouped[time][prod] = {};
      if (!grouped[time][prod][opt]) grouped[time][prod][opt] = [];
      grouped[time][prod][opt].push(b);
    });

    const mine: any[][] = [];
    Object.keys(grouped).forEach(time => {
      Object.keys(grouped[time]).forEach(prod => {
        Object.keys(grouped[time][prod]).forEach(opt => {
          const isMine = assignments.some(a =>
            a.travel_time === time &&
            (a.product_code === prod || a.product_name === prod) &&
            a.option_name === opt
          );
          if (isMine) mine.push(grouped[time][prod][opt]);
        });
      });
    });
    return mine;
  }, [assignments, bookings]);

  const totalTours = myTourGroups.length;
  const totalPax = myTourGroups.reduce((sum, group) => sum + group.reduce((s, b) => s + paxTotal(b), 0), 0);

  return (
    <div className="p-4 md:p-8 pb-32 max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Welcome back, {guideName || 'Guide'} 👋</h1>
        <div className="flex items-center gap-2 text-muted-foreground font-medium">
          <CalendarIcon size={16} className="text-[#f5a623]" />
          <span>{todayStr}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="aurelia-card p-6 border-l-[3px] border-l-[#f5a623]">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <Compass size={14} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Tours Today</p>
              </div>
              <p className="text-3xl font-extrabold">{totalTours}</p>
            </div>
            <div className="aurelia-card p-6 border-l-[3px] border-l-blue-500">
              <div className="flex items-center gap-2 text-gray-400 mb-1">
                <Users size={14} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Expected Pax</p>
              </div>
              <p className="text-3xl font-extrabold">{totalPax}</p>
            </div>
          </div>

          {totalTours === 0 && (
            <div className="aurelia-card p-12 text-center flex flex-col items-center">
              <CalendarIcon size={48} className="text-muted-foreground/30 mb-4" />
              <h3 className="text-xl font-bold mb-2">No tours assigned today</h3>
              <p className="text-muted-foreground">Check back later or contact your coordinator.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
