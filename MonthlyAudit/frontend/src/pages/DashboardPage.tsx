import { useEffect, useState } from "react";
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
  SlidersHorizontal,
} from "lucide-react";
import { HeroShaderCanvas } from "../components/HeroShaderCanvas";
import { SoftlanBrand } from "../components/SoftlanBrand";
import { AnimatedSelect } from "../components/AnimatedSelect";
import { ClientMappingModal } from "../components/ClientMappingModal";
import { apiFetch, apiDownloadPdf } from "../lib/api";
import type {
  AuditPayload,
  ClientMapping,
  HistoryRecord,
  ReportTemplate,
  UserProfile,
} from "../types/audit";

interface DashboardPageProps {
  user: UserProfile;
  onLogout: () => void;
}

export function DashboardPage({ user, onLogout }: DashboardPageProps) {
  const [tab, setTab] = useState<"audit" | "ecosystems" | "history">("audit");
  const [clients, setClients] = useState<ClientMapping[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [referenceMonth, setReferenceMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [auditData, setAuditData] = useState<AuditPayload | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientMapping | null>(null);
  const [newTplName, setNewTplName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

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
    setClients(cList);
    setTemplates(tList);
    setHistory(hList);
  };

  useEffect(() => {
    loadInitialData().catch(console.error);
  }, []);

  const handleCollect = async () => {
    if (!selectedClientId) return;
    setCollecting(true);
    setTab("audit");
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
      notify("Ecossistema removido com sucesso.");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao excluir ecossistema.");
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
    notify(`Padrão "${tpl.name}" aplicado ao relatório.`);
  };

  const handleSaveTemplate = async () => {
    if (!auditData || !newTplName.trim()) return;
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
      setHistory(updatedHistory);
      notify("PDF gerado e arquivado no histórico!");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Erro ao gerar PDF.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="relative min-h-screen text-slate-100 pb-20 bg-grain">
      <HeroShaderCanvas />

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -24, scale: 0.96 }}
            className="fixed top-5 right-5 z-50 px-5 py-3 rounded-2xl bg-[#0e1525] border border-[#ff5a1f]/50 text-white text-xs font-semibold shadow-2xl bloom-orange"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070b14]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between gap-4">
          <SoftlanBrand subtitle="Monthly Audit" compact />

          <nav className="flex items-center gap-1.5 bg-white/[0.04] p-1.5 rounded-full border border-white/10">
            <button
              type="button"
              onClick={() => setTab("audit")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                tab === "audit"
                  ? "bg-[#ff5a1f] text-white shadow-[0_0_20px_rgba(255,90,31,0.45)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Estúdio de Auditoria
            </button>
            <button
              type="button"
              onClick={() => setTab("ecosystems")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                tab === "ecosystems"
                  ? "bg-[#ff5a1f] text-white shadow-[0_0_20px_rgba(255,90,31,0.45)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Ecossistemas ({clients.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                tab === "history"
                  ? "bg-[#ff5a1f] text-white shadow-[0_0_20px_rgba(255,90,31,0.45)]"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Histórico ({history.length})
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden md:block text-xs text-slate-400 font-mono">{user.sub}</span>
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-xl bg-white/[0.05] hover:bg-red-500/20 text-slate-300 hover:text-red-300 transition cursor-pointer"
              title="Encerrar sessão"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-8">
        <AnimatePresence mode="wait">
          {tab === "audit" && (
            <motion.div
              key="tab-audit"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-8"
            >
              {/* Barra de Seleção & Coleta */}
              <section className="squircle-card p-6 grid md:grid-cols-12 gap-4 items-end relative z-20">
                <div className="md:col-span-5">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                    Cliente / Serventia Mapeada
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
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
                    <button
                      type="button"
                      onClick={() => {
                        setEditingClient(null);
                        setModalOpen(true);
                      }}
                      className="px-3.5 rounded-xl bg-white/[0.06] hover:bg-[#ff5a1f]/20 border border-white/10 hover:border-[#ff5a1f]/50 text-slate-200 hover:text-[#ff7b47] transition cursor-pointer"
                      title="Vincular novo cliente"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                    Competência (Mês/Ano)
                  </label>
                  <input
                    type="month"
                    value={referenceMonth}
                    onChange={(e) => setReferenceMonth(e.target.value)}
                    className="w-full bg-[#090e1a]/90 border border-white/12 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#ff5a1f]"
                  />
                </div>

                <div className="md:col-span-4 flex gap-3">
                  <button
                    type="button"
                    disabled={!selectedClientId || collecting}
                    onClick={handleCollect}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[#ff5a1f] hover:bg-[#ff6d38] disabled:opacity-50 text-white text-sm font-bold bloom-orange transition cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${collecting ? "animate-spin" : ""}`} />
                    {collecting ? "Coletando APIs..." : "Coletar Dados"}
                  </button>
                </div>
              </section>

              {/* Área de Edição Interativa e Preview */}
              {auditData && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                  className="grid lg:grid-cols-12 gap-8"
                >
                  {/* Coluna Esquerda: Governança de Padrões & Blocos */}
                  <aside className="lg:col-span-4 space-y-6">
                    <div className="squircle-card p-6 space-y-4">
                      <h2 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#ff5a1f]" />
                        Padrões de Relatório
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

                      <div className="space-y-2.5 pt-2">
                        {[
                          { key: "show_glpi_tickets", label: "Chamados & Incidências GLPI" },
                          { key: "show_provimento_cnj", label: "Cronograma Provimento CNJ" },
                          { key: "show_bitdefender", label: "Segurança Bitdefender GravityZone" },
                          { key: "show_backups", label: "Auditoria de Backups (B2 / Zabbix)" },
                          { key: "show_glpi_inventory", label: "Inventário de Hardware & Antivírus" },
                        ].map((toggle) => (
                          <label
                            key={toggle.key}
                            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:border-white/20 transition"
                          >
                            <span className="text-xs font-medium text-slate-200">
                              {toggle.label}
                            </span>
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

                      {/* Salvar configuração atual como novo Padrão */}
                      <div className="pt-3 border-t border-white/10 flex gap-2">
                        <input
                          type="text"
                          value={newTplName}
                          onChange={(e) => setNewTplName(e.target.value)}
                          placeholder="Nome do novo padrão..."
                          className="flex-1 bg-[#090e1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff5a1f]"
                        />
                        <button
                          type="button"
                          onClick={handleSaveTemplate}
                          className="p-2.5 rounded-xl bg-white/[0.07] hover:bg-[#ff5a1f] text-white transition cursor-pointer"
                          title="Salvar como padrão reutilizável"
                        >
                          <BookmarkPlus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={exporting}
                      onClick={handleExportPdf}
                      className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#ff5a1f] to-[#e0430b] hover:brightness-110 text-white font-extrabold text-sm flex items-center justify-center gap-3 bloom-orange transition cursor-pointer"
                    >
                      <FileDown className="w-5 h-5" />
                      {exporting ? "Gerando PDF Oficial..." : "Gerar e Baixar PDF Softlan TI"}
                    </button>
                  </aside>

                  {/* Coluna Direita: Editor Executivo & Telemetria Consolidada */}
                  <section className="lg:col-span-8 space-y-6">
                    <div className="squircle-card p-6">
                      <label className="block text-xs font-mono uppercase tracking-wider text-[#ff7b47] mb-2">
                        Parecer Executivo da Engenharia (Editável)
                      </label>
                      <textarea
                        rows={4}
                        value={auditData.executive_summary}
                        onChange={(e) =>
                          setAuditData({ ...auditData, executive_summary: e.target.value })
                        }
                        className="w-full bg-[#090e1a]/80 border border-white/10 rounded-xl p-4 text-sm text-slate-200 leading-relaxed focus:outline-none focus:border-[#ff5a1f]"
                      />
                    </div>

                    {/* KPIs Consolidados */}
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="squircle-card p-5">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                          <span>CHAMADOS GLPI</span>
                          <Ticket className="w-4 h-4 text-[#ff5a1f]" />
                        </div>
                        <div className="text-3xl font-black text-white">
                          {auditData.glpi_summary.total_resolved}
                          <span className="text-sm font-normal text-slate-400">
                            {" "}
                            / {auditData.glpi_summary.total_opened} concluídos
                          </span>
                        </div>
                      </div>

                      <div className="squircle-card p-5">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                          <span>GRAVITYZONE HEALTH</span>
                          <Shield className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="text-3xl font-black text-emerald-400">
                          {auditData.bitdefender_summary
                            ? `${auditData.bitdefender_summary.security_health_percent}%`
                            : "N/A"}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {auditData.bitdefender_summary
                            ? `${auditData.bitdefender_summary.managed_endpoints} endpoints gerenciados`
                            : "Empresa não vinculada"}
                        </div>
                      </div>

                      <div className="squircle-card p-5">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                          <span>SLA BACKUPS (30D)</span>
                          <HardDrive className="w-4 h-4 text-[#ff5a1f]" />
                        </div>
                        <div className="text-3xl font-black text-white">
                          {auditData.backup_summary &&
                          auditData.backup_summary.active_channels.length > 0
                            ? `${auditData.backup_summary.overall_sla_percent}%`
                            : "N/A"}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {auditData.backup_summary
                            ? `${auditData.backup_summary.active_channels.length} camadas auditadas`
                            : "Host Zabbix não vinculado"}
                        </div>
                      </div>
                    </div>

                    {/* Provimento CNJ */}
                    {auditData.show_provimento_cnj && auditData.provimento_cnj?.has_project && (
                      <div className="squircle-card p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-mono text-[#ff7b47] uppercase">
                              Adequação Normativa • Ticket #{auditData.provimento_cnj.ticket_id}
                            </span>
                            <h3 className="text-base font-bold text-white">
                              {auditData.provimento_cnj.project_title}
                            </h3>
                          </div>
                          <span className="text-2xl font-black text-[#ff5a1f]">
                            {auditData.provimento_cnj.progress_percent}%
                          </span>
                        </div>
                        <div className="space-y-2">
                          {auditData.provimento_cnj.tasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/10 text-xs"
                            >
                              <span className="text-slate-200">{task.title}</span>
                              <span
                                className={`inline-flex items-center gap-1 font-semibold ${
                                  task.completed ? "text-emerald-400" : "text-amber-400"
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

                    {/* Preview de Inventário Completo (CPU, RAM, GPU, SO, Antivírus) */}
                    {auditData.show_glpi_inventory &&
                      auditData.glpi_summary.inventory.machines.length > 0 && (
                        <div className="squircle-card p-6 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Cpu className="w-4 h-4 text-[#ff5a1f]" />
                              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                                Inventário de Hardware & Antivírus (
                                {auditData.glpi_summary.inventory.total_machines} máquinas)
                              </h3>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="border-b border-white/10 text-slate-400 font-mono text-[10px] uppercase">
                                <tr>
                                  <th className="py-2 pr-3">Estação</th>
                                  <th className="py-2 pr-3">Processador</th>
                                  <th className="py-2 pr-3">RAM</th>
                                  <th className="py-2 pr-3">Placa de Vídeo</th>
                                  <th className="py-2 pr-3">SO</th>
                                  <th className="py-2">Antivírus</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {auditData.glpi_summary.inventory.machines.map((m) => (
                                  <tr key={m.name} className="hover:bg-white/[0.02]">
                                    <td className="py-2.5 pr-3 font-bold text-white whitespace-nowrap">
                                      {m.name}
                                    </td>
                                    <td className="py-2.5 pr-3 text-slate-300">
                                      {m.cpu || "Não informado"}
                                    </td>
                                    <td className="py-2.5 pr-3 text-[#ff7b47] font-mono font-bold whitespace-nowrap">
                                      {m.ram || "-"}
                                    </td>
                                    <td className="py-2.5 pr-3 text-slate-300">
                                      {m.gpu || "Integrada"}
                                    </td>
                                    <td className="py-2.5 pr-3 text-slate-300">{m.os}</td>
                                    <td className="py-2.5 text-emerald-400 font-medium">
                                      {m.antivirus || "Não detectado"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    {/* Parecer de Continuidade Editável */}
                    {auditData.show_backups && auditData.backup_summary && (
                      <div className="squircle-card p-6 space-y-3">
                        <label className="block text-xs font-mono uppercase tracking-wider text-slate-400">
                          Parecer Técnico de Continuidade & Backups (Editável)
                        </label>
                        <textarea
                          rows={2}
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
                          className="w-full bg-[#090e1a]/80 border border-white/10 rounded-xl p-3.5 text-xs text-slate-200 focus:outline-none focus:border-[#ff5a1f]"
                        />
                      </div>
                    )}
                  </section>
                </motion.div>
              )}
            </motion.div>
          )}

          {tab === "ecosystems" && (
            <motion.div
              key="tab-ecosystems"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white">Ecossistemas Mapeados</h2>
                  <p className="text-xs text-slate-400">
                    Gerencie o vínculo entre entidades do GLPI, empresas do Bitdefender GravityZone e
                    hosts do Zabbix.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingClient(null);
                    setModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff5a1f] hover:bg-[#ff6d38] text-white text-xs font-bold bloom-orange transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Vincular Novo Ecossistema
                </button>
              </div>

              {clients.length === 0 ? (
                <div className="squircle-card p-12 text-center text-sm text-slate-400">
                  Nenhum ecossistema cadastrado ainda. Clique em &ldquo;Vincular Novo Ecossistema&rdquo;.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {clients.map((c) => (
                    <motion.div
                      key={c.id}
                      layout
                      className="squircle-card p-6 flex flex-col justify-between gap-5"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-bold text-white leading-snug">
                            {c.display_name}
                          </h3>
                          {c.is_cartorio && (
                            <span className="px-2.5 py-0.5 rounded-full bg-[#ff5a1f]/15 border border-[#ff5a1f]/35 text-[#ff7b47] text-[10px] font-bold uppercase shrink-0">
                              CNJ
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 text-xs font-mono text-slate-400">
                          <div className="flex items-center gap-2">
                            <Ticket className="w-3.5 h-3.5 text-[#ff5a1f]" />
                            <span>GLPI Entity ID: #{c.glpi_entity_id}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="truncate">
                              Bitdefender: {c.bitdefender_company_id || "Não vinculado"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                            <span>Zabbix Host: {c.zabbix_host_slug || "Não vinculado"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClientId(String(c.id));
                            setTab("audit");
                          }}
                          className="text-xs font-semibold text-[#ff7b47] hover:text-white transition cursor-pointer"
                        >
                          Auditar agora →
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingClient(c);
                              setModalOpen(true);
                            }}
                            className="p-2 rounded-xl bg-white/[0.05] hover:bg-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                            title="Editar ecossistema"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEcosystem(c)}
                            className="p-2 rounded-xl bg-white/[0.05] hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition cursor-pointer"
                            title="Excluir ecossistema"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === "history" && (
            <motion.section
              key="tab-history"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="squircle-card p-6"
            >
              <h2 className="text-lg font-bold text-white mb-4">
                Histórico Imutável de Relatórios Gerados
              </h2>
              {history.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">
                  Nenhum relatório emitido até o momento.
                </p>
              ) : (
                <div className="divide-y divide-white/10">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="py-4 flex flex-wrap items-center justify-between gap-4"
                    >
                      <div>
                        <div className="text-sm font-bold text-white">{item.client_name}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          Competência: {item.reference_month} • Modelo: {item.template_name} • SHA-256:{" "}
                          {item.sha256_hash.slice(0, 12)}...
                        </div>
                      </div>
                      <a
                        href={`/api/v1/audit/history/${item.id}/reprint`}
                        className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-[#ff5a1f] text-xs font-semibold text-white transition"
                      >
                        Baixar 2ª Via PDF
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

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
              ? "Ecossistema atualizado com sucesso!"
              : "Ecossistema vinculado com sucesso!"
          );
        }}
      />
    </div>
  );
}