import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileDown,
  Plus,
  RefreshCw,
  Shield,
  HardDrive,
  Ticket,
  Scale,
  BookmarkPlus,
  History,
  LogOut,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { HeroShaderCanvas } from "../components/HeroShaderCanvas";
import { ClientMappingModal } from "../components/ClientMappingModal";
import { apiFetch } from "../lib/api";
import type {
  AuditHistoryRecord,
  AuditPayload,
  ClientMapping,
  ReportTemplate,
  UserProfile,
} from "../types/audit";

interface DashboardPageProps {
  user: UserProfile;
  onLogout: () => void;
}

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [clients, setClients] = useState<ClientMapping[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [history, setHistory] = useState<AuditHistoryRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number>(0);
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [auditData, setAuditData] = useState<AuditPayload | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [tab, setTab] = useState<"editor" | "history">("editor");

  const loadInitialData = async () => {
    const [cls, tpls, hist] = await Promise.all([
      apiFetch<ClientMapping[]>("/api/v1/clients"),
      apiFetch<ReportTemplate[]>("/api/v1/templates"),
      apiFetch<AuditHistoryRecord[]>("/api/v1/audit/history"),
    ]);
    setClients(cls);
    setTemplates(tpls);
    setHistory(hist);
  };

  useEffect(() => {
    loadInitialData().catch(() => {});
  }, []);

  const handleCollect = async () => {
    if (!selectedClientId) return;
    setLoadingAudit(true);
    try {
      const res = await apiFetch<AuditPayload>(
        `/api/v1/audit/collect/${selectedClientId}?month=${month}`
      );
      setAuditData(res);
      setTab("editor");
    } finally {
      setLoadingAudit(false);
    }
  };

  const applyTemplate = (tpl: ReportTemplate) => {
    if (!auditData) return;
    setAuditData({
      ...auditData,
      template_name: tpl.name,
      show_glpi_tickets: tpl.show_glpi_tickets,
      show_glpi_inventory: tpl.show_glpi_inventory,
      show_provimento_cnj: tpl.show_provimento_cnj && Boolean(auditData.provimento_cnj?.has_project),
      show_bitdefender: tpl.show_bitdefender,
      show_backups: tpl.show_backups,
      executive_summary: tpl.default_executive_note || auditData.executive_summary,
    });
  };

  const handleSaveTemplate = async () => {
    if (!auditData || !newTemplateName.trim()) return;
    await apiFetch("/api/v1/templates", {
      method: "POST",
      body: JSON.stringify({
        name: newTemplateName.trim(),
        description: "Padrão customizado Softlan TI",
        show_glpi_tickets: auditData.show_glpi_tickets,
        show_glpi_inventory: auditData.show_glpi_inventory,
        show_provimento_cnj: auditData.show_provimento_cnj,
        show_bitdefender: auditData.show_bitdefender,
        show_backups: auditData.show_backups,
        default_executive_note: auditData.executive_summary,
      }),
    });
    setNewTemplateName("");
    loadInitialData();
  };

  const handleExportPdf = async () => {
    if (!auditData) return;
    setExporting(true);
    try {
      const resp = await fetch("/api/v1/audit/export-pdf", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auditData),
      });
      if (!resp.ok) throw new Error("Falha ao gerar PDF.");
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Auditoria_SoftlanTI_${auditData.reference_month}_${auditData.client_name.replace(/\s+/g, "_")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      loadInitialData();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-grain pb-20">
      <HeroShaderCanvas />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070a11]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#ff5a1f] flex items-center justify-center font-black text-white">
              S
            </div>
            <span className="font-extrabold tracking-[0.12em] text-white text-sm">
              SOFTLAN <span className="text-[#ff5a1f]">TI</span> • MONTHLY AUDIT
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTab("editor")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === "editor" ? "bg-[#ff5a1f] text-white" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              Estúdio de Auditoria
            </button>
            <button
              onClick={() => setTab("history")}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                tab === "history" ? "bg-[#ff5a1f] text-white" : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Histórico ({history.length})
            </button>

            <div className="h-5 w-px bg-white/15 mx-1" />

            <span className="hidden md:inline text-xs text-slate-400 font-mono">{user.sub}</span>
            <button
              onClick={onLogout}
              title="Sair"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8 space-y-8">
        {/* Control Bar */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="squircle-card p-6 grid lg:grid-cols-12 gap-4 items-end"
        >
          <div className="lg:col-span-5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Cliente / Serventia Mapeada
            </label>
            <div className="flex gap-2">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(Number(e.target.value))}
                className="flex-1 rounded-xl bg-slate-950/90 border border-white/15 px-3.5 py-2.5 text-sm text-white"
              >
                <option value={0}>Selecione o cliente para auditar...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowMappingModal(true)}
                title="Vincular novo cliente"
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Competência (Mês/Ano)
            </label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-full rounded-xl bg-slate-950/90 border border-white/15 px-3.5 py-2.5 text-sm text-white"
            />
          </div>

          <div className="lg:col-span-4 flex gap-3">
            <button
              onClick={handleCollect}
              disabled={!selectedClientId || loadingAudit}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff5a1f] hover:bg-[#ff6d38] disabled:opacity-40 text-white font-bold text-sm bloom-orange transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loadingAudit ? "animate-spin" : ""}`} />
              {loadingAudit ? "Coletando APIs..." : "Coletar Dados"}
            </button>

            {auditData && (
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                {exporting ? "Gerando..." : "Exportar PDF"}
              </button>
            )}
          </div>
        </motion.section>

        {tab === "history" ? (
          <section className="squircle-card p-6">
            <h2 className="text-lg font-bold text-white mb-4">
              Histórico de Relatórios Emitidos (Trilha Auditável)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-400 border-b border-white/10">
                  <tr>
                    <th className="py-3 px-4">Cliente</th>
                    <th className="py-3 px-4">Competência</th>
                    <th className="py-3 px-4">Padrão</th>
                    <th className="py-3 px-4">Emissor</th>
                    <th className="py-3 px-4">Hash SHA-256</th>
                    <th className="py-3 px-4 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((h) => (
                    <tr key={h.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 px-4 font-semibold text-white">{h.client_name}</td>
                      <td className="py-3 px-4 font-mono text-xs">{h.reference_month}</td>
                      <td className="py-3 px-4 text-xs text-slate-300">{h.template_name}</td>
                      <td className="py-3 px-4 text-xs text-slate-400">{h.generated_by}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-[#ff7b47]">
                        {h.sha256_hash.slice(0, 16)}...
                      </td>
                      <td className="py-3 px-4 text-right">
                        <a
                          href={`/api/v1/audit/history/${h.id}/reprint`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-[#ff5a1f] text-xs font-semibold text-white transition"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          Baixar PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <AnimatePresence mode="wait">
            {auditData && (
              <motion.div
                key={auditData.client_mapping_id + auditData.reference_month}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Barra de Padrões de Envio (Templates Salvos) */}
                <div className="squircle-card p-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono uppercase text-slate-400 mr-2">
                      Padrões de Envio:
                    </span>
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        onClick={() => applyTemplate(tpl)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-[#ff5a1f]/20 border border-white/10 hover:border-[#ff5a1f] text-xs font-medium text-slate-200 transition cursor-pointer"
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Nome do novo padrão (ex: Sem Bitdefender)"
                      className="rounded-lg bg-slate-950 border border-white/15 px-3 py-1.5 text-xs text-white w-64"
                    />
                    <button
                      onClick={handleSaveTemplate}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-[#ff5a1f]" />
                      Salvar Padrão
                    </button>
                  </div>
                </div>

                {/* Bento Grid Editável */}
                <div className="grid lg:grid-cols-12 gap-6">
                  {/* Parecer Executivo Editável */}
                  <div className="lg:col-span-12 squircle-card p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                        Parecer Executivo (Editável antes da Exportação)
                      </h3>
                      <span className="text-xs font-mono text-[#ff7b47]">
                        Cliente: {auditData.client_name}
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={auditData.executive_summary}
                      onChange={(e) =>
                        setAuditData({ ...auditData, executive_summary: e.target.value })
                      }
                      className="w-full rounded-xl bg-slate-950/90 border border-white/15 p-3.5 text-sm text-slate-100 focus:border-[#ff5a1f] focus:outline-none"
                    />
                  </div>

                  {/* Card 1: GLPI Chamados & Inventário */}
                  <div className="lg:col-span-6 squircle-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white font-bold">
                        <Ticket className="w-5 h-5 text-[#ff5a1f]" />
                        GLPI • Chamados & Inventário
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={auditData.show_glpi_tickets}
                          onChange={(e) =>
                            setAuditData({ ...auditData, show_glpi_tickets: e.target.checked })
                          }
                          className="accent-[#ff5a1f]"
                        />
                        Exibir no PDF
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                        <div className="text-[11px] text-slate-400">Abertos</div>
                        <div className="text-2xl font-black text-white">
                          {auditData.glpi_summary.total_opened}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                        <div className="text-[11px] text-slate-400">Resolvidos</div>
                        <div className="text-2xl font-black text-[#ff5a1f]">
                          {auditData.glpi_summary.total_resolved}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                        <div className="text-[11px] text-slate-400">Ativos GLPI</div>
                        <div className="text-2xl font-black text-white">
                          {auditData.glpi_summary.inventory.total_machines}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <span className="text-xs text-slate-400">
                        {auditData.glpi_summary.inventory.note}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={auditData.show_glpi_inventory}
                          onChange={(e) =>
                            setAuditData({ ...auditData, show_glpi_inventory: e.target.checked })
                          }
                          className="accent-[#ff5a1f]"
                        />
                        Incluir Inventário
                      </label>
                    </div>
                  </div>

                  {/* Card 2: Bitdefender GravityZone */}
                  <div className="lg:col-span-6 squircle-card p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white font-bold">
                        <Shield className="w-5 h-5 text-[#ff5a1f]" />
                        Bitdefender GravityZone
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={auditData.show_bitdefender}
                          onChange={(e) =>
                            setAuditData({ ...auditData, show_bitdefender: e.target.checked })
                          }
                          className="accent-[#ff5a1f]"
                        />
                        Exibir no PDF
                      </label>
                    </div>

                    {auditData.bitdefender_summary ? (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                          <div className="text-[11px] text-slate-400">Endpoints</div>
                          <div className="text-2xl font-black text-white">
                            {auditData.bitdefender_summary.managed_endpoints}
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                          <div className="text-[11px] text-slate-400">Saúde</div>
                          <div className="text-2xl font-black text-emerald-400">
                            {auditData.bitdefender_summary.security_health_percent}%
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10">
                          <div className="text-[11px] text-slate-400">Quarentena</div>
                          <div className="text-2xl font-black text-white">
                            {auditData.bitdefender_summary.quarantine_items}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Cliente sem tenant vinculado no Bitdefender GravityZone.
                      </p>
                    )}
                  </div>

                  {/* Card 3: Adequação Tecnológica: Provimento CNJ (Exibido apenas se houver projeto) */}
                  {auditData.provimento_cnj?.has_project && (
                    <div className="lg:col-span-6 squircle-card p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-white font-bold">
                          <Scale className="w-5 h-5 text-[#ff5a1f]" />
                          Adequação Tecnológica: Provimento CNJ
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={auditData.show_provimento_cnj}
                            onChange={(e) =>
                              setAuditData({ ...auditData, show_provimento_cnj: e.target.checked })
                            }
                            className="accent-[#ff5a1f]"
                          />
                          Exibir no PDF
                        </label>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1.5">
                          <span className="text-slate-300 font-medium">
                            {auditData.provimento_cnj.project_title}
                          </span>
                          <span className="font-mono font-bold text-[#ff5a1f]">
                            {auditData.provimento_cnj.progress_percent}%
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-[#ff5a1f]"
                            style={{ width: `${auditData.provimento_cnj.progress_percent}%` }}
                          />
                        </div>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {auditData.provimento_cnj.tasks.map((tk) => (
                          <div
                            key={tk.id}
                            className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-white/[0.02]"
                          >
                            <span className="text-slate-200 truncate pr-3">{tk.title}</span>
                            <span
                              className={`font-mono text-[10px] px-2 py-0.5 rounded-full ${
                                tk.completed
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-amber-500/20 text-amber-300"
                              }`}
                            >
                              {tk.completed ? "OK" : "Pendente"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Card 4: Auditoria de Backups (Zabbix / Backblaze B2) */}
                  <div
                    className={`${
                      auditData.provimento_cnj?.has_project ? "lg:col-span-6" : "lg:col-span-12"
                    } squircle-card p-6 space-y-4`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white font-bold">
                        <HardDrive className="w-5 h-5 text-[#ff5a1f]" />
                        Auditoria de Backups & Continuidade (B2 / Zabbix)
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={auditData.show_backups}
                          onChange={(e) =>
                            setAuditData({ ...auditData, show_backups: e.target.checked })
                          }
                          className="accent-[#ff5a1f]"
                        />
                        Exibir no PDF
                      </label>
                    </div>

                    {auditData.backup_summary?.active_channels?.length ? (
                      <>
                        <div className="space-y-2">
                          {auditData.backup_summary.active_channels.map((ch) => (
                            <div
                              key={ch.channel}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                {ch.is_healthy ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                                )}
                                <span className="font-semibold text-white">{ch.channel}</span>
                              </div>
                              <div className="flex items-center gap-4 font-mono">
                                <span className="text-slate-400">SLA 30d: {ch.sla_30d_percent}%</span>
                                <span className="text-slate-300">{ch.last_check}</span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                            Observação Técnica de Backups no PDF
                          </label>
                          <input
                            type="text"
                            value={auditData.backup_summary.analyst_note}
                            onChange={(e) =>
                              setAuditData({
                                ...auditData,
                                backup_summary: {
                                  ...auditData.backup_summary!,
                                  analyst_note: e.target.value,
                                },
                              })
                            }
                            className="w-full rounded-xl bg-slate-950/90 border border-white/15 px-3 py-2 text-xs text-white"
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Nenhum canal de backup configurado para este host no Zabbix.
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {showMappingModal && (
        <ClientMappingModal
          onClose={() => setShowMappingModal(false)}
          onSaved={loadInitialData}
        />
      )}
    </div>
  );
}