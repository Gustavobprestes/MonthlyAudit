import type { SVGProps } from "react";

interface SuperellipseTileProps {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "accent" | "emerald" | "sky" | "amber";
}

/**
 * Contêiner corporativo em geometria superelíptica (Squircle G2) com borda especular
 * superior e profundidade adaptativa aos 7 temas da plataforma Softlan TI.
 */
export function SuperellipseTile({
  children,
  size = "md",
  tone = "accent",
}: SuperellipseTileProps) {
  const dimensions =
    size === "sm"
      ? "w-9 h-9 rounded-[11px]"
      : size === "lg"
        ? "w-14 h-14 rounded-[16px]"
        : "w-12 h-12 rounded-[14px]";

  const toneStyles: Record<NonNullable<SuperellipseTileProps["tone"]>, React.CSSProperties> = {
    accent: {
      background:
        "linear-gradient(145deg, color-mix(in srgb, var(--accent) 22%, transparent), color-mix(in srgb, var(--accent) 8%, transparent))",
      borderColor: "color-mix(in srgb, var(--accent) 38%, transparent)",
      color: "var(--accent)",
      boxShadow:
        "inset 0 1px 0 0 rgba(255,255,255,0.22), 0 8px 20px -6px var(--accent-glow)",
    },
    emerald: {
      background:
        "linear-gradient(145deg, rgba(16, 185, 129, 0.22), rgba(16, 185, 129, 0.07))",
      borderColor: "rgba(16, 185, 129, 0.36)",
      color: "#10b981",
      boxShadow:
        "inset 0 1px 0 0 rgba(255,255,255,0.2), 0 8px 20px -6px rgba(16, 185, 129, 0.32)",
    },
    sky: {
      background:
        "linear-gradient(145deg, rgba(14, 165, 233, 0.22), rgba(14, 165, 233, 0.07))",
      borderColor: "rgba(14, 165, 233, 0.36)",
      color: "#0ea5e9",
      boxShadow:
        "inset 0 1px 0 0 rgba(255,255,255,0.2), 0 8px 20px -6px rgba(14, 165, 233, 0.32)",
    },
    amber: {
      background:
        "linear-gradient(145deg, rgba(245, 158, 11, 0.22), rgba(245, 158, 11, 0.07))",
      borderColor: "rgba(245, 158, 11, 0.36)",
      color: "#f59e0b",
      boxShadow:
        "inset 0 1px 0 0 rgba(255,255,255,0.2), 0 8px 20px -6px rgba(245, 158, 11, 0.32)",
    },
  };

  return (
    <div
      style={toneStyles[tone]}
      className={`${dimensions} border flex items-center justify-center shrink-0 backdrop-blur-md transition-all duration-500`}
    >
      {children}
    </div>
  );
}

/* ==================== 01. DOMAIN INTEGRATION ICONS (STITCH EXPORT) ==================== */

