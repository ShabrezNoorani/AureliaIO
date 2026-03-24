import type { SupabaseClient } from '@supabase/supabase-js';

// ──────────── Helpers ────────────

const CHANNEL_MAP: Record<string, string> = {
  Viator: 'Viator',
  GetYourGuide: 'GYG',
  Airbnb: 'Airbnb',
  Website: 'Website',
};

const STATUS_MAP: Record<string, string> = {
  DONE: 'DONE',
  CANCELLED: 'CANCELLED_EARLY',
  UPCOMING: 'UPCOMING',
  'NO SHOW': 'NO_SHOW',
  'No Show': 'NO_SHOW',
  'NO_SHOW': 'NO_SHOW',
  'NOSHOW': 'NO_SHOW',
};

const COST_CATEGORY_MAP: Record<string, string> = {
  'Software & IT': 'Tools',
  'Marketing & Ads': 'Marketing',
  'Booking Platform': 'Tools',
  Insurance: 'Other',
  Salary: 'Salary',
};

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseCsvText(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return lines.map((line) => {
    const vals: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { vals.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    vals.push(current.trim());
    return vals;
  });
}

function parseLongDate(dateStr: string): string | null {
  // "Monday, July 28, 2025" → "2025-07-28"
  if (!dateStr || !dateStr.trim()) return null;
  try {
    // Remove leading day name: "Monday, " etc.
    const withoutDay = dateStr.replace(/^\w+,\s*/, '');
    const d = new Date(withoutDay);
    if (isNaN(d.getTime())) {
      // Try parsing directly
      const d2 = new Date(dateStr);
      if (isNaN(d2.getTime())) return null;
      const y2 = d2.getFullYear();
      const m2 = String(d2.getMonth() + 1).padStart(2, '0');
      const day2 = String(d2.getDate()).padStart(2, '0');
      return `${y2}-${m2}-${day2}`;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

function parseEuro(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[€\s,]/g, '')) || 0;
}

function parseNum(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[^0-9.\-]/g, '')) || 0;
}

// ──────────── SYNC MASTER DATA ────────────

