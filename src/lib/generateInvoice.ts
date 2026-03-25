import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generateGuideInvoice(guide: any, assignments: any[], period: string, companyName: string = 'AURELIA') {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(20);
  doc.setTextColor(40, 40, 40);
  doc.text(`${companyName} — Guide Invoice`, 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Guide: ${guide?.name || 'Unknown'}`, 14, 30);
  doc.text(`Guide Number: ${guide?.guide_number || 'N/A'}`, 14, 35);
  doc.text(`Period: ${period}`, 14, 40);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 45);

  // Calculate totals
  const totalPay = assignments.reduce((sum, a) => sum + Number(a.calculated_pay || 0), 0);
  const totalPax = assignments.reduce((sum, a) => sum + Number(a.pax_count || 0), 0);

  // Table Data
  const tableData = assignments.map(a => [
    a.travel_date || '',
    a.travel_time || '',
    a.product_code || '',
    a.pax_count || 0,
    `EUR ${Number(a.calculated_pay || 0).toFixed(2)}`
  ]);

  // Add the table
  autoTable(doc, {
    startY: 55,
    head: [['Date', 'Time', 'Tours/Product', 'Pax', 'Pay']],
    body: tableData,
    foot: [['TOTAL', '', '', String(totalPax), `EUR ${totalPay.toFixed(2)}`]],
    theme: 'grid',
    headStyles: { fillColor: [42, 42, 62] },
    footStyles: { fillColor: [245, 166, 35], textColor: [0, 0, 0] }
  });

  doc.save(`Invoice_${guide?.name || 'Guide'}_${period}.pdf`);
}

export function generateBookingInvoice(booking: any, companyName: string = 'AURELIA') {
  const doc = new jsPDF();
  
  doc.setFontSize(20);
  doc.setTextColor(40, 40, 40);
  doc.text(`${companyName} — Booking Invoice`, 14, 22);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Booking Ref: ${booking.booking_ref}`, 14, 35);
  doc.text(`Customer Name: ${booking.customer_name}`, 14, 40);
  doc.text(`Travel Date: ${booking.travel_date} at ${booking.travel_time}`, 14, 45);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 50);

  const tableData = [
    [
      booking.product_code || 'Tour',
      booking.option_name || 'Standard',
      booking.total_pax || 0,
      `EUR ${Number(booking.gross_revenue || 0).toFixed(2)}`
    ]
  ];

  autoTable(doc, {
    startY: 60,
    head: [['Product Code', 'Option', 'Total Pax', 'Gross Revenue']],
    body: tableData,
    foot: [['TOTAL DUE', '', '', `EUR ${Number(booking.gross_revenue || 0).toFixed(2)}`]],
    theme: 'grid',
    headStyles: { fillColor: [42, 42, 62] },
    footStyles: { fillColor: [245, 166, 35], textColor: [0, 0, 0] }
  });

  doc.save(`Invoice_${booking.booking_ref}.pdf`);
}
