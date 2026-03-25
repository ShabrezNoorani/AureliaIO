import { supabase } from './supabase';

export async function setupGuideTables() {
  try {
    // Check if guides table exists
    const { error } = await supabase.from('guides').select('id').limit(1);
    
    if (error && error.code === '42P01') { // 42P01 is Postgres code for undefined_table
      console.warn('Guides tables missing! Please run the setup SQL in the Supabase SQL Editor.');
    } else if (error) {
      console.error('Error checking guides table:', error);
    } else {
      console.log('Guide tables verified.');
    }
  } catch (err) {
    console.error('Setup check failed', err);
  }
}
