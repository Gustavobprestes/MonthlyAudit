from datetime import datetime, timedelta, timezone
import jwt
from jwt.exceptions import PyJWTError
from fastapi import Cookie, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from app.core.config import settings

ALGORITHM = "HS256"
SESSION_EXPIRE_HOURS = 12


def is_authorized_email(email: str, hosted_domain: str = "") -> bool:
    """Permite contas Root explícitas ou contas corporativas @softlanti.com.br."""
    normalized = email.strip().lower()
    if normalized in settings.root_admin_set:
        return True
    domain = settings.ALLOWED_GOOGLE_DOMAIN.strip().lower()
    return hosted_domain.lower() == domain and normalized.endswith(f"@{domain}")


def verify_google_workspace_token(credential: str) -> dict:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GOOGLE_CLIENT_ID não configurado no servidor.",
        )

    try:
        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token Google inválido: {exc}",
        ) from exc

    if idinfo.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Emissor de identidade inválido.",
        )

    email: str = str(idinfo.get("email", "")).strip().lower()
    hosted_domain: str = str(idinfo.get("hd", "")).strip().lower()

    if not idinfo.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="E-mail Google não verificado.",
        )

    if not is_authorized_email(email, hosted_domain):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Acesso restrito exclusivamente a contas @{settings.ALLOWED_GOOGLE_DOMAIN}.",
        )

    return {
        "email": email,
        "name": idinfo.get("name") or email.split("@")[0],
        "picture": idinfo.get("picture", ""),
    }


def create_session_jwt(user_data: dict, role: str = "user") -> str:
    email = user_data["email"].strip().lower()
    effective_role = "admin" if email in settings.root_admin_set else role
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=SESSION_EXPIRE_HOURS)
    payload = {
        "sub": email,
        "name": user_data["name"],
        "picture": user_data.get("picture", ""),
        "role": effective_role,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(softlan_session: str | None = Cookie(default=None)) -> dict:
    if not softlan_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou não autenticada. Faça login novamente.",
        )
    try:
        payload = jwt.decode(
            softlan_session,
            settings.SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        email = str(payload.get("sub", "")).strip().lower()
        if not is_authorized_email(email, email.split("@")[-1] if "@" in email else ""):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Domínio não autorizado.",
            )
        payload["role"] = (
            "admin" if email in settings.root_admin_set else payload.get("role", "user")
        )
        return payload
    except PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        ) from exc


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: esta operação exige perfil de Administrador.",
        )
    return user