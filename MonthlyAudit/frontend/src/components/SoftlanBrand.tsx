interface SoftlanBrandProps {
  subtitle?: string;
  compact?: boolean;
}

export function SoftlanLogoMark({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logotipo Oficial"
    >
      <defs>
        <linearGradient id="softlanTop" x1="8" y1="8" x2="92" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="50%" stopColor="#64748B" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="softlanBottom" x1="8" y1="44" x2="92" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7B47" />
          <stop offset="55%" stopColor="#FF5A1F" />
          <stop offset="100%" stopColor="#C23B0A" />
        </linearGradient>
      </defs>
      <path
        d="M52 8H92V24C92 40.5 78.5 52 62 52H36V37H62C70.5 37 77 31.5 77 24V22H52C33.5 22 22 33.5 22 50V56H8V48C8 24 27 8 52 8Z"
        fill="url(#softlanTop)"
      />
      <path
        d="M48 92H8V76C8 59.5 21.5 48 38 48H64V63H38C29.5 63 23 68.5 23 76V78H48C66.5 78 78 66.5 78 50V44H92V52C92 76 73 92 48 92Z"
        fill="url(#softlanBottom)"
      />
    </svg>
  );
}

export function SoftlanBrand({
  subtitle = "Soluções em Tecnologia",
  compact = false,
}: SoftlanBrandProps) {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="relative flex items-center justify-center p-1.5 rounded-xl theme-pill">
        <SoftlanLogoMark className={compact ? "w-7 h-7" : "w-9 h-9"} />
      </div>
      <div>
        <div className="font-brand font-extrabold text-sm sm:text-base leading-none flex items-center gap-1.5 theme-text-primary">
          <span>SOFTLAN</span>
          <span className="theme-accent-text">TI</span>
        </div>
        <span className="text-[10px] tracking-[0.2em] theme-text-muted uppercase block mt-1">
          {subtitle}
        </span>
      </div>
    </div>
  );
}