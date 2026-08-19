from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# 项目数据库连接（支持 SQLite / PostgreSQL 通过 DATABASE_URL 环境变量切换）
from app.database import Base, engine, IS_SQLITE
from app.config import settings

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# 用项目实际数据库 URL 覆盖 ini 里的占位符
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# 注意：此处刻意不调用 fileConfig(config.config_file_name)。
# fileConfig 会重置 root logger 并清掉应用已配置好的 handler（尤其是滚动文件日志），
# 导致迁移运行后业务日志不再落盘。改用「让 alembic 自身的 logger 向上传播到
# 应用 root handler」的方式（应用已在 start.py 中完成日志初始化）。
# 仅在脱离应用、直接用 alembic CLI 调试时才需要独立日志配置，这里牺牲该便利性以保住落盘。

# 注册所有模型，使 metadata 包含全部表
import app.models  # noqa: F401

target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
