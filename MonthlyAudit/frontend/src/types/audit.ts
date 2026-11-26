export interface UserProfile {
  sub: string;
  name: string;
  picture?: string;
}

export interface ClientMapping {
  id: number;
  display_name: string;
  cnpj?: string;
  cns?: string;
  is_cartorio: boolean;
  cnj_class?: string;
  glpi_entity_id: number;
  glpi_entity_name: string;
  bitdefender_company_id?: string;
  bitdefender_company_name?: string;
  zabbix_host_slug?: string;
}

export interface ReportTemplate {
  id: number;
  name: string;
  description: string;
  show_glpi_tickets: boolean;
  show_glpi_inventory: boolean;
  show_provimento_cnj: boolean;
  show_bitdefender: boolean;
  show_backups: boolean;
  default_executive_note: string;
}

export interface AuditPayload {
  client_mapping_id: number;
  client_name: string;
  reference_month: string;
  template_name: string;
  show_glpi_tickets: boolean;
  show_glpi_inventory: boolean;
  show_provimento_cnj: boolean;
  show_bitdefender: boolean;
  show_backups: boolean;
  executive_summary: string;
  glpi_summary: {
    total_opened: number;
    total_resolved: number;
    total_in_progress: number;
    top_incidences: { category: string; count: number }[];
    recent_tickets: { id: number; title: string; status: string; category: string; opened_at: string }[];
    inventory: {
      has_agent_data: boolean;
      total_machines: number;
      machines: { name: string; os: string; last_sync: string }[];
      note: string;
    };
  };
  provimento_cnj?: {
    has_project: boolean;
    ticket_id: number;
    project_title: string;
    progress_percent: number;
    completed_tasks: number;
    total_tasks: number;
    tasks: { id: number; title: string; completed: boolean; date: string }[];
  } | null;
  bitdefender_summary?: {
    total_endpoints: number;
    managed_endpoints: number;
    clean_endpoints: number;
    endpoints_with_issues: number;
    quarantine_items: number;
    security_health_percent: number;
  } | null;
  backup_summary?: {
    host_slug: string;
    overall_sla_percent: number;
    active_channels: {
      channel: string;
      status: string;
      is_healthy: boolean;
      sla_30d_percent: number;
      last_check: string;
    }[];
    disk_usage: { volume: string; used_percent: number }[];
    analyst_note: string;
  } | null;
}

export interface AuditHistoryRecord {
  id: number;
  client_mapping_id: number;
  client_name: string;
  reference_month: string;
  template_name: string;
  sha256_hash: string;
  generated_by: string;
  generated_at: string;
}