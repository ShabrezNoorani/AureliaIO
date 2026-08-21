import { callBokunProxy } from './bokunProxy';

export async function testBokunConnection(
  supabase: any
): Promise<any> {
  return await callBokunProxy(supabase, '/vendor.json/user/self', 'GET');
}

export async function fetchBokunProducts(
  supabase: any
): Promise<any[]> {
  const products = await callBokunProxy(supabase, '/vendor.json/product/list', 'GET');
  
  return products.map((product: any) => ({
    bokun_product_id: product.id || product.uuid,
    name: product.title,
    code: product.extranetRef || product.productCode || `P${product.id}`,
    options: product.rates?.map((rate: any) => ({
      bokun_rate_id: rate.id,
      name: rate.title,
      tickets: rate.pricingCategories?.map((cat: any) => ({
        type: cat.title,
        price: cat.defaultPrice || 0,
        minAge: cat.minAge || 0,
        maxAge: cat.maxAge || 99
      })) || []
    })) || []
  }));
}

export async function syncBokunBookings(
  supabase: any,
  userId: string,
  startDate: string,
  endDate: string
): Promise<{imported: number, updated: number, skipped: number}> {
  
  const body = {
    filter: {
      startDate,
      endDate,
      includeCancelled: true
    }
  };
  
  const searchResult = await callBokunProxy(supabase, '/booking.json/booking-search', 'POST', {}, body);
  // booking-search usually returns { items: [...] } or just [...]
  const bookings = searchResult.items || searchResult || [];

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  // Known ahead of time so gross_revenue can be handled correctly per row below: a brand-new
  // booking with no Bokun price yet should still write an explicit null (so it shows as "needs
  // input" instead of silently defaulting to €0), but an existing booking must never have a
  // blank Bokun value overwrite whatever's already in the ledger — owner-entered or from an
  // earlier sync.
  const { data: existingRows } = await supabase
    .from('bookings')
    .select('booking_ref')
    .eq('user_id', userId);
  const existingRefs = new Set((existingRows || []).map((r: any) => r.booking_ref));

  for (const b of bookings) {
    try {
      const booking_ref = b.confirmationCode;
      const total_pax = b.totalParticipants || b.participants || 0;
      
      // Basic pax type detection
      let pax_adult = 0, pax_youth = 0, pax_child = 0, pax_infant = 0;
      b.productBookings?.[0]?.unitBookings?.forEach((ub: any) => {
        const title = ub.pricingCategory?.title?.toLowerCase() || '';
        if (title.includes('adult')) pax_adult += ub.quantity;
        else if (title.includes('youth') || title.includes('teen')) pax_youth += ub.quantity;
        else if (title.includes('child')) pax_child += ub.quantity;
        else if (title.includes('infant') || title.includes('baby')) pax_infant += ub.quantity;
        else pax_adult += ub.quantity;
      });

      // Bokun can leave the price off a booking (same as GYG/Klook/KKday leaving it blank
      // elsewhere) — null, not 0, so it's distinguishable as "needs input" rather than a real €0.
      const grossRevenue = (b.totalPrice === null || b.totalPrice === undefined) ? null : b.totalPrice;

      const payload: Record<string, unknown> = {
        booking_ref,
        ext_ref: b.externalBookingRef || null,
        product_code: b.productBookings?.[0]?.product?.extranetRef || `P${b.productBookings?.[0]?.product?.id}`,
        option_name: b.productBookings?.[0]?.rate?.title || '',
        customer_name: `${b.customer?.firstName || b.customerName?.split(' ')[0] || ''} ${b.customer?.lastName || b.customerName?.split(' ').slice(1).join(' ') || ''}`.trim(),
        customer_phone: b.customer?.phoneNumber || null,
        travel_date: b.startDate,
        travel_time: b.startTime || '',
        booking_date: b.creationDate,
        channel: booking_ref.startsWith('VIA') ? 'Viator' :
                 (booking_ref.startsWith('GYG') || booking_ref.startsWith('GET')) ? 'GYG' :
                 booking_ref.startsWith('ABNB') ? 'Airbnb' :
                 b.channel || 'Other',
        pax_adult,
        pax_youth,
        pax_child,
        pax_infant,
        total_pax: total_pax || (pax_adult + pax_youth + pax_child + pax_infant),
        status: b.status === 'CONFIRMED' ? 'UPCOMING' :
                (b.status === 'DONE' || b.status === 'COMPLETED') ? 'DONE' :
                b.status === 'CANCELLED' ? 'CANCELLED_EARLY' :
                b.status === 'NO_SHOW' ? 'NO_SHOW' : 'UPCOMING',
        user_id: userId,
        sync_source: 'bokun'
      };

      // Only ever include gross_revenue when Bokun actually gave a price, or this booking has
      // never been synced before (nothing to protect yet, and writing the explicit null here is
      // what makes it show "needs input" instead of silently landing on the column's €0 default).
      // An already-known booking with a blank Bokun price keeps whatever value it already has.
      if (grossRevenue !== null || !existingRefs.has(booking_ref)) {
        payload.gross_revenue = grossRevenue;
      }

      const { error: upsertErr } = await supabase
        .from('bookings')
        .upsert(payload, {
          onConflict: 'booking_ref,user_id',
          ignoreDuplicates: false
        });

      if (upsertErr) {
        console.error(`Failed to upsert booking ${booking_ref}`, upsertErr);
        skipped++;
      } else {
        imported++; 
      }
    } catch (e) {
      console.error(`Failed to sync booking ${b.confirmationCode}`, e);
      skipped++;
    }
  }

  return { imported, updated, skipped };
}

export const syncFromBokun = syncBokunBookings;
