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
    # "none" is counter-only: no online ordering at all, as in the first week of the pilot.
    payment_gateway: str = "fake"
    gateway_webhook_secret: str = "dev-only-webhook-secret"
    unpaid_expiry_minutes: int = 15

    # Written by the backup container after every run. Unset in development: no backup warnings.
    backup_status_file: Path | None = None
    # The nightly backup is late when the last good one is older than this.
    backup_max_age_hours: int = 30

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def online_payments_enabled(self) -> bool:
        return self.payment_gateway != "none"

    def production_problems(self) -> list[str]:
        """Settings that would be unsafe on a real shop. The app refuses to start while any remain."""
        problems = []
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true")
        if not self.public_base_url.startswith("https://"):
            problems.append("PUBLIC_BASE_URL must start with https://")
        if not self.allowed_origins or any(not o.startswith("https://") for o in self.allowed_origins):
            problems.append("ALLOWED_ORIGINS must list only https:// origins")
        if self.payment_gateway == "fake":
            problems.append("PAYMENT_GATEWAY=fake cannot run in production; use none until a merchant account exists")
        if self.online_payments_enabled and (self.gateway_webhook_secret == "dev-only-webhook-secret"
                                             or len(self.gateway_webhook_secret) < 32):
            problems.append("GATEWAY_WEBHOOK_SECRET must be a random secret of 32 characters or more")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
