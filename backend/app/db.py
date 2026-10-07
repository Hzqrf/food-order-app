from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

# READ COMMITTED: after a duplicate-key error (e.g. a repeated Idempotency-Key) the request can see
# the row the other request committed. Locking reads (SELECT ... FOR UPDATE) behave the same either way.
engine = create_engine(get_settings().database_url, pool_pre_ping=True, pool_recycle=3600,
                       isolation_level="READ COMMITTED")
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """One transaction per request: committed when the endpoint returns, rolled back on error.

    Routers declare this with scope="function" so the commit happens before the response is sent.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
