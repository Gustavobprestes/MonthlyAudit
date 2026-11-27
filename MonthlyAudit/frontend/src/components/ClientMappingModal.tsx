import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, Shield, HardDrive, Ticket, Loader2, Save } from "lucide-react";
import { apiFetch } from "../lib/api";
import { AnimatedSelect } from "./AnimatedSelect";
import type { ClientMapping } from "../types/audit";

interface DiscoveryData {
  glpi_entities: { id: number; name: string; completename: string }[];
  bitdefender_companies: { id: string; name: string }[];
  zabbix_hosts: { hostid: string; slug: string; name: string; items_count?: number }[];
}

interface ClientMappingModalProps {
  open: boolean;
  editingClient: ClientMapping | null;
  onClose: () => void;
  onSaved: (client: ClientMapping) => void;
}

export function ClientMappingModal({
  open,
  editingClient,
  onClose,
  onSaved,
}: ClientMappingModalProps) {
  const [loadingSources, setLoadingSources] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [discovery, setDiscovery] = useState<DiscoveryData>({
    glpi_entities: [],
    bitdefender_companies: [],
    zabbix_hosts: [],
  });

  const [glpiEntityId, setGlpiEntityId] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [bitdefenderId, setBitdefenderId] = useState<string>("");
  const [zabbixSlug, setZabbixSlug] = useState<string>("");
  const [isCartorio, setIsCartorio] = useState<boolean>(true);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoadingSources(true);

    if (editingClient) {
      setGlpiEntityId(String(editingClient.glpi_entity_id));
      setDisplayName(editingClient.display_name);
      setBitdefenderId(editingClient.bitdefender_company_id || "");
      setZabbixSlug(editingClient.zabbix_host_slug || "");
      setIsCartorio(editingClient.is_cartorio);
    } else {
      setGlpiEntityId("");
      setDisplayName("");
      setBitdefenderId("");
      setZabbixSlug("");
      setIsCartorio(true);
    }

    apiFetch<DiscoveryData>("/api/v1/integrations/discover")
      .then((data) => setDiscovery(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingSources(false));
  }, [open, editingClient]);

  const handleSelectGlpi = (val: string) => {
    setGlpiEntityId(val);
    const found = discovery.glpi_entities.find((e) => String(e.id) === val);
    if (found && !displayName) {
      setDisplayName(found.name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!glpiEntityId || !displayName.trim()) {
      setError("Selecione a entidade no GLPI e informe o nome oficial do cliente.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        glpi_entity_id: Number(glpiEntityId),
        display_name: displayName.trim(),
        bitdefender_company_id: bitdefenderId || null,
        zabbix_host_slug: zabbixSlug || null,
        is_cartorio: isCartorio,
      };

      const saved = editingClient
        ? await apiFetch<ClientMapping>(`/api/v1/clients/${editingClient.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await apiFetch<ClientMapping>("/api/v1/clients", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar ecossistema.");
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
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="squircle-card max-w-xl w-full p-7 relative overflow-visible"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-full theme-nav-inactive transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-xs font-mono theme-accent-text uppercase tracking-wider mb-1">
              <Link2 className="w-4 h-4" />
              {editingClient ? "Editar Vínculo de Ecossistema" : "Novo Vínculo de Ecossistema"}
            </div>
            <h3 className="text-xl font-bold mb-5">
              {editingClient ? editingClient.display_name : "Integrar Fontes de Auditoria"}
            </h3>

            {loadingSources ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 theme-text-muted">
                <Loader2 className="w-7 h-7 theme-accent-text animate-spin" />
                <span className="text-xs font-mono">
                  Sincronizando GLPI, GravityZone e Zabbix...
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-semibold mb-1.5">
                    <Ticket className="w-3.5 h-3.5 theme-accent-text" />
                    Entidade no GLPI *
                  </label>
                  <AnimatedSelect
                    value={glpiEntityId}
                    onChange={handleSelectGlpi}
                    placeholder="Selecione a entidade GLPI..."
                    options={discovery.glpi_entities.map((ent) => ({
                      value: String(ent.id),
                      label: ent.name,
                      sublabel:
                        ent.completename !== ent.name
                          ? `${ent.completename} (ID #${ent.id})`
                          : `ID #${ent.id}`,
                    }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Nome Oficial no Relatório PDF *
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex: 1º Tabelionato de Protesto de Curitiba"
                    className="w-full theme-input rounded-xl px-4 py-2.5 text-sm"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold mb-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-500" />
                      Empresa no Bitdefender
                    </label>
                    <AnimatedSelect
                      value={bitdefenderId}
                      onChange={setBitdefenderId}
                      placeholder="Não contratado / Ignorar"
                      options={[
                        { value: "", label: "Não contratado / Ignorar" },
                        ...discovery.bitdefender_companies.map((c) => ({
                          value: c.id,
                          label: c.name,
                        })),
                      ]}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold mb-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-sky-500" />
                      Host Zabbix ({discovery.zabbix_hosts.length} encontrados)
                    </label>
                    <AnimatedSelect
                      value={zabbixSlug}
                      onChange={setZabbixSlug}
                      placeholder="Não contratado / Ignorar"
                      options={[
                        { value: "", label: "Não contratado / Ignorar" },
                        ...discovery.zabbix_hosts.map((z) => ({
                          value: z.slug,
                          label: z.slug,
                          sublabel: z.items_count
                            ? `${z.items_count} métricas de backup/disco`
                            : z.name !== z.slug
                              ? z.name
                              : undefined,
                        })),
                      ]}
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isCartorio}
                    onChange={(e) => setIsCartorio(e.target.checked)}
                    className="w-4 h-4 accent-[#ff5a1f]"
                  />
                  <span className="text-xs theme-text-muted">
                    Serventia Extrajudicial (habilitar auditoria automática do Provimento CNJ)
                  </span>
                </label>

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-400">
                    {error}
                  </div>
                )}

                <div className="pt-3 flex justify-end gap-3 border-t border-current/10">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-semibold theme-nav-inactive cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl theme-accent-bg disabled:opacity-50 text-xs font-bold transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? "Salvando..." : "Salvar Ecossistema"}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}