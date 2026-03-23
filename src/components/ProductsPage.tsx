import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Package } from 'lucide-react';
import type { AppData, Product } from '@/lib/types';

const CHANNEL_PRESETS = ['Viator', 'GYG', 'Airbnb', 'Own Website', 'Agent', 'Custom'];

interface ProductsPageProps {
  data: AppData;
  onAddProduct: (name: string) => void;
  onDeleteProduct: (id: string) => void;
  onAddOption: (productId: string) => void;
  onDeleteOption: (optionId: string) => void;
  onAddChannel: (optionId: string, channelName: string) => void;
  onEditOption: (optionId: string, channelIdx?: number) => void;
  updateProduct: (productId: string, updater: (p: Product) => void) => void;
}

export default function ProductsPage({
  data,
  onAddProduct,
  onDeleteProduct,
  onAddOption,
  onDeleteOption,
  onAddChannel,
  onEditOption,
  updateProduct,
}: ProductsPageProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(data.products.map((p) => [p.id, true]))
  );
  const [showChannelDropdown, setShowChannelDropdown] = useState<string | null>(null);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleAddProduct = () => {
    const name = prompt('Product name:');
    if (name?.trim()) onAddProduct(name.trim());
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your tours and their pricing options.
          </p>
        </div>
        <button onClick={handleAddProduct} className="aurelia-gold-btn">
          + Add Product
        </button>
      </div>

      {data.products.length === 0 && (
        <div className="aurelia-card p-16 text-center">
          <Package size={40} className="mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">No products yet. Add your first one to get started.</p>
        </div>
      )}

      {data.products.map((product) => (
        <div key={product.id} className="mb-8">
          <div
            className="flex items-center space-x-3 mb-4 group cursor-pointer"
            onClick={() => toggleExpand(product.id)}
          >
            {expanded[product.id] ? (
              <ChevronDown size={18} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={18} className="text-muted-foreground" />
            )}
            <h2 className="text-lg font-bold text-foreground">{product.name}</h2>
            <span className="text-xs text-muted-foreground">
              {product.options.length} option{product.options.length !== 1 ? 's' : ''}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${product.name}"?`)) onDeleteProduct(product.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-profit-negative transition-all"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Bokun ID inline edit */}
          <div className="flex items-center gap-2 mb-3 ml-7">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bokun ID:</span>
            <input
              className="aurelia-input text-xs w-32 tabular-nums"
              placeholder="—"
              value={product.bokunId}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateProduct(product.id, (p) => { p.bokunId = e.target.value; })}
            />
          </div>

          {expanded[product.id] && (
            <div className="ml-7 space-y-3">
              {product.options.map((opt) => (
                <div key={opt.id}>
                  <div className="aurelia-card p-4 flex justify-between items-center group hover:border-border/80 transition-all">
                    <div>
                      <span className="font-semibold text-sm text-foreground">{opt.name}</span>
                      <div className="flex items-center space-x-1.5 mt-1.5">
                        {opt.channels.map((ch) => (
                          <span
                            key={ch.id}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-secondary text-muted-foreground"
                          >
                            {ch.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setShowChannelDropdown(showChannelDropdown === opt.id ? null : opt.id)
                          }
                          className="text-xs font-bold text-gold hover:underline"
                        >
                          + Channel
                        </button>
                        {showChannelDropdown === opt.id && (
                          <div className="absolute right-0 top-6 z-50 aurelia-card p-2 min-w-[160px]">
                            {CHANNEL_PRESETS.map((ch) => (
                              <button
                                key={ch}
                                onClick={() => {
                                  const name = ch === 'Custom' ? prompt('Channel name:') || 'Custom' : ch;
                                  onAddChannel(opt.id, name);
                                  setShowChannelDropdown(null);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-hover rounded transition-colors"
                              >
                                {ch}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => onEditOption(opt.id)}
                        className="opacity-0 group-hover:opacity-100 bg-secondary text-muted-foreground px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:text-foreground"
                      >
                        Manage
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${opt.name}"?`)) onDeleteOption(opt.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-profit-negative transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={() => onAddOption(product.id)}
                className="text-xs font-bold text-gold hover:underline ml-4"
              >
                + Add Option
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
