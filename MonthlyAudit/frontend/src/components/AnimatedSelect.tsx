import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Search, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface AnimatedSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
}

export function AnimatedSelect({
  value,
  onChange,
  options,
  placeholder = "Selecione uma opção...",
  searchable = true,
  disabled = false,
}: AnimatedSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel && o.sublabel.toLowerCase().includes(query.toLowerCase()))
      )
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
            setQuery("");
          }
        }}
        className="w-full flex items-center justify-between gap-3 theme-input rounded-xl px-4 py-2.5 text-left text-sm transition-all cursor-pointer disabled:opacity-50"
      >
        <span className="truncate">
          {selected ? (
            <span className="font-semibold">{selected.label}</span>
          ) : (
            <span className="theme-text-muted">{placeholder}</span>
          )}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="theme-text-muted shrink-0"
        >
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ backgroundColor: "var(--bg-surface-strong)" }}
            className="absolute left-0 right-0 z-50 mt-1 rounded-2xl border border-current/15 shadow-2xl overflow-hidden"
          >
            {searchable && (
              <div className="p-2.5 border-b border-current/10 flex items-center gap-2">
                <Search className="w-4 h-4 theme-accent-text shrink-0 ml-1" />
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrar por nome..."
                  className="w-full bg-transparent text-xs focus:outline-none py-1"
                />
              </div>
            )}

            <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs theme-text-muted">
                  Nenhum registro encontrado.
                </div>
              ) : (
                filtered.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                        isSelected
                          ? "bg-current/10 font-bold"
                          : "hover:bg-current/[0.06]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div className="text-[10px] font-mono theme-text-muted truncate mt-0.5">
                            {opt.sublabel}
                          </div>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 theme-accent-text shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}