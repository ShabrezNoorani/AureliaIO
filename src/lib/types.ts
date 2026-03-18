export interface Ticket {
  id: string;
  type: string;
  price: number;
  cost: number;
  minAge: number;
  maxAge: number;
  pax: number;
}

export interface Guide {
  id: string;
  label: string;
  type: 'Fixed' | 'Per Pax';
  amount: number;
}

export interface TierRow {
  id: string;
  min: number;
  max: number;
  price: number;
}

export interface Rules {
  minTicket: { enabled: boolean; blockSize: number; blockPrice: number };
  rts: { enabled: boolean; t1Max: number; t1Price: number; t2Price: number };
  tierPricing: { enabled: boolean; tiers: TierRow[] };
}

export interface ExtraCost {
  id: string;
  label: string;
  amount: number;
}

export interface Channel {
  id: string;
  name: string;
  commission: number;
  promo: number;
  vatEnabled: boolean;
  vatRate: number;
  vatType: 'Included' | 'On Payout' | 'On Gross';
}

export interface Option {
  id: string;
  name: string;
  bokunId: string;
  notes: string;
  tickets: Ticket[];
  guides: Guide[];
  rules: Rules;
  extraCosts: ExtraCost[];
  channels: Channel[];
}

export interface Product {
  id: string;
  name: string;
  options: Option[];
}

export interface AppData {
  companyName: string;
  products: Product[];
}

export interface Metrics {
  grossRevenue: number;
  priceAfterPromo: number;
  netRevenue: number;
  ticketCosts: number;
  guideCosts: number;
  rtsCost: number;
  minTicketCost: number;
  extraCosts: number;
  totalCosts: number;
  grossProfit: number;
  vatAmount: number;
  netProfit: number;
  margin: number;
  breakEven: number;
  totalPax: number;
}
