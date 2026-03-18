import type { Option, Channel, Metrics } from './types';

export const calculateMetrics = (
  option: Option,
  channel: Channel,
  globalPax?: number
): Metrics | null => {
  const totalPax = globalPax || option.tickets.reduce((sum, t) => sum + Number(t.pax), 0);
  if (totalPax === 0) return null;

  // 1. Tier Pricing
  let adultPriceOverride: number | null = null;
  if (option.rules.tierPricing.enabled) {
    const tier = option.rules.tierPricing.tiers.find(
      (t) => totalPax >= t.min && totalPax <= t.max
    );
    if (tier) adultPriceOverride = tier.price;
  }

  // 2. Gross Revenue
  const grossRevenue = option.tickets.reduce((sum, t) => {
    const price = t.type === 'Adult' && adultPriceOverride !== null ? adultPriceOverride : t.price;
    const pax = globalPax ? totalPax / option.tickets.length : t.pax;
    return sum + price * pax;
  }, 0);

  // 3. Price After Promo
  const priceAfterPromo = grossRevenue * (1 - channel.promo / 100);

  // 4. Net Revenue
  const netRevenue = priceAfterPromo * (1 - channel.commission / 100);

  // 5. Ticket Costs
  const ticketCosts = option.tickets.reduce((sum, t) => {
    const pax = globalPax ? totalPax / option.tickets.length : t.pax;
    return sum + t.cost * pax;
  }, 0);

  // 6. Guide Costs
  const guideCosts = option.guides.reduce((sum, g) => {
    return sum + (g.type === 'Fixed' ? g.amount : g.amount * totalPax);
  }, 0);

  // 7. RTS Cost
  let rtsCost = 0;
  if (option.rules.rts.enabled) {
    rtsCost = totalPax <= option.rules.rts.t1Max
      ? option.rules.rts.t1Price
      : option.rules.rts.t2Price;
  }

  // 8. Min Ticket Cost
  let minTicketCost = 0;
  if (option.rules.minTicket.enabled) {
    minTicketCost =
      Math.ceil(totalPax / option.rules.minTicket.blockSize) *
      option.rules.minTicket.blockPrice;
  }

  // 9. Extra Costs
  const extraCostsTotal = option.extraCosts.reduce((sum, e) => sum + e.amount, 0);

  // 10. Total Costs
  const totalCosts = ticketCosts + guideCosts + rtsCost + minTicketCost + extraCostsTotal;

  // 11. Gross Profit
  const grossProfit = netRevenue - totalCosts;

  // 12. VAT
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

  // 13. Net Profit
  const netProfit = grossProfit - vatAmount;

  // 14. Margin
  const margin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  // 15. Break-even
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
  };
};

export const formatEuro = (val: number): string =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);

export const formatEuroDetailed = (val: number): string =>
  new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
