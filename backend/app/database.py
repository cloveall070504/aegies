"""SQLAlchemy 数据库引擎与会话。
- 支持 SQLite（开发，默认）与 PostgreSQL（生产，通过 DATABASE_URL 环境变量切换）。
- 表结构迁移由 Alembic 统一管理：应用启动时自动执行 `alembic upgrade head`（幂等），
  取代原先「启动时自动 ALTER 迁移」的临时方案。生产/开发都无需手动迁移。
"""
import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings

BACKEND_ROOT = Path(__file__).resolve().parent.parent

IS_SQLITE = settings.DATABASE_URL.startswith("sqlite")
# 测试用内存库（sqlite:///:memory:）：单连接共享，避免 SQLite 文件锁与
# 「每个连接独立内存库」导致 Alembic 与业务会话看不到同一张表的问题。
IS_MEMORY = settings.DATABASE_URL == "sqlite:///:memory:"
connect_args = {"check_same_thread": False} if IS_SQLITE else {}

if IS_MEMORY:
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
else:
    # PostgreSQL（生产）：显式连接池，避免默认 5 连接在高并发下耗尽；
    # SQLite 用默认池即可（单文件、靠 WAL + busy_timeout 缓解写竞争）。
    _pool_kwargs = {}
    if not IS_SQLITE:
        _pool_kwargs = {"pool_size": 10, "max_overflow": 20}
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args=connect_args,
        echo=False,
        pool_pre_ping=True,
        **_pool_kwargs,
    )

# SQLite WAL：仅对文件型库启用（内存库无文件、不需 WAL；测试隔离库可经 APP_TEST=1 关闭）。
# busy_timeout 让并发写者等待而非立即报 "database is locked"，配合 WAL 显著缓解写竞争。
_ENABLE_WAL = IS_SQLITE and not IS_MEMORY and os.getenv("APP_TEST") != "1"
if _ENABLE_WAL:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _stamp_legacy_sqlite() -> None:
    """兼容早期用 create_all 建表但未 stamp 的 SQLite 库，避免 upgrade 时建表冲突。"""
    if not IS_SQLITE:
        return
    with engine.connect() as conn:
        has_users = conn.exec_driver_sql(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'"
        ).first() is not None
        has_av = conn.exec_driver_sql(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alembic_version'"
        ).first() is not None
    if has_users and not has_av:
        from alembic.config import Config
        from alembic import command

        command.stamp(Config(str(BACKEND_ROOT / "alembic.ini")), "head")


def run_migrations() -> None:
    """启动时把数据库 schema 对齐到 Alembic 最新版本（幂等、可重复执行）。

    取代原先「启动时自动 ALTER 迁移」的临时方案：无论是开发态 SQLite 还是
    生产态 PostgreSQL，应用启动都会自动执行 `alembic upgrade head`，
    无需手动迁移，也不会因 schema 未建而崩溃。
    """
    from alembic.config import Config
    from alembic import command

    _stamp_legacy_sqlite()
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    try:
        command.upgrade(cfg, "head")
    except Exception:
        logging.getLogger("alembic").exception(
            "Alembic 迁移失败，请检查数据库连接与权限"
        )
        raise


def init_db() -> None:
    """应用启动时初始化数据库：执行 Alembic 迁移到 head（开发/生产统一）。"""
    run_migrations()


