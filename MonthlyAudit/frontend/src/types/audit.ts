export type AppTheme =
  | "softlan"
  | "dracula"
  | "glass"
  | "dark"
  | "light"
  | "cloud"
  | "cyberpunk";

export interface UserProfile {
  sub: string;
  name: string;
  picture: string;
  role: "admin" | "user";
}

export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  picture: string;
  role: "admin" | "user";
  is_env_locked: boolean;
  last_login: string | null;
}

export interface ClientMapping {
  id: number;
  glpi_entity_id: number;
  display_name: string;
  bitdefender_company_id: string | null;
  zabbix_host_slug: string | null;
  is_cartorio: boolean;
}

export interface ReportTemplate {
  id: number;
  name: string;
  show_glpi_tickets: boolean;
  show_glpi_inventory: boolean;
  show_provimento_cnj: boolean;
  show_bitdefender: boolean;
  show_backups: boolean;
  default_executive_summary: string;
}

export interface PlantaoObitoItem {
  ticket_id: number;
  title: string;
  status: string;
  opened_at: string;
  closed_at: string;
  technician: string;
  validation_text: string;
}

export interface UnifiedAssetRow {
  endpoint_id: string;
  hostname: string;
  ip: string;
  os: string;
  cpu: string;
  ram: string;
  gpu: string;
  antivirus: string;
  blocked_count: number;
  remediation_status: string;
  is_protected: boolean;
  protection_label: string;
}

export interface AuditPayload {
  client_mapping_id: number;
  client_name: string;
  reference_month: string;
  template_name: string;
  show_glpi_tickets: boolean;
  show_glpi_inventory: boolean;
  show_provimento_cnj: boolean;
  show_plantao_obito: boolean;
  show_bitdefender: boolean;
  show_backups: boolean;
  executive_summary: string;
  glpi_summary: {
    total_opened: number;
    total_resolved: number;
    by_category: { category: string; count: number }[];
    recent_tickets: {
      id: number;
      title: string;
      status: string;
      category: string;
      date: string;
    }[];
    inventory: {
      total_machines: number;
      by_os: { os: string; count: number }[];
      machines: {
        name: string;
        serial: string;
        os: string;
        cpu: string;
        ram: string;
        gpu: string;
        antivirus: string;
      }[];
    };
  };
  provimento_cnj: {
    has_project: boolean;
    ticket_id: number | null;
    project_title: string;
    progress_percent: number;
    tasks: { id: number; title: string; completed: boolean; date: string }[];
  } | null;
  plantao_obito: PlantaoObitoItem[];
  bitdefender_summary: {
    total_endpoints: number;
    managed_endpoints: number;
    clean_endpoints: number;
    endpoints_with_issues: number;
    quarantine_items: number;
    total_blocked_events?: number;
    security_health_percent: number;
    total_seats?: number;
    used_seats?: number;
    expiration_date?: string;
    product_name?: string;
    endpoints?: {
      endpoint_id: string;
      name: string;
      ip: string;
      blocked_count: number;
      remediation_status: string;
      is_protected: boolean;
      status: string;
    }[];
    error?: string;
  } | null;
  backup_summary: {
    host_slug: string;
    overall_sla_percent?: number;
    active_channels: {
      key?: string;
      channel: string;
      status: string;
      is_healthy?: boolean;
      sla_30d_percent: number;
      ok_days?: number;
      total_days?: number;
      last_check: string;
      timeline?: { date: string; ok: boolean }[];
    }[];
    disk_usage: { volume: string; used_percent: number; status?: string }[];
    analyst_note: string;
    error?: string;
  } | null;
  unified_assets: UnifiedAssetRow[];
}

export interface HistoryRecord {
  id: number;
  client_mapping_id: number;
  client_name: string;
  reference_month: string;
  template_name: string;
  sha256_hash: string;
  generated_by: string;
  generated_at: string;
}