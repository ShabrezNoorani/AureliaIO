import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const allSelected = selected.length === 0 || selected.includes('All');

  const toggleOption = (value: string) => {
    if (value === 'All') {
      onChange(['All']);
      return;
    }

    let nextSelected = selected.filter(s => s !== 'All');
    if (nextSelected.includes(value)) {
      nextSelected = nextSelected.filter(s => s !== value);
      if (nextSelected.length === 0) nextSelected = ['All'];
    } else {
      nextSelected.push(value);
    }
    onChange(nextSelected);
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(['All']);
  };

  let displayText = label;
  if (!allSelected) {
    if (selected.length === 1) {
      const opt = options.find(o => o.value === selected[0]);
      displayText = opt ? opt.label : selected[0];
    } else if (selected.length === 2) {
      displayText = selected.map(s => options.find(o => o.value === s)?.label || s).join(', ');
    } else {
      displayText = `${selected.length} selected`;
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button 
        type="button" 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between rounded bg-[#0f1117] border border-[#2a2a3e] px-3 py-1.5 text-xs text-white min-w-[140px] hover:border-white/20 transition-colors"
      >
        <span className={allSelected ? 'text-gray-400' : 'text-white truncate max-w-[120px]'}>{displayText}</span>
        <div className="flex items-center gap-1.5 opacity-60">
          {!allSelected && (
            <div onClick={clearSelection} className="hover:text-red-400 rounded-full p-0.5" title="Clear">
              <X size={12} />
            </div>
          )}
          <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-[#13131a] border border-[#2a2a3e] rounded-lg shadow-xl shadow-black/40 z-50 overflow-hidden text-sm animate-fade-in">
          <div className="max-h-60 overflow-y-auto aurelia-scrollbar py-1">
            <button
              onClick={() => toggleOption('All')}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left transition-colors"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${allSelected ? 'bg-[#f5a623] border-[#f5a623]' : 'border-gray-500'}`}>
                {allSelected && <Check size={12} className="text-[#0a0a0f] font-bold" />}
              </div>
              <span className={allSelected ? 'text-white font-medium' : 'text-gray-400'}>All {label}</span>
            </button>
            <div className="h-px bg-[#2a2a3e] mx-2 my-1" />
            
            {options.filter(o => o.value !== 'All').map(opt => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleOption(opt.value)}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 text-left transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-[#f5a623] border-[#f5a623]' : 'border-gray-500'}`}>
                    {isSelected && <Check size={12} className="text-[#0a0a0f] font-bold" />}
                  </div>
                  <span className={isSelected ? 'text-white' : 'text-gray-300'}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
