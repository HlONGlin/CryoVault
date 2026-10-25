from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="CRYOVAULT_",
        extra="ignore",
    )

    app_name: str = "CryoVault"
    data_dir: Path = Path("data")

    # Public base URL used when building share links (frontend address).
    base_url: str = "http://localhost:5173"

    # When empty the admin API is open (no token required).
    admin_token: str = ""

    # 0 means unlimited upload size (bytes).
    max_upload_size: int = 0

    # Text files above this size are not opened in the browser editor.
    max_text_edit_size: int = 5 * 1024 * 1024

    # Session cookie issued after a successful admin unlock.
    session_cookie: str = "cryovault_admin"
    session_max_age: int = 60 * 60 * 24 * 30
    # Set to true when CryoVault is served over HTTPS.
    cookie_secure: bool = False

    # Random secret path prefix for the admin console, e.g. "/panel/9f3c...".
    # When set, "/" no longer serves the app. Public share links stay at
    # "/s/<token>" and "/f/<token>".
    panel_path: str = ""

    # Expose /docs and /openapi.json. Disabled by the installer by default.
    docs_enabled: bool = True

    # Admin unlock brute-force protection.
    login_max_attempts: int = 5
    login_window_seconds: int = 300
    # Trust X-Forwarded-For. Enable only when running behind a reverse proxy.
    trust_proxy_headers: bool = False

    # Extra allowed CORS origins. Empty means same-origin only.
    cors_origins: list[str] = []

    # --- Updates -------------------------------------------------------
    # Allow admins to install updates from the web console. The installer
    # enables this only for systemd deployments and restricts the helper to
    # the lines below.
    update_enabled: bool = False
    update_repo: str = "HlONGlin/CryoVault"
    update_branch: str = "main"
    update_check_timeout: float = 6.0
    update_command: str = ""
    install_dir: str = ""
    # Optional token to lift the anonymous GitHub API rate limit.
    github_token: str = ""

    @property
    def normalized_panel_path(self) -> str:
        """Panel path with a leading slash, sanitized and without trailing slash."""
        raw = self.panel_path.strip()
        if not raw:
            return ""
        # Keep only URL-safe characters so the value is safe to inject into HTML.
        cleaned = "".join(
            ch for ch in raw if ch.isalnum() or ch in "/-_."
        )
        segments = [part for part in cleaned.split("/") if part not in ("", ".", "..")]
        if not segments:
            return ""
        return "/" + "/".join(segments)

    @property
    def storage_dir(self) -> Path:
        return self.data_dir / "storage"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'cryovault.db').as_posix()}"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.storage_dir.mkdir(parents=True, exist_ok=True)
