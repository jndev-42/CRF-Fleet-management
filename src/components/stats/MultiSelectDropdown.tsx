'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface Option {
  id: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}

export default function MultiSelectDropdown({ options, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const triggerLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.label ?? placeholder)
        : `${value.length} sélectionnés`;

  return (
    <div className="multiselect" ref={ref}>
      <button
        type="button"
        className={`multiselect-trigger stats-date-input${value.length > 0 ? ' multiselect-trigger--active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="multiselect-trigger-label">{triggerLabel}</span>
        {value.length > 0 && (
          <span className="multiselect-clear" role="button" aria-label="Effacer" onClick={handleClear}>
            <X size={12} />
          </span>
        )}
        <ChevronDown size={13} className={`multiselect-chevron${open ? ' multiselect-chevron--open' : ''}`} />
      </button>

      {open && (
        <div className="multiselect-dropdown" role="listbox" aria-multiselectable="true">
          <div className="multiselect-search-wrap">
            <Search size={13} className="multiselect-search-icon" />
            <input
              autoFocus
              type="text"
              className="multiselect-search"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="multiselect-list">
            {filtered.length === 0 ? (
              <div className="multiselect-empty">Aucun résultat</div>
            ) : (
              filtered.map((opt) => (
                <label key={opt.id} className="multiselect-item">
                  <input
                    type="checkbox"
                    checked={value.includes(opt.id)}
                    onChange={() => toggle(opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
