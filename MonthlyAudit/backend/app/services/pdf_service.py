from datetime import datetime, timezone
import hashlib
import json
import bleach
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

template_env = Environment(
    loader=FileSystemLoader("app/templates"),
    autoescape=select_autoescape(["html", "xml"]),
)


def sanitize_text(value: str) -> str:
    return bleach.clean(value or "", tags=[], strip=True)


def generate_softlan_audit_pdf(payload: dict, generated_by: str) -> tuple[bytes, str]:
    """
    Renderiza o relatório mensal determinístico Softlan TI e devolve (pdf_bytes, sha256_hash).
    """
    clean_payload = payload.copy()
    clean_payload["executive_summary"] = sanitize_text(clean_payload.get("executive_summary", ""))
    if clean_payload.get("backup_summary"):
        clean_payload["backup_summary"]["analyst_note"] = sanitize_text(
            clean_payload["backup_summary"].get("analyst_note", "")
        )

    canonical_json = json.dumps(clean_payload, sort_keys=True, ensure_ascii=False)
    doc_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    template = template_env.get_template("report_softlan.html")
    rendered_html = template.render(
        data=clean_payload,
        generated_by=generated_by,
        generated_at=datetime.now(timezone.utc).strftime("%d/%m/%Y às %H:%M UTC"),
        doc_hash=doc_hash[:24].upper(),
    )

    pdf_bytes = HTML(string=rendered_html, base_url="/app/app/static").write_pdf()
    return pdf_bytes, doc_hash