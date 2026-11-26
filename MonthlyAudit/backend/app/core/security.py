from datetime import datetime, timedelta, timezone
import jwt
from jwt.exceptions import PyJWTError
from fastapi import Cookie, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from app.core.config import settings

ALGORITHM = "HS256"
SESSION_EXPIRE_HOURS = 12


def verify_google_workspace_token(credential: str) -> dict:
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

    email: str = idinfo.get("email", "")
    hosted_domain: str = idinfo.get("hd", "")

    if not idinfo.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="E-mail Google não verificado.",
        )

    if hosted_domain != settings.ALLOWED_GOOGLE_DOMAIN or not email.endswith(
        f"@{settings.ALLOWED_GOOGLE_DOMAIN}"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Acesso restrito exclusivamente a contas @{settings.ALLOWED_GOOGLE_DOMAIN}.",
        )

    return {
        "email": email.lower(),
        "name": idinfo.get("name", email.split("@")[0]),
        "picture": idinfo.get("picture", ""),
    }


def create_session_jwt(user_data: dict, role: str = "user") -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=SESSION_EXPIRE_HOURS)
    payload = {
        "sub": user_data["email"].lower(),
        "name": user_data["name"],
        "picture": user_data.get("picture", ""),
        "role": role,
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
        payload = jwt.decode(softlan_session, settings.SECRET_KEY, algorithms=[ALGORITHM])
        email = str(payload.get("sub", "")).lower()
        effective_role = (
            "admin" if email in settings.admin_email_set else payload.get("role", "user")
        )
        payload["role"] = effective_role
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