/** Ícone de Domínio: GLPI Service Desk (Ticket estruturado + engrenagem) */
export function IconGlpiService(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="5" width="18" height="14" rx="3" fill="currentColor" fillOpacity={0.16} />
      <path
        d="M3 8C3 6.34315 4.34315 5 6 5H18C19.6569 5 21 6.34315 21 8V10C19.8954 10 19 10.8954 19 12C19 13.1046 19.8954 14 21 14V16C21 17.6569 19.6569 19 18 19H6C4.34315 19 3 17.6569 3 16V14C4.10457 14 5 13.1046 5 12C5 10.8954 4.10457 10 3 10V8Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth={1.75} />
      <path
        d="M12 8.25V9.25M12 14.75V15.75M8.25 12H9.25M14.75 12H15.75"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Ícone de Domínio: Bitdefender GravityZone EDR */
export function IconBitdefenderShield(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 3L4.5 6.25V11.75C4.5 16.55 7.7 20.85 12 22C16.3 20.85 19.5 16.55 19.5 11.75V6.25L12 3Z"
        fill="currentColor"
        fillOpacity={0.16}
      />
      <path
        d="M12 3L4.5 6.25V11.75C4.5 16.55 7.7 20.85 12 22C16.3 20.85 19.5 16.55 19.5 11.75V6.25L12 3Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12.25L10.75 14.5L15.75 9.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ícone de Domínio: Zabbix & Backblaze B2 Cloud Vault */
export function IconBackupVault(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M6.5 18.5H17.5C19.7091 18.5 21.5 16.7091 21.5 14.5C21.5 12.4638 19.9788 10.7834 18.0124 10.5318C17.345 7.64865 14.764 5.5 11.6818 5.5C8.10199 5.5 5.2 8.40199 5.2 11.9818C5.2 12.1636 5.20748 12.3436 5.22216 12.5214C3.66694 12.9562 2.5 14.3834 2.5 16.0818C2.5 17.4173 3.58274 18.5 4.91818 18.5H6.5Z"
        fill="currentColor"
        fillOpacity={0.16}
      />
      <path
        d="M6.5 18.5H17.5C19.7091 18.5 21.5 16.7091 21.5 14.5C21.5 12.4638 19.9788 10.7834 18.0124 10.5318C17.345 7.64865 14.764 5.5 11.6818 5.5C8.10199 5.5 5.2 8.40199 5.2 11.9818C5.2 12.1636 5.20748 12.3436 5.22216 12.5214C3.66694 12.9562 2.5 14.3834 2.5 16.0818C2.5 17.4173 3.58274 18.5 4.91818 18.5H6.5Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 13.5H9.5L11 10.5L13 15.5L14.5 13.5H16.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ícone de Domínio: Provimento CNJ (Balança Normativa) */
export function IconProvimentoCnj(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity={0.16} />
      <path
        d="M12 4.5V19.5M7 20H17M5.5 8.5H18.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 8.5L3.5 13.5C3.5 14.6046 4.39543 15.5 5.5 15.5C6.60457 15.5 7.5 14.6046 7.5 13.5L5.5 8.5Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 8.5L16.5 13.5C16.5 14.6046 17.3954 15.5 18.5 15.5C19.6046 15.5 20.5 14.6046 20.5 13.5L18.5 8.5Z"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ==================== 02. HARDWARE & INFRASTRUCTURE TELEMETRY GLYPHS ==================== */

/** Glifo: Estação de Trabalho (Workstation Desktop) */
export function WorkstationDesktopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" fill="currentColor" fillOpacity={0.16} />
      <rect
        x="3"
        y="4"
        width="18"
        height="12"
        rx="2"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 20H16M12 16V20"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Glifo: Servidor em Rack / Virtual Machine (Rack Server) */
export function RackServerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="4" y="4" width="16" height="6" rx="1.5" fill="currentColor" fillOpacity={0.16} />
      <rect x="4" y="14" width="16" height="6" rx="1.5" fill="currentColor" fillOpacity={0.16} />
      <rect x="4" y="4" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth={1.75} />
      <rect x="4" y="14" width="16" height="6" rx="1.5" stroke="currentColor" strokeWidth={1.75} />
      <circle cx="7.5" cy="7" r="0.85" fill="currentColor" />
      <circle cx="7.5" cy="17" r="0.85" fill="currentColor" />
    </svg>
  );
}

/** Glifo: Storage NAS / Repositório Cloud */
export function CloudStorageNasIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" fill="currentColor" fillOpacity={0.16} />
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" stroke="currentColor" strokeWidth={1.75} />
      <path
        d="M4.5 6.5V17.5C4.5 19.1569 7.85786 20.5 12 20.5C16.1421 20.5 19.5 19.1569 19.5 17.5V6.5"
        stroke="currentColor"
        strokeWidth={1.75}
      />
      <path
        d="M4.5 12C4.5 13.6569 7.85786 15 12 15C16.1421 15 19.5 13.6569 19.5 12"
        stroke="currentColor"
        strokeWidth={1.75}
      />
    </svg>
  );
}

