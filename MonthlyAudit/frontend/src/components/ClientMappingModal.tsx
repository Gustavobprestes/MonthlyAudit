import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Link2, Save } from "lucide-react";
import { apiFetch } from "../lib/api";

interface ClientMappingModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function ClientMappingModal({ onClose, onSaved }: ClientMappingModalProps) {
  const [sources, setSources] = useState<{
    glpi_entities: { id: number; name: string; completename: string }[];
    bitdefender_companies: { id: string; name: string }[];
    zabbix_hosts: { hostid: string; slug: string; name: string }[];
  }>({ glpi_entities: [], bitdefender_companies: [], zabbix_hosts: [] });

  const [displayName, setDisplayName] = useState("");
  const [glpiEntityId, setGlpiEntityId] = useState<number>(0);
  const [bdCompanyId, setBdCompanyId] = useState("");
  const [zbxSlug, setZbxSlug] = useState("");
  const [isCartorio, setIsCartorio] = useState(true);
  const [cnjClass, setCnjClass] = useState("Classe 2");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<typeof sources>("/api/v1/discovery/sources").then(setSources).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!glpiEntityId || !displayName) return;
    setSaving(true);
    try {
      const entity = sources.glpi_entities.find((x) => x.id === glpiEntityId);
      const company = sources.bitdefender_companies.find((x) => x.id === bdCompanyId);
      await apiFetch("/api/v1/clients", {
        method: "POST",
        body: JSON.stringify({
          display_name: displayName,
          glpi_entity_id: glpiEntityId,
          glpi_entity_name: entity?.completename || displayName,
          bitdefender_company_id: bdCompanyId || null,
          bitdefender_company_name: company?.name || null,
          zabbix_host_slug: zbxSlug || null,
          is_cartorio: isCartorio,
          cnj_class: isCartorio ? cnjClass : null,
        }),
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="squircle-card max-w-xl w-full p-6 sm:p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <Link2 className="w-5 h-5 text-[#ff5a1f]" />
            <h3 className="text-lg font-bold text-white">Vincular Ecossistema do Cliente</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              1. Entidade no GLPI 10
            </label>
            <select
              required
              value={glpiEntityId}
              onChange={(e) => {
                const id = Number(e.target.value);
                setGlpiEntityId(id);
                const found = sources.glpi_entities.find((x) => x.id === id);
                if (found && !displayName) setDisplayName(found.name);
              }}
              className="w-full rounded-xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white"
            >
              <option value={0}>Selecione a entidade...</option>
              {sources.glpi_entities.map((ent) => (
                <option key={ent.id} value={ent.id}>
                  {ent.completename} (ID: {ent.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nome Oficial no Relatório PDF
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: 1º Tabelionato de Notas de Araucária"
              className="w-full rounded-xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                2. Empresa no Bitdefender GravityZone
              </label>
              <select
                value={bdCompanyId}
                onChange={(e) => setBdCompanyId(e.target.value)}
                className="w-full rounded-xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white"
              >
                <option value="">(Não contratado / Ocultar)</option>
                {sources.bitdefender_companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                3. Host Técnico no Zabbix (Backups B2)
              </label>
              <select
                value={zbxSlug}
                onChange={(e) => setZbxSlug(e.target.value)}
                className="w-full rounded-xl bg-slate-900/90 border border-white/15 px-3.5 py-2.5 text-sm text-white"
              >
                <option value="">(Sem monitoramento B2)</option>
                {sources.zabbix_hosts.map((h) => (
                  <option key={h.hostid} value={h.slug}>
                    {h.slug} ({h.name})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isCartorio}
                onChange={(e) => setIsCartorio(e.target.checked)}
                className="accent-[#ff5a1f] w-4 h-4"
              />
              Serventia Extrajudicial (Provimento CNJ)
            </label>

            {isCartorio && (
              <select
                value={cnjClass}
                onChange={(e) => setCnjClass(e.target.value)}
                className="rounded-lg bg-slate-900 border border-white/15 px-3 py-1.5 text-xs text-white"
              >
                <option value="Classe 1">Classe 1</option>
                <option value="Classe 2">Classe 2</option>
                <option value="Classe 3">Classe 3</option>
              </select>
            )}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff5a1f] hover:bg-[#ff6d38] text-white font-semibold text-sm bloom-orange cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? "Salvando..." : "Salvar Vínculo"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}