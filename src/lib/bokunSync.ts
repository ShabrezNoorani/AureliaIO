/**
 * Bokun API Sync Library
 * Authentication: HMAC-SHA1 signature using SubtleCrypto
 */

async function getBokunHeaders(
  accessKey: string,
  secretKey: string,
  method: string,
  path: string
): Promise<HeadersInit> {
  const date = new Date()
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19);
  
  const message = `${date}${accessKey}${method.toUpperCase()}${path}`;
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const msgData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', 
    keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false, 
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC', 
    cryptoKey, 
    msgData
  );
  
  const signatureB64 = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  );
  
  return {
    'X-Bokun-Date': date,
    'X-Bokun-AccessKey': accessKey,
    'X-Bokun-Signature': signatureB64,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
}

export async function fetchBokunProducts(
  accessKey: string,
  secretKey: string
): Promise<any[]> {
  const path = '/activity.json/product/list';
  const headers = await getBokunHeaders(accessKey, secretKey, 'GET', path);
  
  const response = await fetch(`https://api.bokun.io${path}`, { headers });
  if (!response.ok) throw new Error(`Bokun API error: ${response.statusText}`);
  
  const products = await response.json();
  
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
  accessKey: string,
  secretKey: string,
  userId: string,
  supabase: any,
  startDate: string,
  endDate: string
): Promise<{imported: number, updated: number, skipped: number}> {
  const path = '/activity.json/booking/list';
  const params = new URLSearchParams({
    startDate,
    endDate,
    includeCancelled: 'true'
  });
  
  const headers = await getBokunHeaders(accessKey, secretKey, 'GET', `${path}?${params.toString()}`);
  
  const response = await fetch(`https://api.bokun.io${path}?${params.toString()}`, { headers });
  if (!response.ok) throw new Error(`Bokun API error: ${response.statusText}`);
  
  const bookings = await response.json();
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const b of bookings) {
    try {
      const booking_ref = b.confirmationCode;
      const total_pax = b.participants || 0;
      
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

      const payload = {
        booking_ref,
        ext_ref: b.externalBookingRef || null,
        product_code: b.productBookings?.[0]?.product?.extranetRef || `P${b.productBookings?.[0]?.product?.id}`,
        option_name: b.productBookings?.[0]?.rate?.title || '',
        customer_name: `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.trim(),
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
        gross_revenue: b.totalPrice || 0,
        status: b.status === 'CONFIRMED' ? 'UPCOMING' :
                (b.status === 'DONE' || b.status === 'COMPLETED') ? 'DONE' :
                b.status === 'CANCELLED' ? 'CANCELLED_EARLY' :
                b.status === 'NO_SHOW' ? 'NO_SHOW' : 'UPCOMING',
        user_id: userId
      };

      const { data: existing } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_ref', booking_ref)
        .eq('user_id', userId)
        .single();

      if (existing) {
        await supabase.from('bookings').update(payload).eq('id', existing.id);
        updated++;
      } else {
        await supabase.from('bookings').insert(payload);
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
