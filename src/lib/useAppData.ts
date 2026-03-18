import { useState, useEffect, useCallback } from 'react';
import type { AppData, Product, Option, Channel, Ticket, Guide, ExtraCost, TierRow } from './types';
import { INITIAL_DATA } from './initialData';

const STORAGE_KEY = 'aurelia_data';

const generateId = () => crypto.randomUUID();

export function useAppData() {
  const [data, setData] = useState<AppData>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_DATA;
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
        tickets: [
          { id: generateId(), type: 'Adult', price: 50, cost: 0, minAge: 18, maxAge: 99, pax: 2 },
          { id: generateId(), type: 'Child', price: 25, cost: 0, minAge: 4, maxAge: 12, pax: 0 },
        ],
        guides: [{ id: generateId(), label: 'Guide 1', type: 'Fixed', amount: 60 }],
        rules: {
          minTicket: { enabled: false, blockSize: 8, blockPrice: 130 },
          rts: { enabled: false, t1Max: 6, t1Price: 20, t2Price: 90 },
          tierPricing: { enabled: false, tiers: [] },
        },
        extraCosts: [],
        channels: [
          { id: generateId(), name: 'Viator', commission: 30, promo: 0, vatEnabled: false, vatRate: 20, vatType: 'Included' },
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
      });
    });
  }, [updateOption]);

  const deleteChannel = useCallback((optionId: string, channelId: string) => {
    updateOption(optionId, (opt) => {
      opt.channels = opt.channels.filter((c) => c.id !== channelId);
    });
  }, [updateOption]);

  const addTicket = useCallback((optionId: string) => {
    updateOption(optionId, (opt) => {
      opt.tickets.push({
        id: generateId(),
        type: 'New Type',
        price: 0,
        cost: 0,
        minAge: 0,
        maxAge: 99,
        pax: 0,
      });
    });
  }, [updateOption]);

  const deleteTicket = useCallback((optionId: string, ticketId: string) => {
    updateOption(optionId, (opt) => {
      opt.tickets = opt.tickets.filter((t) => t.id !== ticketId);
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