export async function syncMasterData(
  sheetId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{ imported: number; updated: number; skipped: number; error?: string }> {
  console.log('[GSheet Sync] Starting sync for userId:', userId);

  // Fetch CSV
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Master%20Data`;
  let csvText: string;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    csvText = await resp.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      imported: 0, updated: 0, skipped: 0,
      error: `Could not access Google Sheet. Make sure it is set to "Anyone with the link can view" in Google Sheets sharing settings. (${message})`,
    };
  }

  const rows = parseCsvText(csvText);
  console.log('[GSheet Sync] Total rows (including header):', rows.length);
  if (rows.length < 2) return { imported: 0, updated: 0, skipped: 0 };

  // Skip header (row 0)
  const dataRows = rows.slice(1);

  // Debug: log first 3 parsed rows
  for (let i = 0; i < Math.min(3, dataRows.length); i++) {
    console.log(`[GSheet Sync] Row ${i}:`, {
      bookingRef: dataRows[i][2],
      product: dataRows[i][5],
      channel: dataRows[i][11],
      grossRevenue: dataRows[i][17],
      travelDate: dataRows[i][9],
      status: dataRows[i][25],
    });
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const cols of dataRows) {
    const bookingRef = (cols[2] || '').trim();
    if (!bookingRef) { skipped++; continue; } // only skip if no booking ref

    const channel = CHANNEL_MAP[cols[11]] || 'Other';
    const grossRevenue = parseEuro(cols[17]);
    
    let commissionRateForm = parseFloat((cols[18] || '').replace(/[^0-9.]/g, '')) || 0;
    if (commissionRateForm > 0 && commissionRateForm <= 1) {
      commissionRateForm = +(commissionRateForm * 100).toFixed(2);
    }
    const commissionRate = commissionRateForm;
    const marketplaceFee = parseEuro(cols[19]);
    
    let commissionAmount = 0;
    if (marketplaceFee > 0) {
      commissionAmount = marketplaceFee;
    } else {
      commissionAmount = +(grossRevenue * commissionRate / 100).toFixed(2);
    }

    const netRevenue = parseEuro(cols[20]);
    const guideCost = parseEuro(cols[21]);
    const extraCost = parseEuro(cols[22]);
    const ticketCost = parseEuro(cols[23]);
    const netProfit = parseEuro(cols[24]);
    const statusRaw = (cols[25] || '').toUpperCase().trim();
    const status = STATUS_MAP[statusRaw] || 'UPCOMING';
    const assignedGuide = cols[26] || '';

    const travelDate = parseLongDate(cols[9]);
    const bookingDate = parseLongDate(cols[33]);

    const booking: Record<string, unknown> = {
      user_id: userId,
      booking_ref: bookingRef,
      ext_ref: cols[3] || '',
      product_name: cols[4] || '',
      option_name: cols[5] || '',
      customer_name: cols[6] || '',
      customer_phone: cols[7] || '',
      promo_code: cols[8] || '',
      travel_time: cols[10] || '',
      channel,
      pax_adult: parseNum(cols[12]),
      pax_youth: parseNum(cols[13]),
      pax_child: parseNum(cols[14]),
      pax_infant: parseNum(cols[15]),
      gross_revenue: grossRevenue,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      marketplace_fee: marketplaceFee,
      net_revenue: netRevenue,
      guide_cost: guideCost,
      extra_cost: extraCost,
      ticket_cost: ticketCost,
      net_profit: netProfit,
      status,
      assigned_guide: assignedGuide,
      notes: '',
    };

    // Only include dates if valid
    if (travelDate) booking.travel_date = travelDate;
    if (bookingDate) booking.booking_date = bookingDate;

    // Check if exists — with proper error handling
    const { data: existing, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_ref', bookingRef)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('[GSheet Sync] Check error for ref', bookingRef, ':', checkError);
      // Treat as new row — attempt insert
      const { error: insertErr } = await supabase
        .from('bookings')
        .insert(booking);
      if (insertErr) {
        console.error('[GSheet Sync] Insert error (after check fail):', insertErr);
        skipped++;
      } else {
        imported++;
      }
      continue;
    }

    if (existing?.id) {
      // Update existing row
      const { user_id: _uid, ...updateFields } = booking;
      const { error: updateErr } = await supabase
        .from('bookings')
        .update(updateFields)
        .eq('id', existing.id);
      if (updateErr) {
        console.error('[GSheet Sync] Update error:', updateErr);
        skipped++;
      } else {
        updated++;
      }
    } else {
      // Insert new row
      const { error: insertErr } = await supabase
        .from('bookings')
        .insert(booking);
      if (insertErr) {
        console.error('[GSheet Sync] Insert error:', insertErr);
        skipped++;
      } else {
        imported++;
      }
    }
  }

  console.log('[GSheet Sync] Done:', { imported, updated, skipped });
  return { imported, updated, skipped };
}

// ──────────── SYNC ADMIN COSTS ────────────

export async function syncAdminCosts(
  sheetId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{ imported: number; error?: string }> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Admin_Costs`;
  let csvText: string;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    csvText = await resp.text();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      imported: 0,
      error: `Could not access Google Sheet. Make sure it is set to "Anyone with the link can view" in Google Sheets sharing settings. (${message})`,
    };
  }

  const rows = parseCsvText(csvText);
  if (rows.length < 2) return { imported: 0 };

  const dataRows = rows.slice(1);
  let imported = 0;

  for (const cols of dataRows) {
    const label = cols[2] || '';
    if (!label) continue;

    const categoryRaw = cols[1] || '';
    const category = COST_CATEGORY_MAP[categoryRaw] || 'Other';
    const amount = parseEuro(cols[3]);

    // Parse "July 2025" → month=7, year=2025
    let month = new Date().getMonth() + 1;
    let year = new Date().getFullYear();
    const expenseMonth = cols[8] || '';
    if (expenseMonth) {
      const parts = expenseMonth.trim().split(/\s+/);
      if (parts.length >= 2) {
        const mi = FULL_MONTH_NAMES.indexOf(parts[0]);
        if (mi >= 0) month = mi + 1;
        const yr = parseInt(parts[1]);
        if (!isNaN(yr)) year = yr;
      }
    }

    const { error: insertErr } = await supabase.from('admin_costs').insert({
      user_id: userId,
      label,
      category,
      amount,
      month,
      year,
    });

    if (!insertErr) imported++;
  }

  return { imported };
}
