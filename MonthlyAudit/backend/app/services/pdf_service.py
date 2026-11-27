import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


def _sanitize_cnj_title(raw_title: str, client_name: str = "") -> str:
    """Remove prefixos de equipes internas (Comercial, SoftlanTI, EBGNET, Cliente) apenas para o PDF."""
    text = str(raw_title or "").strip()
    if not text:
        return ""

    if " - " in text:
        prefix, rest = text.split(" - ", 1)
        prefix_lower = prefix.lower()
        if any(
            team in prefix_lower
            for team in (
                "comercial",
                "softlan",
                "ebgnet",
                client_name.lower()[:12] if client_name else "___",
            )
        ):
            text = rest.strip()

    patterns = [
        r"(?i)\bcomercial\b\s*[,/\-|]*\s*",
        r"(?i)\bsoftlan\s*ti\b\s*[,/\-|]*\s*",
        r"(?i)\bebgnet\b\s*[,/\-|]*\s*",
    ]
    if client_name and len(client_name.strip()) > 3:
        escaped_client = re.escape(client_name.strip())
        patterns.append(rf"(?i){escaped_client}\s*[,/\-|]*\s*")

    for pat in patterns:
        text = re.sub(pat, "", text).strip(" ,-|/")

    return text or raw_title


def generate_softlan_audit_pdf(audit_data: dict[str, Any], generated_by: str) -> tuple[bytes, str]:
    """Renderiza o relatório de auditoria técnica em PDF de alta fidelidade usando report_softlan.html."""
    sanitized = dict(audit_data)
    client_name = str(sanitized.get("client_name", ""))

    provimento = sanitized.get("provimento_cnj")
    if isinstance(provimento, dict) and provimento.get("has_project"):
        prov_copy = dict(provimento)
        prov_copy["project_title"] = _sanitize_cnj_title(
            str(prov_copy.get("project_title", "")), client_name
        )
        cleaned_tasks = []
        for tk in prov_copy.get("tasks") or []:
            if isinstance(tk, dict):
                tk_copy = dict(tk)
                tk_copy["title"] = _sanitize_cnj_title(str(tk_copy.get("title", "")), client_name)
                cleaned_tasks.append(tk_copy)
        prov_copy["tasks"] = cleaned_tasks
        sanitized["provimento_cnj"] = prov_copy

    env = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)), autoescape=True)
    template = env.get_template("report_softlan.html")

    generated_at = datetime.now().strftime("%d/%m/%Y às %H:%M")
    html_str = template.render(
        data=sanitized,
        generated_by=generated_by,
        generated_at=generated_at,
    )

    pdf_bytes = HTML(string=html_str, base_url=str(TEMPLATES_DIR)).write_pdf()
    sha256_hash = hashlib.sha256(pdf_bytes).hexdigest()
    return pdf_bytes, sha256_hash