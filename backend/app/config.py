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

    @property
    def storage_dir(self) -> Path:
        return self.data_dir / "storage"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'cryovault.db').as_posix()}"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.storage_dir.mkdir(parents=True, exist_ok=True)
