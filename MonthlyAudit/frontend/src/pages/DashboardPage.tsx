import { useEffect, useMemo, useRef, useState } from "react";
import { MonthYearPicker } from "../components/MonthYearPicker";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileDown,
  Plus,
  RefreshCw,
  LogOut,
  CheckCircle2,
  Shield,
  HardDrive,
  Ticket,
  FileText,
  History,
  BookmarkPlus,
  Pencil,
  Trash2,
  Cpu,
  ShieldCheck,
  Palette,
  X,
  UserCog,
  ChevronDown,
  Crown,
  User as UserIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  HeartPulse,
  Filter,
} from "lucide-react";
import { HeroShaderCanvas } from "../components/HeroShaderCanvas";
import { SoftlanBrand } from "../components/SoftlanBrand";
import { AnimatedSelect } from "../components/AnimatedSelect";
import { ClientMappingModal } from "../components/ClientMappingModal";
import {
  SuperellipseTile,
  IconGlpiService,
  IconBitdefenderShield,
  IconBackupVault,
  WorkstationDesktopIcon,
  RackServerIcon,
  CloudStorageNasIcon,
  ExternalBackupDriveIcon,
  EndpointAntivirusIcon,
  EmptyAuditStudioIllustration,
  EmptyHistoryVaultIllustration,
  CryptographicAuditSeal,
} from "../components/SoftlanSystemIcons";
import { apiFetch, apiDownloadPdf } from "../lib/api";
import type {
  AppTheme,
  AuditPayload,
  ClientMapping,
  HistoryRecord,
  ManagedUser,
  ReportTemplate,
  UserProfile,
} from "../types/audit";

interface DashboardPageProps {
  user: UserProfile;
  onLogout: () => void;
}

const THEMES: { value: AppTheme; label: string; sublabel: string }[] = [
  { value: "softlan", label: "Softlan Obsidian", sublabel: "Padrão Escuro & Laranja" },
  { value: "dracula", label: "Dracula", sublabel: "Roxo & Rosa Vampiro" },
  { value: "glass", label: "Liquid Glass", sublabel: "Transparência Cristalina" },
  { value: "dark", label: "Dark Carbon", sublabel: "Grafite Minimalista" },
  { value: "light", label: "Executive Light", sublabel: "Claro Corporativo" },
  { value: "cloud", label: "Sky Cloud", sublabel: "Azul Céu Suave" },
  { value: "cyberpunk", label: "Cyberpunk 2077", sublabel: "Neon Amarelo & Ciano" },
];

