import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  { num: "01", short: "Jan", full: "Janeiro" },
  { num: "02", short: "Fev", full: "Fevereiro" },
  { num: "03", short: "Mar", full: "Março" },
  { num: "04", short: "Abr", full: "Abril" },
  { num: "05", short: "Mai", full: "Maio" },
  { num: "06", short: "Jun", full: "Junho" },
  { num: "07", short: "Jul", full: "Julho" },
  { num: "08", short: "Ago", full: "Agosto" },
  { num: "09", short: "Set", full: "Setembro" },
  { num: "10", short: "Out", full: "Outubro" },
  { num: "11", short: "Nov", full: "Novembro" },
  { num: "12", short: "Dez", full: "Dezembro" },
];

interface MonthYearPickerProps {
  value: string; // "YYYY-MM"
  onChange: (value: string) => void;
}

export function MonthYearPicker({ value, onChange }: MonthYearPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [selectedYearStr, selectedMonthStr] = value.split("-");
  const [viewYear, setViewYear] = useState<number>(() => Number(selectedYearStr) || new Date().getFullYear());

  useEffect(() => {
    const yr = Number(value.split("-")[0]);
    if (yr) setViewYear(yr);
  }, [value]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const currentMonthObj = MONTHS.find((m) => m.num === selectedMonthStr);
  const displayLabel = currentMonthObj
    ? `${currentMonthObj.full} de ${selectedYearStr}`
    : value;

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 theme-input rounded-xl px-4 py-2.5 text-left text-sm transition-all cursor-pointer"
      >
        <span className="font-semibold truncate">{displayLabel}</span>
        <Calendar className="w-4 h-4 theme-accent-text shrink-0" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 6, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            style={{ backgroundColor: "var(--bg-surface-strong)" }}
            className="absolute left-0 right-0 sm:w-72 z-50 mt-1 rounded-2xl border border-current/15 shadow-2xl p-4 space-y-3"
          >
            {/* Navegador de Ano */}
            <div className="flex items-center justify-between pb-2 border-b border-current/10">
              <button
                type="button"
                onClick={() => setViewYear((y) => y - 1)}
                className="p-1.5 rounded-lg theme-nav-inactive cursor-pointer"
                aria-label="Ano anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-brand font-bold text-sm">{viewYear}</span>
              <button
                type="button"
                onClick={() => setViewYear((y) => y + 1)}
                className="p-1.5 rounded-lg theme-nav-inactive cursor-pointer"
                aria-label="Próximo ano"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Grade de 12 Meses */}
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((m) => {
                const isSelected = String(viewYear) === selectedYearStr && m.num === selectedMonthStr;
                return (
                  <button
                    key={m.num}
                    type="button"
                    onClick={() => {
                      onChange(`${viewYear}-${m.num}`);
                      setOpen(false);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      isSelected ? "theme-accent-bg" : "theme-nav-inactive"
                    }`}
                  >
                    {m.short}
                  </button>
                );
              })}
            </div>

            {/* Atalho Mês Atual */}
            <div className="pt-2 border-t border-current/10 flex justify-between items-center text-[11px]">
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                  onChange(cur);
                  setOpen(false);
                }}
                className="font-semibold theme-accent-text hover:underline cursor-pointer"
              >
                Mês Atual
              </button>
              <span className="font-mono theme-text-muted">{value}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}