/** Glifo: Unidade Externa de Backup (External Backup Drive) */
export function ExternalBackupDriveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="6" y="3.5" width="12" height="17" rx="2.5" fill="currentColor" fillOpacity={0.16} />
      <rect x="6" y="3.5" width="12" height="17" rx="2.5" stroke="currentColor" strokeWidth={1.75} />
      <path d="M9.5 16.5H14.5" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
      <circle cx="12" cy="9.5" r="2" stroke="currentColor" strokeWidth={1.75} />
    </svg>
  );
}

/** Glifo: Firewall de Perímetro & Rede (Network Firewall) */
export function NetworkFirewallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="currentColor" fillOpacity={0.16} />
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth={1.75} />
      <path
        d="M3.5 9.5H20.5M3.5 14.5H20.5M9.5 4.5V9.5M14.5 9.5V14.5M9.5 14.5V19.5"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Glifo: Proteção Ativa de Endpoint (Endpoint Antivirus) */
export function EndpointAntivirusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity={0.16} />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth={1.75} />
      <path
        d="M9.5 12.25L11.25 14L14.75 10"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ==================== 03. EXECUTIVE EMPTY STATES & TRUST SEALS ==================== */

/** Selo Executivo de Integridade Criptográfica SHA-256 */
export function CryptographicAuditSeal({ hash }: { hash?: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full theme-pill text-[11px] font-mono">
      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-emerald-500 shrink-0">
        <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity={0.18} />
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth={1.75} />
        <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeDasharray="2.5 2.5" strokeWidth={1.4} />
        <path
          d="M9.2 12.2L11.1 14.1L15 10"
          stroke="currentColor"
          strokeWidth={1.85}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-bold theme-text-primary">SHA-256 VERIFICADO</span>
      {hash && <span className="theme-text-muted">{hash.slice(0, 12)}...</span>}
    </div>
  );
}

/** Ilustração Corporativa de Estado Vazio: Estúdio de Auditoria (Export Stitch) */
export function EmptyAuditStudioIllustration() {
  return (
    <svg viewBox="0 0 240 160" fill="none" className="w-48 h-32 mx-auto" aria-hidden="true">
      <rect
        x="68"
        y="24"
        width="104"
        height="112"
        rx="12"
        fill="var(--accent)"
        fillOpacity="0.14"
        stroke="var(--text-primary)"
        strokeOpacity="0.45"
        strokeWidth="1.75"
      />
      <path
        d="M88 52H152M88 72H136M88 92H120"
        stroke="var(--text-primary)"
        strokeOpacity="0.55"
        strokeLinecap="round"
        strokeWidth="1.75"
      />
      <circle
        cx="152"
        cy="108"
        r="22"
        fill="var(--accent)"
        fillOpacity="0.22"
        stroke="var(--accent)"
        strokeWidth="1.75"
      />
      <path
        d="M168 124L184 140"
        stroke="var(--accent)"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

/** Ilustração Corporativa de Estado Vazio: Cofre Imutável de PDFs (Export Stitch) */
export function EmptyHistoryVaultIllustration() {
  return (
    <svg viewBox="0 0 240 160" fill="none" className="w-48 h-32 mx-auto" aria-hidden="true">
      <path
        d="M44 44C44 37.3726 49.3726 32 56 32H96L110 46H184C190.627 46 196 51.3726 196 58V120C196 126.627 190.627 132 184 132H56C49.3726 132 44 126.627 44 120V44Z"
        fill="var(--accent)"
        fillOpacity="0.14"
        stroke="var(--text-primary)"
        strokeOpacity="0.45"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
      <rect
        x="96"
        y="72"
        width="48"
        height="36"
        rx="6"
        stroke="var(--accent)"
        strokeWidth="1.75"
      />
      <circle cx="120" cy="90" r="4" stroke="var(--accent)" strokeWidth="1.75" />
    </svg>
  );
}