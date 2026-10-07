from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "development"
    database_url: str = "mysql+pymysql://kaunter:kaunter@127.0.0.1:3306/kaunter?charset=utf8mb4"
    # Origins allowed to make state-changing requests (CSRF check) and to call the API in dev.
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    cookie_secure: bool = False
    media_dir: Path = Path("media")
    media_url: str = "/media"
    run_scheduler: bool = False
    # True behind Caddy: the client address is the last X-Forwarded-For entry, which Caddy appends.
    # Earlier entries come from the client and can be forged, so they are never used.
    behind_proxy: bool = False
    # Day close runs at this local hour (shop timezone).
    day_close_hour: int = 4

    # Where customers reach the app; used for the gateway's return and callback URLs.
    public_base_url: str = "http://localhost:5173"
    # "fake" until a merchant account exists. The fake gateway refuses to run in production.
    payment_gateway: str = "fake"
    gateway_webhook_secret: str = "dev-only-webhook-secret"
    unpaid_expiry_minutes: int = 15

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
