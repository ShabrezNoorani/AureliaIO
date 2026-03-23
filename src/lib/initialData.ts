import type { AppData, AgeBucket } from './types';

const id = () => crypto.randomUUID();

export const DEFAULT_AGE_BUCKETS: AgeBucket[] = [
  { id: 'bucket-senior', label: 'Senior', emoji: '👴', minAge: 65, maxAge: 120, count: 0 },
  { id: 'bucket-adult', label: 'Adult', emoji: '👤', minAge: 18, maxAge: 64, count: 0 },
  { id: 'bucket-youth', label: 'Youth', emoji: '🧑', minAge: 13, maxAge: 17, count: 0 },
  { id: 'bucket-child', label: 'Child', emoji: '👦', minAge: 5, maxAge: 12, count: 0 },
  { id: 'bucket-infant', label: 'Infant', emoji: '👶', minAge: 0, maxAge: 4, count: 0 },
];

export const INITIAL_DATA: AppData = {
  companyName: 'Scenic Zest Tours',
  ageBuckets: DEFAULT_AGE_BUCKETS.map((b) => ({ ...b })),
  products: [
    {
      id: 'prod-1',
      name: 'Notre Dame Tour',
      bokunId: '1057128',
      options: [
        {
          id: 'opt-1',
          name: 'Exterior Only',
          notes: '',
          guides: [{ id: id(), label: 'Guide 1', type: 'Fixed', amount: 60, tiers: [], maxPerGuide: 10, splitPriceMode: 'Fixed' }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: false, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            {
              id: id(), name: 'Viator', commission: 30, promo: 0,
              vatEnabled: false, vatRate: 20, vatType: 'Included',
              tickets: [
                { id: id(), type: 'Adult', price: 70, cost: 0, minAge: 18, maxAge: 70 },
                { id: id(), type: 'Children', price: 30, cost: 0, minAge: 0, maxAge: 17 },
              ],
            },
            {
              id: id(), name: 'GYG', commission: 30, promo: 0,
              vatEnabled: false, vatRate: 20, vatType: 'Included',
              tickets: [
                { id: id(), type: 'Adult', price: 70, cost: 0, minAge: 18, maxAge: 70 },
                { id: id(), type: 'Children', price: 30, cost: 0, minAge: 12, maxAge: 17 },
                { id: id(), type: 'Youth', price: 20, cost: 0, minAge: 5, maxAge: 11 },
                { id: id(), type: 'Infant', price: 0, cost: 0, minAge: 0, maxAge: 4 },
              ],
            },
            {
              id: id(), name: 'Airbnb', commission: 25, promo: 10,
              vatEnabled: false, vatRate: 20, vatType: 'Included',
              tickets: [
                { id: id(), type: 'Guest', price: 65, cost: 0, minAge: 0, maxAge: 99 },
              ],
            },
          ],
        },
        {
          id: 'opt-2',
          name: 'Exterior + Interior',
          notes: '',
          guides: [{ id: id(), label: 'Guide 1', type: 'Fixed', amount: 80, tiers: [], maxPerGuide: 10, splitPriceMode: 'Fixed' }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: true, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            {
              id: id(), name: 'Viator', commission: 30, promo: 15,
              vatEnabled: false, vatRate: 20, vatType: 'Included',
              tickets: [
                { id: id(), type: 'Adult', price: 99, cost: 0, minAge: 18, maxAge: 70 },
                { id: id(), type: 'Children', price: 45, cost: 0, minAge: 0, maxAge: 17 },
              ],
            },
            {
              id: id(), name: 'GYG', commission: 30, promo: 0,
              vatEnabled: false, vatRate: 20, vatType: 'Included',
              tickets: [
                { id: id(), type: 'Adult', price: 99, cost: 0, minAge: 18, maxAge: 70 },
                { id: id(), type: 'Children', price: 45, cost: 0, minAge: 12, maxAge: 17 },
                { id: id(), type: 'Youth', price: 30, cost: 0, minAge: 5, maxAge: 11 },
                { id: id(), type: 'Infant', price: 0, cost: 0, minAge: 0, maxAge: 4 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'prod-2',
      name: 'Louvre Tour',
      bokunId: '',
      options: [
        {
          id: 'opt-3',
          name: 'Standard Group',
          notes: '',
          guides: [{ id: id(), label: 'Guide 1', type: 'Fixed', amount: 150, tiers: [], maxPerGuide: 10, splitPriceMode: 'Fixed' }],
          rules: {
            minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
            rts: { enabled: true, t1Max: 6, t1Price: 20, t2Price: 90 },
            tierPricing: { enabled: false, tiers: [] },
          },
          extraCosts: [],
          channels: [
            {
              id: id(), name: 'Viator', commission: 30, promo: 0,
              vatEnabled: false, vatRate: 20, vatType: 'Included',
              tickets: [
                { id: id(), type: 'Adult', price: 109, cost: 28, minAge: 18, maxAge: 99 },
                { id: id(), type: 'Child', price: 79, cost: 0, minAge: 4, maxAge: 17 },
              ],
            },
            {
              id: id(), name: 'GYG', commission: 30, promo: 0,
              vatEnabled: false, vatRate: 20, vatType: 'Included',
              tickets: [
                { id: id(), type: 'Adult', price: 109, cost: 28, minAge: 18, maxAge: 99 },
                { id: id(), type: 'Child', price: 79, cost: 0, minAge: 4, maxAge: 17 },
              ],
            },
          ],
        },
      ],
    },
  ],
};