function normalizeSearch(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isServerAsset(name: string, os: string): boolean {
  const combined = `${name} ${os}`.toLowerCase();
  return (
    combined.includes("server") ||
    combined.includes("srv") ||
    combined.includes("linux") ||
    combined.includes("debian") ||
    combined.includes("ubuntu") ||
    combined.includes("proxmox") ||
    combined.includes("vmware") ||
    combined.includes("hyper-v")
  );
}

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const isAdmin = user.role === "admin";

  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem("softlan_theme") as AppTheme | null;
    return saved && THEMES.some((t) => t.value === saved) ? saved : "softlan";
  });
  const [themeWaveKey, setThemeWaveKey] = useState<number>(0);

  const [tab, setTab] = useState<"audit" | "history" | "admin">("audit");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => window.innerWidth >= 1024);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const [clients, setClients] = useState<ClientMapping[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [referenceMonth, setReferenceMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [assetSearch, setAssetSearch] = useState("");
  const [assetStatusFilter, setAssetStatusFilter] = useState<"all" | "protected" | "blocked">("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyMonthFilter, setHistoryMonthFilter] = useState("");
  const [adminEcoSearch, setAdminEcoSearch] = useState("");
  const [adminCnjOnly, setAdminCnjOnly] = useState(false);

  const [auditData, setAuditData] = useState<AuditPayload | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientMapping | null>(null);
  const [newTplName, setNewTplName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("softlan_theme", theme);
  }, [theme]);

  const handleThemeChange = (newTheme: AppTheme) => {
    if (newTheme === theme) return;
    setTheme(newTheme);
    setThemeWaveKey((prev) => prev + 1);
  };

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadInitialData = async () => {
    const [cList, tList, hList] = await Promise.all([
      apiFetch<ClientMapping[]>("/api/v1/clients"),
      apiFetch<ReportTemplate[]>("/api/v1/templates"),
      apiFetch<HistoryRecord[]>("/api/v1/audit/history"),
    ]);
    setClients(cList || []);
    setTemplates(tList || []);
    setHistory(hList || []);

    if (isAdmin) {
      const uList = await apiFetch<ManagedUser[]>("/api/v1/admin/users").catch(() => []);
      setManagedUsers(uList || []);
    }
  };

  useEffect(() => {
    loadInitialData().catch(console.error);
  }, [isAdmin]);

  const handleCollect = async () => {
    if (!selectedClientId) return;
    setCollecting(true);
    setTab("audit");
    setAssetSearch("");
    setAssetStatusFilter("all");
    try {
      const data = await apiFetch<AuditPayload>(
        `/api/v1/audit/collect/${selectedClientId}?month=${referenceMonth}`
      );
      setAuditData(data);
      notify("Telemetria consolidada com sucesso!");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao coletar dados.");
    } finally {
      setCollecting(false);
    }
  };

  const handleDeleteHistory = async (item: HistoryRecord) => {
    if (!isAdmin) return;
    if (
      !window.confirm(
        `Excluir definitivamente o relatório "${item.client_name}" (${item.reference_month}) do histórico?`
      )
    ) {
      return;
    }
    try {
      await apiFetch(`/api/v1/audit/history/${item.id}`, { method: "DELETE" });
      setHistory((prev) => prev.filter((h) => h.id !== item.id));
      notify("Registro removido do histórico de PDFs.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao excluir registro do histórico.");
    }
  };

  const handleDeleteEcosystem = async (client: ClientMapping) => {
    if (!window.confirm(`Deseja realmente excluir o ecossistema "${client.display_name}"?`)) {
      return;
    }
    try {
      await apiFetch(`/api/v1/clients/${client.id}`, { method: "DELETE" });
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      if (String(client.id) === selectedClientId) {
        setSelectedClientId("");
        setAuditData(null);
      }
      notify("Ecossistema excluído do banco de dados.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao excluir ecossistema.");
    }
  };

  const handleRoleToggle = async (targetUser: ManagedUser, newRole: "admin" | "user") => {
    try {
      await apiFetch(`/api/v1/admin/users/${targetUser.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      setManagedUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
      );
      notify(`Permissão de ${targetUser.name} atualizada para ${newRole.toUpperCase()}.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao atualizar permissão.");
    }
  };

  const applyTemplate = (tplId: string) => {
    const tpl = templates.find((t) => String(t.id) === tplId);
    if (!tpl || !auditData) return;
    setAuditData({
      ...auditData,
      template_name: tpl.name,
      show_glpi_tickets: tpl.show_glpi_tickets,
      show_glpi_inventory: tpl.show_glpi_inventory,
      show_provimento_cnj: tpl.show_provimento_cnj,
      show_bitdefender: tpl.show_bitdefender,
      show_backups: tpl.show_backups,
      executive_summary: tpl.default_executive_summary || auditData.executive_summary,
    });
    notify(`Padrão "${tpl.name}" aplicado.`);
  };

  const handleSaveTemplate = async () => {
    if (!auditData || !newTplName.trim() || !isAdmin) return;
    try {
      const saved = await apiFetch<ReportTemplate>("/api/v1/templates", {
        method: "POST",
        body: JSON.stringify({
          name: newTplName.trim(),
          show_glpi_tickets: auditData.show_glpi_tickets,
          show_glpi_inventory: auditData.show_glpi_inventory,
          show_provimento_cnj: auditData.show_provimento_cnj,
          show_bitdefender: auditData.show_bitdefender,
          show_backups: auditData.show_backups,
          default_executive_summary: auditData.executive_summary,
        }),
      });
      setTemplates((prev) => [...prev, saved]);
      setNewTplName("");
      notify("Novo padrão de relatório salvo!");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao salvar padrão.");
    }
  };

  const handleExportPdf = async () => {
    if (!auditData) return;
    setExporting(true);
    try {
      const safeName = `Auditoria_SoftlanTI_${auditData.reference_month}_${auditData.client_name.replace(
        /\s+/g,
        "_"
      )}.pdf`;
      await apiDownloadPdf("/api/v1/audit/export-pdf", auditData, safeName);
      const updatedHistory = await apiFetch<HistoryRecord[]>("/api/v1/audit/history");
      setHistory(updatedHistory || []);
      notify("PDF gerado e arquivado no histórico!");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  const filteredUnifiedAssets = useMemo(() => {
    const base = auditData?.unified_assets ?? [];
    const term = normalizeSearch(assetSearch);
    return base.filter((asset) => {
      if (assetStatusFilter === "protected" && !asset.is_protected) return false;
      if (assetStatusFilter === "blocked" && asset.blocked_count === 0 && asset.is_protected)
        return false;
      if (!term) return true;
      const haystack = normalizeSearch(
        `${asset.endpoint_id} ${asset.hostname} ${asset.ip} ${asset.os} ${asset.cpu} ${asset.ram} ${asset.gpu} ${asset.remediation_status}`
      );
      return term.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [auditData?.unified_assets, assetSearch, assetStatusFilter]);

  const filteredHistory = useMemo(() => {
    const term = normalizeSearch(historySearch);
    return history.filter((item) => {
      if (historyMonthFilter && !item.reference_month.includes(historyMonthFilter.trim())) {
        return false;
      }
      if (!term) return true;
      const haystack = normalizeSearch(
        `${item.client_name} ${item.reference_month} ${item.template_name} ${item.sha256_hash} ${item.generated_by}`
      );
      return term.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [history, historySearch, historyMonthFilter]);

  const filteredAdminClients = useMemo(() => {
    const term = normalizeSearch(adminEcoSearch);
    return clients.filter((c) => {
      if (adminCnjOnly && !c.is_cartorio) return false;
      if (!term) return true;
      const haystack = normalizeSearch(
        `${c.display_name} ${c.glpi_entity_id} ${c.bitdefender_company_id || ""} ${c.zabbix_host_slug || ""}`
      );
      return term.split(/\s+/).every((token) => haystack.includes(token));
    });
  }, [clients, adminEcoSearch, adminCnjOnly]);

  const backupChannels = auditData?.backup_summary?.active_channels ?? [];
  const cnjTasks = auditData?.provimento_cnj?.tasks ?? [];
  const plantaoObitoList = auditData?.plantao_obito ?? [];

  const SidebarBody = () => (
    <div className="flex flex-col h-full justify-between p-5">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SoftlanBrand subtitle="Monthly Audit" compact />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-xl theme-nav-inactive cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-widest theme-text-muted px-3 mb-2">
            Navegação
          </div>
          <button
            type="button"
            onClick={() => {
              setTab("audit");
              if (window.innerWidth < 1024) setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              tab === "audit" ? "theme-accent-bg" : "theme-nav-inactive"
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            Estúdio de Auditoria
          </button>

          <button
            type="button"
            onClick={() => {
              setTab("history");
              if (window.innerWidth < 1024) setSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
              tab === "history" ? "theme-accent-bg" : "theme-nav-inactive"
            }`}
          >
            <span className="flex items-center gap-3">
              <History className="w-4 h-4 shrink-0" />
              Histórico de PDFs
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full theme-pill">
              {history.length}
            </span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setTab("admin");
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                tab === "admin" ? "theme-accent-bg" : "theme-nav-inactive"
              }`}
            >
              <span className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                Administração
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full theme-pill">
                Admin
              </span>
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-current/15 space-y-2.5">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest theme-text-muted px-1">
            <Palette className="w-3.5 h-3.5 theme-accent-text" />
            Aparência & Tema
          </div>
          <AnimatedSelect
            value={theme}
            searchable={false}
            onChange={(val) => handleThemeChange(val as AppTheme)}
            options={THEMES}
          />
        </div>
      </div>

      <div className="pt-4 border-t border-current/15 text-[11px] font-mono theme-text-muted space-y-1">
        <div className="flex items-center justify-between">
          <span>Perfil Ativo:</span>
          <span className="font-bold theme-accent-text uppercase">
            {isAdmin ? "Administrador" : "Operador"}
          </span>
        </div>
        <div className="truncate">© 2026 Gustavo Prestes</div>
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen flex overflow-x-hidden">
      <HeroShaderCanvas theme={theme} />

      <AnimatePresence>
        {themeWaveKey > 0 && (
          <motion.div
            key={themeWaveKey}
            initial={{ opacity: 0.55, scale: 0.2 }}
            animate={{ opacity: 0, scale: 2.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              background:
                "radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)",
            }}
            className="fixed inset-0 z-40 pointer-events-none"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.96 }}
            style={{ backgroundColor: "var(--bg-surface-strong)" }}
            className="fixed top-20 right-5 z-50 px-5 py-3 rounded-2xl border border-current/20 text-xs font-bold shadow-2xl theme-text-primary"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 272, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="hidden lg:block shrink-0 relative z-20 overflow-hidden"
          >
            <div className="w-[272px] p-4 h-screen sticky top-0">
              <div className="squircle-card h-full">
                <SidebarBody />
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden bg-black/60 backdrop-blur-sm flex"
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              style={{ backgroundColor: "var(--bg-surface-strong)" }}
              className="w-72 h-full border-r border-current/15 shadow-2xl theme-text-primary"
            >
              <SidebarBody />
            </motion.div>
            <div className="flex-1" onClick={() => setSidebarOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col justify-between relative z-10 min-h-screen">
        <div>
          <header className="sticky top-0 z-30 px-4 sm:px-6 pt-4">
            <div className="squircle-card px-4 sm:px-5 h-16 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen((prev) => !prev)}
                  className="p-2.5 rounded-xl theme-pill hover:opacity-85 transition cursor-pointer"
                  title={sidebarOpen ? "Recolher menu lateral" : "Expandir menu lateral"}
                  aria-label="Alternar menu lateral"
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="w-5 h-5 theme-accent-text" />
                  ) : (
                    <PanelLeftOpen className="w-5 h-5 theme-accent-text" />
                  )}
                </button>

                {!sidebarOpen && (
                  <div className="hidden sm:block">
                    <SoftlanBrand subtitle="Monthly Audit" compact />
                  </div>
                )}

                <div className="lg:hidden">
                  <SoftlanBrand subtitle="Audit" compact />
                </div>

                <div className="hidden xl:flex items-center gap-2 text-xs font-mono theme-text-muted pl-2 border-l border-current/15">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {tab === "audit" && "ESTÚDIO DE AUDITORIA MENSAL"}
                    {tab === "history" && "ARQUIVO IMUTÁVEL DE RELATÓRIOS"}
                    {tab === "admin" && "PAINEL DE ADMINISTRAÇÃO & GOVERNANÇA"}
                  </span>
                </div>
              </div>

              <div ref={accountMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-2xl theme-pill hover:opacity-90 transition cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-full theme-accent-bg flex items-center justify-center font-bold text-xs uppercase shrink-0">
                    {user.name.slice(0, 2)}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div className="text-xs font-bold leading-tight theme-text-primary">
                      {user.name}
                    </div>
                    <div className="text-[10px] font-mono theme-text-muted flex items-center gap-1">
                      {isAdmin ? (
                        <>
                          <Crown className="w-3 h-3 theme-accent-text" /> Administrador
                        </>
                      ) : (
                        <>
                          <UserIcon className="w-3 h-3" /> Analista Emissor
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 theme-text-muted" />
                </button>

                <AnimatePresence>
                  {accountMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 6, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      style={{ backgroundColor: "var(--bg-surface-strong)" }}
                      className="absolute right-0 mt-1 w-64 rounded-2xl border border-current/15 shadow-2xl p-3 space-y-2 z-50 theme-text-primary"
                    >
                      <div className="px-2 py-1.5 border-b border-current/10">
                        <div className="text-xs font-bold truncate">{user.name}</div>
                        <div className="text-[11px] font-mono theme-text-muted truncate">
                          {user.sub}
                        </div>
                      </div>

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setTab("admin");
                            setAccountMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold theme-nav-inactive transition cursor-pointer"
                        >
                          <UserCog className="w-4 h-4 theme-accent-text" />
                          Gerenciar Ecossistemas & Usuários
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={onLogout}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/15 transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        Encerrar Sessão
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          <main className="px-4 sm:px-6 py-6 max-w-[1520px] w-full mx-auto">
            <AnimatePresence mode="wait">
              {tab === "audit" && (
                <motion.div
                  key="tab-audit"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <section className="squircle-card p-6 grid md:grid-cols-12 gap-4 items-end relative z-20">
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-mono uppercase tracking-wider theme-text-muted mb-2">
                        Cliente / Serventia Mapeada
                      </label>
                      <AnimatedSelect
                        value={selectedClientId}
                        onChange={setSelectedClientId}
                        placeholder="Selecione o cliente para auditar..."
                        options={clients.map((c) => ({
                          value: String(c.id),
                          label: c.display_name,
                          sublabel: `GLPI #${c.glpi_entity_id}${
                            c.zabbix_host_slug ? ` • Zabbix: ${c.zabbix_host_slug}` : ""
                          }`,
                        }))}
                      />
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-mono uppercase tracking-wider theme-text-muted mb-2">
                        Competência (Mês/Ano)
                      </label>
                      <MonthYearPicker value={referenceMonth} onChange={setReferenceMonth} />
                    </div>

                    <div className="md:col-span-4 flex gap-3">
                      <button
                        type="button"
                        disabled={!selectedClientId || collecting}
                        onClick={handleCollect}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl theme-accent-bg disabled:opacity-50 text-sm font-bold transition cursor-pointer"
                      >
                        <RefreshCw className={`w-4 h-4 ${collecting ? "animate-spin" : ""}`} />
                        {collecting ? "Coletando APIs..." : "Coletar Dados"}
                      </button>
                    </div>
                  </section>

                  {clients.length === 0 ? (
                    <div className="squircle-card p-10 text-center space-y-4">
                      <EmptyAuditStudioIllustration />
                      <p className="text-sm theme-text-muted">
                        Nenhum cliente ou ecossistema foi vinculado ainda.
                      </p>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setTab("admin")}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl theme-accent-bg text-xs font-bold cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Ir para Administração e Vincular Cliente
                        </button>
                      )}
                    </div>
                  ) : (
                    !auditData && (
                      <div className="squircle-card p-10 text-center space-y-3">
                        <EmptyAuditStudioIllustration />
                        <h3 className="text-sm font-bold">Pronto para Consolidar Telemetria</h3>
                        <p className="text-xs theme-text-muted max-w-md mx-auto">
                          Selecione um cliente mapeado e a competência desejada acima para extrair
                          chamados GLPI, Plantão do Óbito, licenciamento Bitdefender e SLA de
                          backups Backblaze/Zabbix.
                        </p>
                      </div>
                    )
                  )}

                  {auditData && (
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-6"
                    >
                      {/* Bloco Superior: Controles do PDF (4 cols) + Parecer & KPIs & Backups (8 cols) */}
                      <div className="grid lg:grid-cols-12 gap-6 items-start">
                        <aside className="lg:col-span-4 space-y-6">
                          <div className="squircle-card p-6 space-y-4">
                            <h2 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                              <FileText className="w-4 h-4 theme-accent-text" />
                              Padrões & Seções do PDF
                            </h2>

                            <AnimatedSelect
                              value=""
                              onChange={applyTemplate}
                              searchable={false}
                              placeholder="Aplicar padrão salvo..."
                              options={templates.map((t) => ({
                                value: String(t.id),
                                label: t.name,
                              }))}
                            />

                            <div className="space-y-2 pt-2">
                              {[
                                { key: "show_glpi_tickets", label: "Chamados & Incidências GLPI" },
                                { key: "show_plantao_obito", label: "Relatório Plantão do Óbito" },
                                { key: "show_provimento_cnj", label: "Cronograma Provimento CNJ" },
                                { key: "show_bitdefender", label: "Segurança Bitdefender GravityZone" },
                                { key: "show_backups", label: "Auditoria de Backups (Zabbix / B2)" },
                                { key: "show_glpi_inventory", label: "Inventário Unificado & EDR" },
                              ].map((toggle) => (
                                <label
                                  key={toggle.key}
                                  className="flex items-center justify-between p-3 rounded-xl theme-pill cursor-pointer"
                                >
                                  <span className="text-xs font-semibold">{toggle.label}</span>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(auditData[toggle.key as keyof AuditPayload])}
                                    onChange={(e) =>
                                      setAuditData({ ...auditData, [toggle.key]: e.target.checked })
                                    }
                                    className="w-4 h-4 accent-[#ff5a1f]"
                                  />
                                </label>
                              ))}
                            </div>

                            {isAdmin && (
                              <div className="pt-3 border-t border-current/15 flex gap-2">
                                <input
                                  type="text"
                                  value={newTplName}
                                  onChange={(e) => setNewTplName(e.target.value)}
                                  placeholder="Salvar como novo padrão..."
                                  className="flex-1 theme-input rounded-xl px-3 py-2 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveTemplate}
                                  className="p-2.5 rounded-xl theme-accent-bg cursor-pointer"
                                  title="Salvar padrão"
                                >
                                  <BookmarkPlus className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={exporting}
                            onClick={handleExportPdf}
                            className="w-full py-4 px-6 rounded-2xl theme-accent-bg font-extrabold text-sm flex items-center justify-center gap-3 transition cursor-pointer"
                          >
                            <FileDown className="w-5 h-5" />
                            {exporting ? "Gerando PDF Oficial..." : "Gerar e Baixar PDF Oficial"}
                          </button>
                        </aside>

                        <section className="lg:col-span-8 space-y-6">
                          <div className="squircle-card p-6">
                            <label className="block text-xs font-mono uppercase tracking-wider theme-accent-text mb-2">
                              Parecer Executivo da Engenharia (Editável)
                            </label>
                            <textarea
                              rows={4}
                              value={auditData.executive_summary || ""}
                              onChange={(e) =>
                                setAuditData({ ...auditData, executive_summary: e.target.value })
                              }
                              className="w-full theme-input rounded-xl p-4 text-sm leading-relaxed"
                            />
                          </div>

                          <div className="grid sm:grid-cols-3 gap-4">
                            <div className="squircle-card p-5">
                              <div className="flex items-center justify-between text-xs theme-text-muted mb-3">
                                <span>CHAMADOS GLPI</span>
                                <SuperellipseTile size="sm" tone="accent">
                                  <IconGlpiService className="w-5 h-5" />
                                </SuperellipseTile>
                              </div>
                              <div className="text-3xl font-black">
                                {auditData.glpi_summary?.total_resolved ?? 0}
                                <span className="text-sm font-normal theme-text-muted">
                                  {" "}
                                  / {auditData.glpi_summary?.total_opened ?? 0} concluídos
                                </span>
                              </div>
                            </div>

                            <div className="squircle-card p-5">
                              <div className="flex items-center justify-between text-xs theme-text-muted mb-3">
                                <span>BITDEFENDER LICENÇAS</span>
                                <SuperellipseTile size="sm" tone="emerald">
                                  <IconBitdefenderShield className="w-5 h-5" />
                                </SuperellipseTile>
                              </div>
                              <div className="text-3xl font-black text-emerald-500">
                                {auditData.bitdefender_summary
                                  ? `${
                                      auditData.bitdefender_summary.used_seats ??
                                      auditData.bitdefender_summary.managed_endpoints
                                    } / ${
                                      auditData.bitdefender_summary.total_seats ??
                                      auditData.bitdefender_summary.total_endpoints
                                    }`
                                  : "N/A"}
                              </div>
                              <div className="text-[11px] theme-text-muted mt-1">
                                {auditData.bitdefender_summary
                                  ? `Validade: ${
                                      auditData.bitdefender_summary.expiration_date || "Não informada"
                                    } • Bloqueios: ${
                                      auditData.bitdefender_summary.total_blocked_events ?? 0
                                    }`
                                  : "Empresa não vinculada"}
                              </div>
                            </div>

                            <div className="squircle-card p-5">
                              <div className="flex items-center justify-between text-xs theme-text-muted mb-3">
                                <span>SLA BACKUPS (30D)</span>
                                <SuperellipseTile size="sm" tone="sky">
                                  <IconBackupVault className="w-5 h-5" />
                                </SuperellipseTile>
                              </div>
                              <div className="text-3xl font-black">
                                {auditData.backup_summary && backupChannels.length > 0
                                  ? `${auditData.backup_summary.overall_sla_percent ?? 100}%`
                                  : "N/A"}
                              </div>
                              <div className="text-[11px] theme-text-muted mt-1">
                                {auditData.backup_summary
                                  ? `${backupChannels.length} camadas auditadas`
                                  : "Host Zabbix não vinculado"}
                              </div>
                            </div>
                          </div>

                          {auditData.show_plantao_obito && plantaoObitoList.length > 0 && (
                            <div className="squircle-card p-6 space-y-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <HeartPulse className="w-4 h-4 theme-accent-text" />
                                  <h3 className="text-sm font-bold uppercase tracking-wider">
                                    Relatório Plantão do Óbito ({plantaoObitoList.length}{" "}
                                    {plantaoObitoList.length === 1 ? "registro" : "registros"})
                                  </h3>
                                </div>
                              </div>

                              <div className="space-y-3">
                                {plantaoObitoList.map((po) => (
                                  <div key={po.ticket_id} className="p-4 rounded-2xl theme-pill space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-xs font-bold">
                                        #{po.ticket_id} — {po.title}
                                      </span>
                                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase">
                                        {po.status}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-mono theme-text-muted flex flex-wrap gap-x-4 gap-y-1">
                                      <span>Abertura: {po.opened_at}</span>
                                      <span>Encerramento: {po.closed_at}</span>
                                      <span className="theme-accent-text font-semibold">
                                        Técnico: {po.technician}
                                      </span>
                                    </div>
                                    <div className="p-3 rounded-xl bg-black/15 text-xs leading-relaxed">
                                      <span className="font-bold uppercase text-[10px] font-mono theme-text-muted block mb-1">
                                        Validação de Encerramento:
                                      </span>
                                      {po.validation_text}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {auditData.show_backups &&
                            auditData.backup_summary &&
                            backupChannels.length > 0 && (
                              <div className="squircle-card p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <HardDrive className="w-4 h-4 theme-accent-text" />
                                    <h3 className="text-sm font-bold uppercase tracking-wider">
                                      Telemetria de Backups & Continuidade ({auditData.backup_summary.host_slug})
                                    </h3>
                                  </div>
                                  <span className="text-xs font-mono theme-accent-text font-bold">
                                    SLA Competência: {auditData.backup_summary.overall_sla_percent}%
                                  </span>
                                </div>

                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {backupChannels.map((ch) => (
                                    <div
                                      key={ch.channel}
                                      className={`p-3.5 rounded-xl border ${
                                        ch.is_healthy
                                          ? "bg-emerald-500/15 border-emerald-500/35"
                                          : "bg-red-500/15 border-red-500/35"
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-bold truncate">{ch.channel}</span>
                                        <span
                                          className={`text-[11px] font-extrabold uppercase ${
                                            ch.is_healthy ? "text-emerald-500" : "text-red-500"
                                          }`}
                                        >
                                          {ch.status}
                                        </span>
                                      </div>
                                      <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono theme-text-muted">
                                        <span>SLA: {ch.sla_30d_percent}%</span>
                                        <span>{ch.last_check}</span>
                                      </div>
                                      {ch.timeline && ch.timeline.length > 0 && (
                                        <div className="mt-2.5 flex items-center gap-1">
                                          {ch.timeline.map((t) => (
                                            <span
                                              key={t.date}
                                              title={`${t.date}: ${t.ok ? "Funcional" : "Com Falha"}`}
                                              className={`h-2 flex-1 rounded-sm ${
                                                t.ok ? "bg-emerald-500" : "bg-red-500"
                                              }`}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {(auditData.backup_summary.disk_usage?.length ?? 0) > 0 && (
                                  <div className="pt-3 border-t border-current/10 space-y-2">
                                    <div className="text-[11px] font-mono uppercase tracking-wider theme-text-muted">
                                      Ocupação de Disco & Armazenamento Monitorado (%)
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-2.5">
                                      {auditData.backup_summary.disk_usage.map((d) => {
                                        const isCloudOrNas =
                                          d.volume.toLowerCase().includes("replica") ||
                                          d.volume.toLowerCase().includes("nuvem") ||
                                          d.volume.toLowerCase().includes("storage") ||
                                          d.volume.toLowerCase().includes("b2");
                                        return (
                                          <div key={d.volume} className="p-2.5 rounded-xl theme-pill space-y-1.5">
                                            <div className="flex items-center justify-between text-xs font-semibold gap-2">
                                              <span className="flex items-center gap-2 truncate">
                                                {isCloudOrNas ? (
                                                  <CloudStorageNasIcon className="w-4 h-4 theme-accent-text shrink-0" />
                                                ) : (
                                                  <ExternalBackupDriveIcon className="w-4 h-4 theme-accent-text shrink-0" />
                                                )}
                                                <span className="truncate">{d.volume}</span>
                                              </span>
                                              <span className="font-mono shrink-0">{d.used_percent}%</span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full bg-current/10 overflow-hidden">
                                              <div
                                                style={{ width: `${Math.min(d.used_percent, 100)}%` }}
                                                className={`h-full rounded-full ${
                                                  d.used_percent >= 90
                                                    ? "bg-red-500"
                                                    : d.used_percent >= 80
                                                      ? "bg-amber-500"
                                                      : "bg-emerald-500"
                                                }`}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                          {auditData.show_provimento_cnj && auditData.provimento_cnj?.has_project && (
                            <div className="squircle-card p-6 space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-[11px] font-mono theme-accent-text uppercase">
                                    Adequação Normativa • Ticket #{auditData.provimento_cnj.ticket_id}
                                  </span>
                                  <h3 className="text-base font-bold">
                                    {auditData.provimento_cnj.project_title}
                                  </h3>
                                </div>
                                <span className="text-2xl font-black theme-accent-text">
                                  {auditData.provimento_cnj.progress_percent}%
                                </span>
                              </div>
                              <div className="space-y-2">
                                {cnjTasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className="flex items-center justify-between p-3 rounded-xl theme-pill text-xs"
                                  >
                                    <span>{task.title}</span>
                                    <span
                                      className={`inline-flex items-center gap-1 font-semibold ${
                                        task.completed ? "text-emerald-500" : "text-amber-500"
                                      }`}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      {task.completed ? "Concluída" : "Em Execução"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </section>
                      </div>

                      {/* Bloco Full-Width (100% da largura da tela): Inventário Unificado & Telemetria Bitdefender */}
                      {(auditData.show_glpi_inventory || auditData.show_bitdefender) &&
                        (auditData.unified_assets?.length ?? 0) > 0 && (
                          <section className="squircle-card p-6 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div className="flex items-center gap-2.5">
                                <Cpu className="w-5 h-5 theme-accent-text" />
                                <div>
                                  <h3 className="text-sm font-bold uppercase tracking-wider">
                                    Inventário Unificado &amp; Telemetria Bitdefender (
                                    {filteredUnifiedAssets.length} /{" "}
                                    {auditData.unified_assets.length} ativos)
                                  </h3>
                                  <p className="text-[11px] theme-text-muted">
                                    Consolidação cruzada de hardware GLPI e proteção ativa de
                                    endpoints GravityZone.
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2.5">
                                <div className="relative">
                                  <Search className="w-3.5 h-3.5 theme-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                                  <input
                                    type="text"
                                    value={assetSearch}
                                    onChange={(e) => setAssetSearch(e.target.value)}
                                    placeholder="Buscar hostname, IP, ID, CPU, SO..."
                                    className="theme-input rounded-xl pl-8 pr-3 py-2 text-xs w-64"
                                  />
                                </div>

                                <div className="flex items-center gap-1 p-1 rounded-xl theme-pill text-[11px]">
                                  {[
                                    { id: "all", label: "Todos" },
                                    { id: "protected", label: "Protegidos" },
                                    { id: "blocked", label: "Com Bloqueios" },
                                  ].map((f) => (
                                    <button
                                      key={f.id}
                                      type="button"
                                      onClick={() =>
                                        setAssetStatusFilter(f.id as "all" | "protected" | "blocked")
                                      }
                                      className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer ${
                                        assetStatusFilter === f.id
                                          ? "theme-accent-bg"
                                          : "theme-text-muted hover:opacity-85"
                                      }`}
                                    >
                                      {f.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="border-b border-current/15 theme-text-muted font-mono text-[10px] uppercase">
                                  <tr>
                                    <th className="py-3 pr-4">Estação / Hostname</th>
                                    <th className="py-3 pr-4">Endereço IP</th>
                                    <th className="py-3 pr-4">Processador (CPU)</th>
                                    <th className="py-3 pr-4">Memória</th>
                                    <th className="py-3 pr-4">Placa de Vídeo</th>
                                    <th className="py-3 pr-4">Sistema Operacional</th>
                                    <th className="py-3 pr-4 text-center">Bloqueios</th>
                                    <th className="py-3">Mitigação / Proteção</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-current/10">
                                  {filteredUnifiedAssets.map((asset) => {
                                    const serverType = isServerAsset(asset.hostname, asset.os);
                                    return (
                                      <tr
                                        key={`${asset.hostname}-${asset.endpoint_id}`}
                                        className="hover:bg-current/[0.03] transition-colors"
                                      >
                                        <td className="py-3 pr-4 whitespace-nowrap">
                                          <div className="flex items-center gap-2.5">
                                            {serverType ? (
                                              <RackServerIcon className="w-4 h-4 theme-accent-text shrink-0" />
                                            ) : (
                                              <WorkstationDesktopIcon className="w-4 h-4 theme-accent-text shrink-0" />
                                            )}
                                            <div>
                                              <div className="font-bold">{asset.hostname}</div>
                                              <div className="text-[10px] font-mono theme-text-muted">
                                                ID EDR: {asset.endpoint_id.slice(0, 10)}
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                        <td className="py-3 pr-4 font-mono text-xs whitespace-nowrap">
                                          {asset.ip}
                                        </td>
                                        <td className="py-3 pr-4 theme-text-muted max-w-[230px]">
                                          {asset.cpu !== "-" ? (
                                            asset.cpu
                                          ) : (
                                            <span className="italic opacity-70">
                                              Aguardando ficha GLPI
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-3 pr-4 whitespace-nowrap">
                                          {asset.ram !== "-" ? (
                                            <span className="px-2 py-0.5 rounded-md theme-pill theme-accent-text font-mono font-bold text-[11px]">
                                              {asset.ram}
                                            </span>
                                          ) : (
                                            <span className="theme-text-muted">-</span>
                                          )}
                                        </td>
                                        <td className="py-3 pr-4 theme-text-muted max-w-[180px]">
                                          {asset.gpu !== "-" ? asset.gpu : "-"}
                                        </td>
                                        <td className="py-3 pr-4 theme-text-muted whitespace-nowrap">
                                          {asset.os}
                                        </td>
                                        <td className="py-3 pr-4 text-center font-mono font-bold">
                                          {asset.blocked_count}
                                        </td>
                                        <td className="py-3 whitespace-nowrap">
                                          <span
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                              asset.is_protected
                                                ? "bg-emerald-500/15 text-emerald-500"
                                                : "bg-amber-500/15 text-amber-500"
                                            }`}
                                          >
                                            <EndpointAntivirusIcon className="w-3.5 h-3.5 shrink-0" />
                                            <span>{asset.remediation_status}</span>
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </section>
                        )}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {tab === "history" && (
                <motion.section
                  key="tab-history"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="squircle-card p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold">
                        Histórico Imutável de Relatórios Gerados
                      </h2>
                      <p className="text-xs theme-text-muted">
                        Pesquise por cliente, competência, modelo ou assinatura SHA-256.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 theme-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                          placeholder="Pesquisar cliente, hash ou autor..."
                          className="theme-input rounded-xl pl-8 pr-3 py-2 text-xs w-64"
                        />
                      </div>

                      <input
                        type="month"
                        value={historyMonthFilter}
                        onChange={(e) => setHistoryMonthFilter(e.target.value)}
                        className="theme-input rounded-xl px-3 py-2 text-xs"
                        title="Filtrar por competência"
                      />

                      {(historySearch || historyMonthFilter) && (
                        <button
                          type="button"
                          onClick={() => {
                            setHistorySearch("");
                            setHistoryMonthFilter("");
                          }}
                          className="px-3 py-2 rounded-xl theme-pill text-xs font-semibold cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredHistory.length === 0 ? (
                    <div className="py-10 text-center space-y-3">
                      <EmptyHistoryVaultIllustration />
                      <p className="text-sm theme-text-muted">
                        Nenhum relatório encontrado para os critérios pesquisados.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-current/10">
                      {filteredHistory.map((item) => (
                        <div
                          key={item.id}
                          className="py-4 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-bold">{item.client_name}</div>
                            <div className="text-xs theme-text-muted font-mono">
                              Competência: {item.reference_month} • Modelo: {item.template_name}
                            </div>
                            <CryptographicAuditSeal hash={item.sha256_hash} />
                          </div>

                          <div className="flex items-center gap-2.5">
                            <a
                              href={`/api/v1/audit/history/${item.id}/reprint`}
                              className="px-4 py-2 rounded-xl theme-accent-bg text-xs font-semibold transition"
                            >
                              Baixar 2ª Via PDF
                            </a>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteHistory(item)}
                                className="p-2 rounded-xl theme-pill hover:bg-red-500/20 text-red-500 transition cursor-pointer"
                                title="Excluir relatório do histórico (Admin)"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.section>
              )}

              {tab === "admin" && isAdmin && (
                <motion.div
                  key="tab-admin"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="space-y-8"
                >
                  <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold">
                          Gestão de Ecossistemas (Banco de Dados)
                        </h2>
                        <p className="text-xs theme-text-muted">
                          Crie, pesquise, edite ou exclua vínculos entre GLPI, Bitdefender e Zabbix.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 theme-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={adminEcoSearch}
                            onChange={(e) => setAdminEcoSearch(e.target.value)}
                            placeholder="Filtrar ecossistema, ID ou slug..."
                            className="theme-input rounded-xl pl-8 pr-3 py-2 text-xs w-60"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => setAdminCnjOnly((prev) => !prev)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                            adminCnjOnly ? "theme-accent-bg" : "theme-pill"
                          }`}
                        >
                          <Filter className="w-3.5 h-3.5" />
                          Serventias CNJ
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingClient(null);
                            setModalOpen(true);
                          }}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl theme-accent-bg text-xs font-bold cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Criar Novo Ecossistema
                        </button>
                      </div>
                    </div>

                    {filteredAdminClients.length === 0 ? (
                      <div className="squircle-card p-10 text-center space-y-3">
                        <EmptyAuditStudioIllustration />
                        <p className="text-sm theme-text-muted">
                          Nenhum ecossistema encontrado com os filtros atuais.
                        </p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                        {filteredAdminClients.map((c) => (
                          <div
                            key={c.id}
                            className="squircle-card p-5 flex flex-col justify-between gap-4"
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-sm font-bold leading-snug">{c.display_name}</h3>
                                {c.is_cartorio && (
                                  <span className="px-2 py-0.5 rounded-full theme-pill theme-accent-text text-[10px] font-bold uppercase shrink-0">
                                    CNJ
                                  </span>
                                )}
                              </div>

                              <div className="space-y-1 text-xs font-mono theme-text-muted">
                                <div className="flex items-center gap-2">
                                  <Ticket className="w-3.5 h-3.5 theme-accent-text" />
                                  <span>GLPI Entity: #{c.glpi_entity_id}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="truncate">
                                    Bitdefender: {c.bitdefender_company_id || "Não vinculado"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <HardDrive className="w-3.5 h-3.5 text-sky-500" />
                                  <span>Zabbix: {c.zabbix_host_slug || "Não vinculado"}</span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-3 border-t border-current/15 flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedClientId(String(c.id));
                                  setTab("audit");
                                }}
                                className="text-xs font-bold theme-accent-text hover:underline cursor-pointer"
                              >
                                Abrir no Estúdio →
                              </button>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingClient(c);
                                    setModalOpen(true);
                                  }}
                                  className="p-2 rounded-xl theme-pill hover:opacity-80 transition cursor-pointer"
                                  title="Editar ecossistema"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEcosystem(c)}
                                  className="p-2 rounded-xl theme-pill hover:bg-red-500/20 text-red-500 transition cursor-pointer"
                                  title="Excluir ecossistema"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="squircle-card p-6 space-y-4">
                    <div>
                      <h2 className="text-lg font-bold flex items-center gap-2">
                        <UserCog className="w-5 h-5 theme-accent-text" />
                        Permissões de Usuários
                      </h2>
                      <p className="text-xs theme-text-muted">
                        Usuários padrão emitem relatórios. Administradores gerenciam ecossistemas e
                        acessos.
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-current/15 theme-text-muted font-mono text-[10px] uppercase">
                          <tr>
                            <th className="py-2.5 pr-4">Usuário</th>
                            <th className="py-2.5 pr-4">E-mail Corporativo</th>
                            <th className="py-2.5 pr-4">Nível de Acesso</th>
                            <th className="py-2.5 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-current/10">
                          {managedUsers.map((u) => (
                            <tr key={u.id}>
                              <td className="py-3 pr-4 font-bold">{u.name}</td>
                              <td className="py-3 pr-4 font-mono theme-text-muted">{u.email}</td>
                              <td className="py-3 pr-4">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                                    u.role === "admin" ? "theme-accent-bg" : "theme-pill"
                                  }`}
                                >
                                  {u.role === "admin" ? "Administrador" : "Usuário Emissor"}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                {u.is_env_locked ? (
                                  <span className="text-[11px] font-mono theme-text-muted">
                                    Root Admin Protegido
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRoleToggle(u, u.role === "admin" ? "user" : "admin")
                                    }
                                    className="px-3 py-1.5 rounded-xl theme-pill hover:opacity-80 text-xs font-semibold transition cursor-pointer"
                                  >
                                    {u.role === "admin"
                                      ? "Alterar para Usuário"
                                      : "Promover a Admin"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>

        <footer className="px-4 sm:px-6 pb-5 pt-2 max-w-[1520px] w-full mx-auto">
          <div className="squircle-card px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono theme-text-muted">
            <span>© 2026 Gustavo Prestes • Todos os direitos reservados.</span>
            <span>Monthly Audit Platform • Engenharia & Governança</span>
          </div>
        </footer>
      </div>

      {isAdmin && (
        <ClientMappingModal
          open={modalOpen}
          editingClient={editingClient}
          onClose={() => {
            setModalOpen(false);
            setEditingClient(null);
          }}
          onSaved={(savedClient) => {
            setClients((prev) => {
              const exists = prev.some((c) => c.id === savedClient.id);
              return exists
                ? prev.map((c) => (c.id === savedClient.id ? savedClient : c))
                : [...prev, savedClient];
            });
            setSelectedClientId(String(savedClient.id));
            notify(
              editingClient
                ? "Ecossistema atualizado no PostgreSQL!"
                : "Novo ecossistema criado e salvo!"
            );
          }}
        />
      )}
    </div>
  );
}