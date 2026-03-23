import { useState, useEffect, useCallback } from 'react';
import type { AppData, Option, AgeBucket, Product } from './types';
import { INITIAL_DATA, DEFAULT_AGE_BUCKETS } from './initialData';

const STORAGE_KEY = 'aurelia_data';

const generateId = () => crypto.randomUUID();

export function useAppData() {
  const [data, setData] = useState<AppData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppData;

        // Migration: ensure ageBuckets exist
        if (!parsed.ageBuckets || parsed.ageBuckets.length === 0) {
          parsed.ageBuckets = DEFAULT_AGE_BUCKETS.map((b) => ({ ...b }));
        }

        // Migration: strip legacy mapsTo/pax from tickets
        for (const p of parsed.products) {
          for (const o of p.options) {
            for (const c of o.channels) {
              if (!c.tickets) c.tickets = [];
              for (const t of c.tickets) {
                // Remove legacy fields if they exist
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const legacy = t as any;
                delete legacy.mapsTo;
                delete legacy.pax;
                // Ensure minAge/maxAge exist
                if (t.minAge === undefined) t.minAge = 0;
                if (t.maxAge === undefined) t.maxAge = 99;
              }
            }
          }
        }

        // Migration: move bokunId from options to product
        for (const p of parsed.products) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((p as any).bokunId === undefined) {
            // Find first option with a bokunId and move it up
            let foundBokunId = '';
            for (const o of p.options) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const optAny = o as any;
              if (optAny.bokunId) {
                foundBokunId = optAny.bokunId;
                break;
              }
            }
            p.bokunId = foundBokunId;
          }
          // Remove bokunId from all options
          for (const o of p.options) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (o as any).bokunId;
          }
        }

        // Migration: update guide types from legacy Per Pax + ensure new fields
        for (const p of parsed.products) {
          for (const o of p.options) {
            for (const g of o.guides) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const gAny = g as any;
              if (gAny.type === 'Per Pax') {
                gAny.type = 'Fixed';
                gAny.amount = 0;
              }
              if (!g.tiers) g.tiers = [];
              if (!g.maxPerGuide) g.maxPerGuide = 10;
              if (!g.splitPriceMode) g.splitPriceMode = 'Fixed';
            }
          }
        }

        return parsed;
      }
      return INITIAL_DATA;
    } catch {
      return INITIAL_DATA;
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const updateData = useCallback((updater: (d: AppData) => void) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as AppData;
      updater(next);
      return next;
    });
  }, []);

  // Age bucket operations
  const updateAgeBuckets = useCallback((buckets: AgeBucket[]) => {
    updateData((d) => {
      d.ageBuckets = buckets;
    });
  }, [updateData]);

  const updateBucketCount = useCallback((bucketId: string, count: number) => {
    updateData((d) => {
      const bucket = d.ageBuckets.find((b) => b.id === bucketId);
      if (bucket) bucket.count = Math.max(0, count);
    });
  }, [updateData]);

  // Product operations
  const addProduct = useCallback((name: string, bokunId?: string) => {
    updateData((d) => {
      d.products.push({ id: generateId(), name, bokunId: bokunId || '', options: [] });
    });
  }, [updateData]);

  const deleteProduct = useCallback((productId: string) => {
    updateData((d) => {
      d.products = d.products.filter((p) => p.id !== productId);
    });
  }, [updateData]);

  const updateProduct = useCallback((productId: string, updater: (p: Product) => void) => {
    updateData((d) => {
      const prod = d.products.find((p) => p.id === productId);
      if (prod) updater(prod);
    });
  }, [updateData]);

  // Option operations
  const addOption = useCallback((productId: string) => {
    updateData((d) => {
      const product = d.products.find((p) => p.id === productId);
      if (!product) return;
      product.options.push({
        id: generateId(),
        name: 'New Option',
        notes: '',
        guides: [{ id: generateId(), label: 'Guide 1', type: 'Fixed', amount: 60, tiers: [], maxPerGuide: 10, splitPriceMode: 'Fixed' }],
        rules: {
          minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
          rts: { enabled: false, t1Max: 6, t1Price: 20, t2Price: 90 },
          tierPricing: { enabled: false, tiers: [] },
        },
        extraCosts: [],
        channels: [{
          id: generateId(), name: 'Viator', commission: 30, promo: 0,
          vatEnabled: false, vatRate: 20, vatType: 'Included',
          tickets: [
            { id: generateId(), type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 70 },
            { id: generateId(), type: 'Children', price: 25, cost: 0, minAge: 0, maxAge: 17 },
          ],
        }],
      });
    });
  }, [updateData]);

  const deleteOption = useCallback((optionId: string) => {
    updateData((d) => {
      for (const p of d.products) {
        p.options = p.options.filter((o) => o.id !== optionId);
      }
    });
  }, [updateData]);

  const updateOption = useCallback((optionId: string, updater: (o: Option) => void) => {
    updateData((d) => {
      const opt = d.products.flatMap((p) => p.options).find((o) => o.id === optionId);
      if (opt) updater(opt);
    });
  }, [updateData]);

  // Channel operations
  const addChannel = useCallback((optionId: string, channelName: string) => {
    const commissionDefaults: Record<string, number> = {
      Viator: 30, GYG: 30, Airbnb: 25, 'Own Website': 0, Agent: 15,
    };
    const defaultTickets: Record<string, { type: string; price: number; cost: number; minAge: number; maxAge: number }[]> = {
      Viator: [
        { type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 70 },
        { type: 'Children', price: 25, cost: 0, minAge: 0, maxAge: 17 },
      ],
      GYG: [
        { type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 70 },
        { type: 'Children', price: 25, cost: 0, minAge: 12, maxAge: 17 },
        { type: 'Youth', price: 20, cost: 0, minAge: 5, maxAge: 11 },
        { type: 'Infant', price: 0, cost: 0, minAge: 0, maxAge: 4 },
      ],
      Airbnb: [
        { type: 'Guest', price: 50, cost: 0, minAge: 0, maxAge: 99 },
      ],
    };
    const fallback = [
      { type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 99 },
      { type: 'Child', price: 25, cost: 0, minAge: 0, maxAge: 17 },
    ];

    updateOption(optionId, (opt) => {
      const ticketTemplates = defaultTickets[channelName] || fallback;
      opt.channels.push({
        id: generateId(), name: channelName,
        commission: commissionDefaults[channelName] ?? 20, promo: 0,
        vatEnabled: false, vatRate: 20, vatType: 'Included',
        tickets: ticketTemplates.map((t) => ({ ...t, id: generateId() })),
      });
    });
  }, [updateOption]);

  const deleteChannel = useCallback((optionId: string, channelId: string) => {
    updateOption(optionId, (opt) => {
      opt.channels = opt.channels.filter((c) => c.id !== channelId);
    });
  }, [updateOption]);

  // Ticket operations
  const addTicket = useCallback((optionId: string, channelId: string) => {
    updateOption(optionId, (opt) => {
      const ch = opt.channels.find((c) => c.id === channelId);
      if (ch) {
        ch.tickets.push({
          id: generateId(), type: 'New Type', price: 0, cost: 0,
          minAge: 0, maxAge: 99,
        });
      }
    });
  }, [updateOption]);

  const deleteTicket = useCallback((optionId: string, channelId: string, ticketId: string) => {
    updateOption(optionId, (opt) => {
      const ch = opt.channels.find((c) => c.id === channelId);
      if (ch) ch.tickets = ch.tickets.filter((t) => t.id !== ticketId);
    });
  }, [updateOption]);

  // Guide operations
  const addGuide = useCallback((optionId: string) => {
    updateOption(optionId, (opt) => {
      opt.guides.push({
        id: generateId(),
        label: `Guide ${opt.guides.length + 1}`,
        type: 'Fixed',
        amount: 0,
        tiers: [],
        maxPerGuide: 10,
        splitPriceMode: 'Fixed',
      });
    });
  }, [updateOption]);

  const deleteGuide = useCallback((optionId: string, guideId: string) => {
    updateOption(optionId, (opt) => {
      opt.guides = opt.guides.filter((g) => g.id !== guideId);
    });
  }, [updateOption]);

  // Extra cost operations
  const addExtraCost = useCallback((optionId: string) => {
    updateOption(optionId, (opt) => {
      opt.extraCosts.push({ id: generateId(), label: 'New Cost', amount: 0 });
    });
  }, [updateOption]);

  const deleteExtraCost = useCallback((optionId: string, costId: string) => {
    updateOption(optionId, (opt) => {
      opt.extraCosts = opt.extraCosts.filter((e) => e.id !== costId);
    });
  }, [updateOption]);

  // Tier operations
  const addTier = useCallback((optionId: string) => {
    updateOption(optionId, (opt) => {
      opt.rules.tierPricing.tiers.push({ id: generateId(), min: 1, max: 10, price: 50 });
    });
  }, [updateOption]);

  const deleteTier = useCallback((optionId: string, tierId: string) => {
    updateOption(optionId, (opt) => {
      opt.rules.tierPricing.tiers = opt.rules.tierPricing.tiers.filter((t) => t.id !== tierId);
    });
  }, [updateOption]);

  return {
    data, updateData, addProduct, deleteProduct, updateProduct,
    addOption, deleteOption, updateOption,
    addChannel, deleteChannel,
    addTicket, deleteTicket,
    addGuide, deleteGuide,
    addExtraCost, deleteExtraCost,
    addTier, deleteTier,
    updateAgeBuckets, updateBucketCount,
  };
}
