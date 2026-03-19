import type { Option, Channel, Metrics, AgeBucket, Ticket } from './types';

/**
 * Auto-map pax from global age buckets to a ticket type based on age range overlap.
 * If any part of a bucket's age range overlaps with the ticket's age range, include it.
 */
export function getAutoMappedPax(ticket: Ticket, ageBuckets: AgeBucket[]): number {
  let pax = 0;
  for (const bucket of ageBuckets) {
    // Check if bucket range overlaps with ticket range
    if (bucket.minAge <= ticket.maxAge && bucket.maxAge >= ticket.minAge) {
      pax += bucket.count;
    }
  }
  return pax;
}

export const calculateMetrics = (
  option: Option,
  channel: Channel,
  ageBuckets: AgeBucket[],
): Metrics | null => {
  const tickets = channel.tickets;

  // 1. Auto-calculate pax from age buckets for each ticket
  const ticketPax = tickets.map((t) => ({
    ticketId: t.id,
    pax: getAutoMappedPax(t, ageBuckets),
  }));
  const totalPax = ticketPax.reduce((sum, tp) => sum + tp.pax, 0);
  if (totalPax === 0) return null;

  // 2. Tier Pricing — override ALL ticket prices by total pax
  let tierPriceOverride: number | null = null;
  if (option.rules.tierPricing.enabled) {
    const tier = option.rules.tierPricing.tiers.find(
      (t) => totalPax >= t.min && totalPax <= t.max
    );
    if (tier) tierPriceOverride = tier.price;
  }

  // 3. Gross Revenue = Σ(listing_price × pax)
  const grossRevenue = tickets.reduce((sum, t, i) => {
    const price = tierPriceOverride !== null ? tierPriceOverride : t.price;
    return sum + price * ticketPax[i].pax;
  }, 0);

  // 4. Price After Promo
  const priceAfterPromo = grossRevenue * (1 - channel.promo / 100);

  // 5. Net Revenue (after commission)
  const netRevenue = priceAfterPromo * (1 - channel.commission / 100);

  // 6. Ticket Costs
  const ticketCosts = tickets.reduce((sum, t, i) => sum + t.cost * ticketPax[i].pax, 0);

  // 7. Guide Costs
  const guideCosts = option.guides.reduce((sum, g) => {
    return sum + (g.type === 'Fixed' ? g.amount : g.amount * totalPax);
  }, 0);

  // 8. RTS Cost
  let rtsCost = 0;
  if (option.rules.rts.enabled) {
    rtsCost = totalPax <= option.rules.rts.t1Max
      ? option.rules.rts.t1Price
      : option.rules.rts.t2Price;
  }

  // 9. Min Ticket Cost
  let minTicketCost = 0;
  if (option.rules.minTicket.enabled && option.rules.minTicket.blockSize > 0) {
    minTicketCost =
      Math.ceil(totalPax / option.rules.minTicket.blockSize) *
      option.rules.minTicket.blockPrice;
  }

  // 10. Extra Costs
  const extraCostsTotal = option.extraCosts.reduce((sum, e) => sum + e.amount, 0);

  // 11. Total Costs
  const totalCosts = ticketCosts + guideCosts + rtsCost + minTicketCost + extraCostsTotal;

  // 12. Gross Profit
  const grossProfit = netRevenue - totalCosts;

  // 13. VAT
  let vatAmount = 0;
  if (channel.vatEnabled) {
    const rate = channel.vatRate / 100;
    if (channel.vatType === 'Included') {
      vatAmount = netRevenue - netRevenue / (1 + rate);
    } else if (channel.vatType === 'On Payout') {
      vatAmount = netRevenue * rate;
    } else if (channel.vatType === 'On Gross') {
      vatAmount = grossRevenue * rate;
    }
  }

  // 14. Net Profit
  const netProfit = grossProfit - vatAmount;

  // 15. Margin
  const margin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  // 16. Break-even
  const breakEven = netRevenue > 0 ? totalCosts / (netRevenue / totalPax) : 0;

  return {
    grossRevenue,
    priceAfterPromo,
    netRevenue,
    ticketCosts,
    guideCosts,
    rtsCost,
    minTicketCost,
    extraCosts: extraCostsTotal,
    totalCosts,
    grossProfit,
    vatAmount,
    netProfit,
    margin,
    breakEven,
    totalPax,
    ticketPax,
  };
};

export const formatEuro = (val: number): string =>
  '€' + val.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const formatEuroDetailed = (val: number): string =>
  '€' + val.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
