import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, Save, Loader2, Shield, HardDrive, Ticket } from "lucide-react";
import { apiFetch } from "../lib/api";
import { AnimatedSelect } from "./AnimatedSelect";
import type { ClientMapping } from "../types/audit";

interface DiscoverySources {
  glpi_entities: { id: number; name: string; completename: string }[];
  bitdefender_companies: { id: string; name: string }[];
  zabbix_hosts: { hostid: string; slug: string; name: string }[];
}

interface ClientMappingModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (client: ClientMapping) => void;
  editingClient?: ClientMapping | null;
}

export function ClientMappingModal({
  open,
  onClose,
  onSaved,
  editingClient = null,
}: ClientMappingModalProps) {
  const [sources, setSources] = useState<DiscoverySources | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);
  const [saving, setSaving] = useState(false);

  const [glpiEntityId, setGlpiEntityId] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [bdCompanyId, setBdCompanyId] = useState("");
  const [zabbixSlug, setZabbixSlug] = useState("");
  const [isCartorio, setIsCartorio] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (editingClient) {
      setGlpiEntityId(String(editingClient.glpi_entity_id));
      setDisplayName(editingClient.display_name);
      setBdCompanyId(editingClient.bitdefender_company_id || "");
      setZabbixSlug(editingClient.zabbix_host_slug || "");
      setIsCartorio(editingClient.is_cartorio);
    } else {
      setGlpiEntityId("");
      setDisplayName("");
      setBdCompanyId("");
      setZabbixSlug("");
      setIsCartorio(true);
    }

    setLoadingSources(true);
    apiFetch<DiscoverySources>("/api/v1/discovery/sources")
      .then(setSources)
      .catch(() =>
        setSources({ glpi_entities: [], bitdefender_companies: [], zabbix_hosts: [] })
      )
      .finally(() => setLoadingSources(false));
  }, [open, editingClient]);

  const handleSave = async () => {
    if (!glpiEntityId || !displayName.trim()) return;
    setSaving(true);
    try {
      const endpoint = editingClient
        ? `/api/v1/clients/${editingClient.id}`
        : "/api/v1/clients";
      const method = editingClient ? "PUT" : "POST";

      const saved = await apiFetch<ClientMapping>(endpoint, {
        method,
        body: JSON.stringify({
          glpi_entity_id: Number(glpiEntityId),
          display_name: displayName.trim(),
          bitdefender_company_id: bdCompanyId || null,
          zabbix_host_slug: zabbixSlug || null,
          is_cartorio: isCartorio,
        }),
      });
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 18 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="squircle-card max-w-xl w-full p-7 relative overflow-visible"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-xl bg-white/[0.04] hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 text-xs font-mono text-[#ff5a1f] uppercase tracking-wider mb-1">
              <Link2 className="w-4 h-4" />
              {editingClient ? "Editar Ecossistema do Cliente" : "Novo Vínculo de Ecossistema"}
            </div>
            <h3 className="text-xl font-bold text-white mb-6">
              {editingClient ? editingClient.display_name : "Integrar Fontes de Auditoria"}
            </h3>

            {loadingSources ? (
              <div className="py-12 flex flex-col items-center gap-3 text-slate-400 text-sm">
                <Loader2 className="w-7 h-7 animate-spin text-[#ff5a1f]" />
                Sincronizando entidades GLPI, empresas Bitdefender e hosts Zabbix...
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5">
                    <Ticket className="w-3.5 h-3.5 text-[#ff5a1f]" />
                    Entidade no GLPI *
                  </label>
                  <AnimatedSelect
                    value={glpiEntityId}
                    placeholder="Selecione a entidade GLPI..."
                    onChange={(val) => {
                      setGlpiEntityId(val);
                      const ent = sources?.glpi_entities.find((item) => String(item.id) === val);
                      if (ent && !editingClient) setDisplayName(ent.name);
                    }}
                    options={(sources?.glpi_entities || []).map((e) => ({
                      value: String(e.id),
                      label: e.name,
                      sublabel: `ID #${e.id} • ${e.completename}`,
                    }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nome Oficial no Relatório PDF *
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: 1º Tabelionato de Protesto de Curitiba"
                    className="w-full bg-[#090e1a]/90 border border-white/12 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#ff5a1f]"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      Empresa no Bitdefender
                    </label>
                    <AnimatedSelect
                      value={bdCompanyId}
                      placeholder="Selecione a empresa..."
                      onChange={setBdCompanyId}
                      options={[
                        { value: "", label: "Não contratado / Ignorar" },
                        ...(sources?.bitdefender_companies || []).map((c) => ({
                          value: c.id,
                          label: c.name,
                          sublabel: `GravityZone ID: ${c.id}`,
                        })),
                      ]}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                      Host Abreviado Zabbix (LogsBackups)
                    </label>
                    <AnimatedSelect
                      value={zabbixSlug}
                      placeholder="Selecione o host..."
                      onChange={setZabbixSlug}
                      options={[
                        { value: "", label: "Não contratado / Ignorar" },
                        ...(sources?.zabbix_hosts || []).map((z) => ({
                          value: z.slug,
                          label: z.slug,
                          sublabel: z.name !== z.slug ? z.name : `Host ID #${z.hostid}`,
                        })),
                      ]}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 pt-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isCartorio}
                    onChange={(e) => setIsCartorio(e.target.checked)}
                    className="w-4 h-4 accent-[#ff5a1f] rounded"
                  />
                  <span className="text-xs text-slate-300">
                    Serventia Extrajudicial (habilitar auditoria automática do{" "}
                    <strong className="text-white">Provimento CNJ</strong>)
                  </span>
                </label>

                <div className="pt-4 flex justify-end gap-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={saving || !glpiEntityId || !displayName.trim()}
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff5a1f] hover:bg-[#ff6d38] disabled:opacity-50 text-white text-xs font-bold bloom-orange transition cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? "Salvando..." : "Salvar Ecossistema"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}