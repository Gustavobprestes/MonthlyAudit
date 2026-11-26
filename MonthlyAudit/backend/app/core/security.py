from datetime import datetime, timedelta, timezone
from fastapi import Cookie, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
import jwt
from app.core.config import settings

ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 12


def verify_google_workspace_token(credential: str) -> dict:
    try:
        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
        if idinfo.get("iss") not in ["accounts.google.com", "https://accounts.google.com"]:
            raise ValueError("Emissor inválido.")

        email: str = idinfo.get("email", "")
        hosted_domain: str = idinfo.get("hd", "")
        email_verified: bool = idinfo.get("email_verified", False)

        if not email_verified:
            raise ValueError("E-mail Google não verificado.")

        if hosted_domain != settings.ALLOWED_GOOGLE_DOMAIN or not email.endswith(
            f"@{settings.ALLOWED_GOOGLE_DOMAIN}"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso restrito exclusivamente a colaboradores @{settings.ALLOWED_GOOGLE_DOMAIN}.",
            )

        return {
            "email": email,
            "name": idinfo.get("name", email.split("@")[0]),
            "picture": idinfo.get("picture", ""),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Falha na validação OAuth Google: {str(exc)}",
        ) from exc


def create_session_jwt(user_data: dict) -> str:
    payload = {
        "sub": user_data["email"],
        "name": user_data["name"],
        "picture": user_data.get("picture", ""),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(softlan_session: str | None = Cookie(default=None)) -> dict:
    if not softlan_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou não autenticada.",
        )
    try:
        return jwt.decode(softlan_session, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de sessão inválido.",
        ) from exc