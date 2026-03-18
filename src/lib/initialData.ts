import type { AppData } from './types';

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
          tickets: [
            { id: 't1', type: 'Adult', price: 70, cost: 0, minAge: 18, maxAge: 99, pax: 2 },
            { id: 't2', type: 'Child', price: 30, cost: 0, minAge: 4, maxAge: 12, pax: 0 },
          ],
          guides: [{ id: 'g1', label: 'Guide 1', type: 'Fixed', amount: 60 }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: false, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            { id: 'c1', name: 'Viator', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included' },
            { id: 'c2', name: 'GYG', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included' },
            { id: 'c3', name: 'Airbnb', commission: 25, promo: 10, vatEnabled: false, vatRate: 20, vatType: 'Included' },
          ],
        },
        {
          id: 'opt-2',
          name: "Exterior + Interior",
          bokunId: "",
          notes: "",
          tickets: [
            { id: 't3', type: 'Adult', price: 99, cost: 0, minAge: 18, maxAge: 99, pax: 2 },
            { id: 't4', type: 'Child', price: 45, cost: 0, minAge: 4, maxAge: 12, pax: 0 },
          ],
          guides: [{ id: 'g2', label: 'Guide 1', type: 'Fixed', amount: 80 }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: true, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            { id: 'c4', name: 'Viator', commission: 30, promo: 15, vatEnabled: false, vatRate: 20, vatType: 'Included' },
            { id: 'c5', name: 'GYG', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included' },
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
          tickets: [
            { id: 't5', type: 'Adult', price: 109, cost: 28, minAge: 18, maxAge: 99, pax: 2 },
            { id: 't6', type: 'Child', price: 79, cost: 0, minAge: 4, maxAge: 12, pax: 0 },
          ],
          guides: [{ id: 'g3', label: 'Guide 1', type: 'Fixed', amount: 150 }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: true, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            { id: 'c6', name: 'Viator', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included' },
            { id: 'c7', name: 'GYG', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included' },
          ],
        },
      ],
    },
  ],
};
