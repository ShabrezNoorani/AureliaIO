import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from '@/context/AuthContext';

export interface Booking {
  id?: string;
  user_id?: string;
  booking_ref: string;
  ext_ref: string;
  product_name: string;
  option_name: string;
  customer_name: string;
  customer_phone: string;
  booking_date: string;
  travel_date: string;
  travel_time: string;
  channel: string;
  promo_code: string;
  pax_adult: number;
  pax_youth: number;
  pax_child: number;
  pax_infant: number;
  gross_revenue: number;
  commission_rate: number;
  commission_amount: number;
  net_revenue: number;
  ticket_cost: number;
  guide_cost: number;
  extra_cost: number;
  net_profit: number;
  status: 'UPCOMING' | 'DONE' | 'NO_SHOW' | 'CANCELLED_EARLY' | 'CANCELLED_LATE';
  notes: string;
  created_at?: string;
}

export const EMPTY_BOOKING: Booking = {
  booking_ref: '',
  ext_ref: '',
  product_name: '',
  option_name: '',
  customer_name: '',
  customer_phone: '',
  booking_date: new Date().toISOString().slice(0, 10),
  travel_date: new Date().toISOString().slice(0, 10),
  travel_time: '09:00',
  channel: 'Viator',
  promo_code: '',
  pax_adult: 0,
  pax_youth: 0,
  pax_child: 0,
  pax_infant: 0,
  gross_revenue: 0,
  commission_rate: 30,
  commission_amount: 0,
  net_revenue: 0,
  ticket_cost: 0,
  guide_cost: 0,
  extra_cost: 0,
  net_profit: 0,
  status: 'UPCOMING',
  notes: '',
};

export const COMMISSION_DEFAULTS: Record<string, number> = {
  Viator: 30, GYG: 30, Airbnb: 25, Website: 0, Agent: 15, Other: 0,
};

export function useBookings() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .order('travel_date', { ascending: false });
      if (error) throw error;
      setBookings((data as Booking[]) || []);
    } catch (err) {
      console.error('Error fetching bookings:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const addBooking = useCallback(async (booking: Booking) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('bookings').insert({
        ...booking,
        user_id: user.id,
      });
      if (error) throw error;
      await fetchBookings();
    } catch (err) {
      console.error('Error adding booking:', err);
      throw err;
    }
  }, [user, fetchBookings]);

  const updateBooking = useCallback(async (id: string, booking: Partial<Booking>) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update(booking)
        .eq('id', id);
      if (error) throw error;
      await fetchBookings();
    } catch (err) {
      console.error('Error updating booking:', err);
      throw err;
    }
  }, [fetchBookings]);

  const deleteBooking = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchBookings();
    } catch (err) {
      console.error('Error deleting booking:', err);
      throw err;
    }
  }, [fetchBookings]);

  const bulkInsert = useCallback(async (rows: Booking[]) => {
    if (!user) return { inserted: 0, skipped: 0 };
    const existingRefs = new Set(bookings.map((b) => b.booking_ref));
    const toInsert: Booking[] = [];
    let skipped = 0;
    for (const row of rows) {
      if (row.booking_ref && existingRefs.has(row.booking_ref)) {
        skipped++;
      } else {
        toInsert.push({ ...row, user_id: user.id } as Booking);
      }
    }
    if (toInsert.length > 0) {
      try {
        const { error } = await supabase.from('bookings').insert(toInsert);
        if (error) throw error;
      } catch (err) {
        console.error('Error bulk inserting:', err);
        throw err;
      }
    }
    await fetchBookings();
    return { inserted: toInsert.length, skipped };
  }, [user, bookings, fetchBookings]);

  return { bookings, loading, addBooking, updateBooking, deleteBooking, bulkInsert, refresh: fetchBookings };
}
