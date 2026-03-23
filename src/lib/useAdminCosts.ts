import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from '@/context/AuthContext';

export interface AdminCost {
  id?: string;
  user_id?: string;
  label: string;
  category: 'Marketing' | 'Salary' | 'Rent' | 'Tools' | 'Other';
  amount: number;
  month: number;  // 1-12
  year: number;
  created_at?: string;
}

export const ADMIN_CATEGORIES = ['Marketing', 'Salary', 'Rent', 'Tools', 'Other'] as const;

export function useAdminCosts() {
  const { user } = useAuth();
  const [costs, setCosts] = useState<AdminCost[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCosts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_costs')
        .select('*')
        .eq('user_id', user.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false });
      if (error) throw error;
      setCosts((data as AdminCost[]) || []);
    } catch (err) {
      console.error('Error fetching admin costs:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  const addCost = useCallback(async (cost: AdminCost) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('admin_costs').insert({
        ...cost,
        user_id: user.id,
      });
      if (error) throw error;
      await fetchCosts();
    } catch (err) {
      console.error('Error adding admin cost:', err);
      throw err;
    }
  }, [user, fetchCosts]);

  const updateCost = useCallback(async (id: string, cost: Partial<AdminCost>) => {
    try {
      const { error } = await supabase
        .from('admin_costs')
        .update(cost)
        .eq('id', id);
      if (error) throw error;
      await fetchCosts();
    } catch (err) {
      console.error('Error updating admin cost:', err);
      throw err;
    }
  }, [fetchCosts]);

  const deleteCost = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('admin_costs')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchCosts();
    } catch (err) {
      console.error('Error deleting admin cost:', err);
      throw err;
    }
  }, [fetchCosts]);

  return { costs, loading, addCost, updateCost, deleteCost, refresh: fetchCosts };
}
