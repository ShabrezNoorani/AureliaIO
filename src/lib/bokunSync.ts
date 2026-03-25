export async function generateSignature(
  secretKey: string,
  date: string, 
  accessKey: string,
  method: string,
  path: string
): Promise<string> {
  const message = date + "\n" + accessKey + "\n" + method + "\n" + path;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const msgData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData,
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC', cryptoKey, msgData
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function syncFromBokun(
  accessKey: string,
  secretKey: string, 
  userId: string,
  supabase: any,
  startDate: string,
  endDate: string
) {
  try {
    const listPath = `/activity.json/booking/list`;
    const params = new URLSearchParams({
      startDate,
      endDate,
      includeCancelled: 'true'
    });
    const urlPath = `${listPath}?${params.toString()}`;
    
    // Create Date header ("yyyy-MM-dd HH:mm:ss" UTC)
    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);
    
    // Signature
    const signature = await generateSignature(secretKey, dateStr, accessKey, 'GET', listPath);

    // Call Bokun API
    const response = await fetch(`https://api.bokun.io${urlPath}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Bokun-Date': dateStr,
        'X-Bokun-AccessKey': accessKey,
        'X-Bokun-Signature': signature
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Bokun API error:', response.status, errText);
      throw new Error(`Bokun API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.bookingList || !Array.isArray(data.bookingList)) {
      console.warn("Bokun returned unusual format or no bookings.", data);
      return { imported: 0, updated: 0, skipped: 0 };
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const b of data.bookingList) {
      if (!b.productBookings || b.productBookings.length === 0) {
        skipped++;
        continue;
      }

      const pb = b.productBookings[0];
      const booking_ref = b.confirmationCode || `BKN-${b.id}`;
      const ext_ref = b.externalBookingRef || null;
      const product_code = pb.product?.code || pb.product?.extranetRef || pb.product?.title || 'UNKNOWN';
      const option_name = pb.rate?.title || pb.rate?.id?.toString() || '';
      const customer_name = `${b.customer?.firstName || ''} ${b.customer?.lastName || ''}`.trim() || 'No Name';
      const customer_phone = b.customer?.phoneNumber || '';
      
      const travel_date = pb.date ? new Date(pb.date).toISOString().split('T')[0] : null;
      // Depending on the field, startTime may be a string like "10:00" or similar
      const travel_time = pb.startTime || '00:00'; 
      const booking_date = b.creationDate ? new Date(b.creationDate).toISOString().split('T')[0] : null;
      
      let channel = pb.channel?.title || 'Direct';
      if (booking_ref.startsWith('VIA')) channel = 'Viator';
      else if (booking_ref.startsWith('GYG') || booking_ref.startsWith('GET')) channel = 'GetYourGuide';
      else if (booking_ref.startsWith('ABNB')) channel = 'Airbnb';
      
      let pax_adult = 0, pax_youth = 0, pax_child = 0, pax_infant = 0;
      if (pb.passengers && Array.isArray(pb.passengers)) {
        for (const pax of pb.passengers) {
          const t = (pax.pricingCategory?.title || '').toLowerCase();
          if (t.includes('adult')) pax_adult++;
          else if (t.includes('youth') || t.includes('teen')) pax_youth++;
          else if (t.includes('child')) pax_child++;
          else if (t.includes('infant') || t.includes('baby')) pax_infant++;
          else pax_adult++; // default to adult if unknown
        }
      } else {
        pax_adult = pb.totalPassengers || 0;
      }
      
      const total_pax = pax_adult + pax_youth + pax_child + pax_infant;
      const gross_revenue = b.totalPrice || 0;
      
      let statusStr = b.status?.toUpperCase() || 'UPCOMING';
      let mappedStatus = 'UPCOMING';
      if (statusStr === 'CONFIRMED' || statusStr === 'ARRIVED') mappedStatus = 'UPCOMING';
      else if (statusStr === 'DONE' || statusStr === 'COMPLETED' || statusStr.includes('DONE')) mappedStatus = 'DONE';
      else if (statusStr === 'CANCELLED' || statusStr === 'CANCELED') mappedStatus = 'CANCELLED_EARLY';
      else if (statusStr === 'NO_SHOW' || statusStr.includes('SHOW')) mappedStatus = 'NO_SHOW';

      const bookingData = {
        user_id: userId,
        booking_ref: booking_ref.toString().trim(),
        ext_ref: ext_ref ? ext_ref.toString().trim() : null,
        product_code: product_code.toString().trim(),
        option_name: option_name.toString().trim(),
        customer_name: customer_name.toString().trim(),
        customer_phone: customer_phone.toString().trim(),
        travel_date,
        travel_time,
        booking_date,
        channel,
        pax_adult,
        pax_youth,
        pax_child,
        pax_infant,
        total_pax,
        gross_revenue,
        status: mappedStatus
      };

      // Upsert into Supabase
      const { data: existing, error: findErr } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('user_id', userId)
        .eq('booking_ref', bookingData.booking_ref)
        .single();
        
      if (existing) {
        if (existing.status !== bookingData.status) {
          await supabase.from('bookings').update(bookingData).eq('id', existing.id);
          updated++;
        } else {
          skipped++;
        }
      } else {
        await supabase.from('bookings').insert(bookingData);
        imported++;
      }
    }

    return { imported, updated, skipped };

  } catch (error) {
    console.error("Bokun Sync error:", error);
    throw error;
  }
}
