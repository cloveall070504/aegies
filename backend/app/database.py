"""SQLAlchemy 数据库引擎与会话。"""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """启动时自动建表。"""
    # noqa: F401 - 确保模型全部注册到 Base.metadata
    import app.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
