import { useState, useEffect, useCallback } from 'react';
import type { AppData, Option, Ticket } from './types';
import { INITIAL_DATA } from './initialData';

const STORAGE_KEY = 'aurelia_data';

const generateId = () => crypto.randomUUID();

const getDefaultTickets = (channelName: string): Ticket[] => {
  switch (channelName) {
    case 'Viator':
      return [
        { id: generateId(), type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 70, pax: 2 },
        { id: generateId(), type: 'Children', price: 25, cost: 0, minAge: 0, maxAge: 17, pax: 0 },
      ];
    case 'GYG':
      return [
        { id: generateId(), type: 'Old', price: 50, cost: 0, minAge: 71, maxAge: 120, pax: 0 },
        { id: generateId(), type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 70, pax: 2 },
        { id: generateId(), type: 'Children', price: 25, cost: 0, minAge: 12, maxAge: 17, pax: 0 },
        { id: generateId(), type: 'Youth', price: 25, cost: 0, minAge: 5, maxAge: 11, pax: 0 },
        { id: generateId(), type: 'Infant', price: 0, cost: 0, minAge: 0, maxAge: 4, pax: 0 },
      ];
    case 'Airbnb':
      return [
        { id: generateId(), type: 'Guest', price: 50, cost: 0, minAge: 0, maxAge: 99, pax: 2 },
      ];
    case 'Own Website':
    case 'Agent':
      return [
        { id: generateId(), type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 99, pax: 2 },
        { id: generateId(), type: 'Child', price: 25, cost: 0, minAge: 4, maxAge: 12, pax: 0 },
      ];
    default:
      return [
        { id: generateId(), type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 99, pax: 2 },
        { id: generateId(), type: 'Child', price: 25, cost: 0, minAge: 4, maxAge: 12, pax: 0 },
      ];
  }
};

export function useAppData() {
  const [data, setData] = useState<AppData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppData;
        // Migration: if channels don't have tickets, add defaults
        for (const p of parsed.products) {
          for (const o of p.options) {
            for (const c of o.channels) {
              if (!c.tickets) {
                c.tickets = getDefaultTickets(c.name);
              }
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

  const findOption = useCallback(
    (optionId: string): Option | undefined =>
      data.products.flatMap((p) => p.options).find((o) => o.id === optionId),
    [data]
  );

  const addProduct = useCallback((name: string) => {
    updateData((d) => {
      d.products.push({
        id: generateId(),
        name,
        options: [],
      });
    });
  }, [updateData]);

  const deleteProduct = useCallback((productId: string) => {
    updateData((d) => {
      d.products = d.products.filter((p) => p.id !== productId);
    });
  }, [updateData]);

  const addOption = useCallback((productId: string) => {
    updateData((d) => {
      const product = d.products.find((p) => p.id === productId);
      if (!product) return;
      product.options.push({
        id: generateId(),
        name: 'New Option',
        bokunId: '',
        notes: '',
        guides: [{ id: generateId(), label: 'Guide 1', type: 'Fixed', amount: 60 }],
        rules: {
          minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
          rts: { enabled: false, t1Max: 6, t1Price: 20, t2Price: 90 },
          tierPricing: { enabled: false, tiers: [] },
        },
        extraCosts: [],
        channels: [
          {
            id: generateId(),
            name: 'Viator',
            commission: 30,
            promo: 0,
            vatEnabled: false,
            vatRate: 20,
            vatType: 'Included',
            tickets: getDefaultTickets('Viator'),
          },
        ],
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

  const addChannel = useCallback((optionId: string, channelName: string) => {
    const commissionDefaults: Record<string, number> = {
      Viator: 30, GYG: 30, Airbnb: 25, 'Own Website': 0, Agent: 15,
    };
    updateOption(optionId, (opt) => {
      opt.channels.push({
        id: generateId(),
        name: channelName,
        commission: commissionDefaults[channelName] ?? 20,
        promo: 0,
        vatEnabled: false,
        vatRate: 20,
        vatType: 'Included',
        tickets: getDefaultTickets(channelName),
      });
    });
  }, [updateOption]);

  const deleteChannel = useCallback((optionId: string, channelId: string) => {
    updateOption(optionId, (opt) => {
      opt.channels = opt.channels.filter((c) => c.id !== channelId);
    });
  }, [updateOption]);

  const addTicket = useCallback((optionId: string, channelId: string) => {
    updateOption(optionId, (opt) => {
      const ch = opt.channels.find((c) => c.id === channelId);
      if (ch) {
        ch.tickets.push({
          id: generateId(),
          type: 'New Type',
          price: 0,
          cost: 0,
          minAge: 0,
          maxAge: 99,
          pax: 0,
        });
      }
    });
  }, [updateOption]);

  const deleteTicket = useCallback((optionId: string, channelId: string, ticketId: string) => {
    updateOption(optionId, (opt) => {
      const ch = opt.channels.find((c) => c.id === channelId);
      if (ch) {
        ch.tickets = ch.tickets.filter((t) => t.id !== ticketId);
      }
    });
  }, [updateOption]);

  const addGuide = useCallback((optionId: string) => {
    updateOption(optionId, (opt) => {
      opt.guides.push({
        id: generateId(),
        label: `Guide ${opt.guides.length + 1}`,
        type: 'Fixed',
        amount: 0,
      });
    });
  }, [updateOption]);

  const deleteGuide = useCallback((optionId: string, guideId: string) => {
    updateOption(optionId, (opt) => {
      opt.guides = opt.guides.filter((g) => g.id !== guideId);
    });
  }, [updateOption]);

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
    data,
    updateData,
    findOption,
    addProduct,
    deleteProduct,
    addOption,
    deleteOption,
    updateOption,
    addChannel,
    deleteChannel,
    addTicket,
    deleteTicket,
    addGuide,
    deleteGuide,
    addExtraCost,
    deleteExtraCost,
    addTier,
    deleteTier,
  };
}
