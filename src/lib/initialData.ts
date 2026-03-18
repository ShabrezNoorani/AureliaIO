import type { AppData, Ticket } from './types';

const id = () => crypto.randomUUID();

const viatorTickets = (adultPrice: number, childPrice: number, adultCost = 0, childCost = 0): Ticket[] => [
  { id: id(), type: 'Adult', price: adultPrice, cost: adultCost, minAge: 18, maxAge: 70, pax: 0, mapsTo: 'Adult' },
  { id: id(), type: 'Children', price: childPrice, cost: childCost, minAge: 0, maxAge: 17, pax: 0, mapsTo: 'Children + Youth + Infant' },
];

const gygTickets = (adultPrice: number, childPrice: number, adultCost = 0, childCost = 0): Ticket[] => [
  { id: id(), type: 'Old', price: adultPrice, cost: adultCost, minAge: 71, maxAge: 120, pax: 0, mapsTo: 'None' },
  { id: id(), type: 'Adult', price: adultPrice, cost: adultCost, minAge: 18, maxAge: 70, pax: 0, mapsTo: 'Adult' },
  { id: id(), type: 'Children', price: childPrice, cost: childCost, minAge: 12, maxAge: 17, pax: 0, mapsTo: 'Youth' },
  { id: id(), type: 'Youth', price: childPrice, cost: childCost, minAge: 5, maxAge: 11, pax: 0, mapsTo: 'Children' },
  { id: id(), type: 'Infant', price: 0, cost: 0, minAge: 0, maxAge: 4, pax: 0, mapsTo: 'Infant' },
];

const airbnbTickets = (guestPrice: number, guestCost = 0): Ticket[] => [
  { id: id(), type: 'Guest', price: guestPrice, cost: guestCost, minAge: 0, maxAge: 99, pax: 0, mapsTo: 'All pax' },
];

export const INITIAL_DATA: AppData = {
  companyName: "Parisian Adventures",
  products: [
    {
      id: 'prod-1',
      name: "Notre Dame Tour",
      options: [
        {
          id: 'opt-1',
          name: "Exterior Only",
          bokunId: "1057128",
          notes: "",
          guides: [{ id: 'g1', label: 'Guide 1', type: 'Fixed', amount: 60 }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: false, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            { id: 'c1', name: 'Viator', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included', tickets: viatorTickets(70, 30) },
            { id: 'c2', name: 'GYG', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included', tickets: gygTickets(70, 30) },
            { id: 'c3', name: 'Airbnb', commission: 25, promo: 10, vatEnabled: false, vatRate: 20, vatType: 'Included', tickets: airbnbTickets(70) },
          ],
        },
        {
          id: 'opt-2',
          name: "Exterior + Interior",
          bokunId: "",
          notes: "",
          guides: [{ id: 'g2', label: 'Guide 1', type: 'Fixed', amount: 80 }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: true, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            { id: 'c4', name: 'Viator', commission: 30, promo: 15, vatEnabled: false, vatRate: 20, vatType: 'Included', tickets: viatorTickets(99, 45) },
            { id: 'c5', name: 'GYG', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included', tickets: gygTickets(99, 45) },
          ],
        },
      ],
    },
    {
      id: 'prod-2',
      name: "Louvre Tour",
      options: [
        {
          id: 'opt-3',
          name: "Standard Group",
          bokunId: "",
          notes: "",
          guides: [{ id: 'g3', label: 'Guide 1', type: 'Fixed', amount: 150 }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: true, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            { id: 'c6', name: 'Viator', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included', tickets: viatorTickets(109, 79, 28, 0) },
            { id: 'c7', name: 'GYG', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included', tickets: gygTickets(109, 79, 28, 0) },
          ],
        },
      ],
    },
  ],
};
