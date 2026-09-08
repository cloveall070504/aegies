"""全局配置：Ollama 地址、数据库连接、JWT 密钥等。"""
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    APP_NAME: str = "ChemGuard"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    # 运行环境：development（默认）/ production。生产环境必须用环境变量显式声明，
    # 并配合真实 SECRET_KEY，否则启动时直接报错（见文件末尾安全检查）。
    ENVIRONMENT: str = "development"

    # 服务绑定（由 start.py 读取；容器部署覆盖为 0.0.0.0 / 8000）
    HOST: str = "127.0.0.1"
    PORT: int = 8001

    # 数据库：默认 SQLite（开发方便），生产用 PostgreSQL 通过环境变量覆盖：
    #   DATABASE_URL=postgresql://user:pass@host:5432/dbname
    DATABASE_URL: str = f"sqlite:///{BASE_DIR / 'ai_avoid_error.db'}"

    # JWT（生产环境必须通过环境变量 SECRET_KEY 设置）
    SECRET_KEY: str = "chy07-dev-only-key-DO-NOT-USE-IN-PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # Ollama 本地大模型
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    # 活跃模型（B1）：管理员可在运行时切换，无需改代码/重启。
    # 启动时若 data/ollama_runtime.json 记录了上次的选型，则覆盖此默认值（见文件末尾）。
    OLLAMA_MODEL: str = "qwen2.5:3b"
    # 可选模型档位（B1）：供前端「升级路径」展示与一键切换；想加更多档位改这里或环境变量 OLLAMA_MODELS（逗号分隔）。
    OLLAMA_MODELS: list = ["qwen2.5:3b", "qwen2.5:7b", "qwen2.5:14b", "llama3.1:8b", "llama3.1:70b"]
    # Ollama 生成自愈冷却（B2，秒）：探测不可用时进入冷却期，期间快速降级为规则引擎；
    # 冷却一过自动重试，从而 Ollama 中途恢复后无需重启后端即自动重启用 AI。
    OLLAMA_RETRY_COOLDOWN: float = 10.0

    # 云端大模型（OpenAI 兼容）：当 AI_PROVIDER=cloud 时，走云端 API 而非本地 Ollama。
    # 支持任意 OpenAI 兼容端点（DeepSeek / 硅基流动 SiliconFlow / 通义 DashScope / OpenAI 等）。
    # 密钥通过环境变量 OPENAI_API_KEY 注入（写入 backend/.env，已被 gitignore，不进仓库）。
    AI_PROVIDER: str = "ollama"                      # ollama | cloud
    OPENAI_API_KEY: str = ""
    OPENAI_API_BASE: str = "https://api.deepseek.com/v1"   # 默认 DeepSeek（OpenAI 兼容）
    OPENAI_MODEL: str = "deepseek-chat"

    # Chroma 向量库
    CHROMA_PERSIST_DIR: str = str(BASE_DIR / "data" / "chroma")
    EMBEDDING_MODEL: str = "BAAI/bge-small-zh-v1.5"

    # 上传文档存储目录
    UPLOAD_DIR: str = str(BASE_DIR / "data" / "uploads")

    # 报告输出目录
    REPORT_DIR: str = str(BASE_DIR / "data" / "reports")

    # 双智能体开关（Ollama 不可用时降级为规则引擎）
    ENABLE_OLLAMA: bool = True

    # LLM 旁白（仿真叙事）开关：默认开启，由规则引擎判定 verdict 后让本地模型润色文案。
    # 若关闭，则沙盘/扫描旁白一律使用确定性规则文案（零幻觉，完全离线可读）。
    # 即使开启，actor 输出也会经 _ground_actor_reply 约束：编造条款/离题时回退规则文案。
    ENABLE_LLM_NARRATIVE: bool = True

    # 日志
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = str(BASE_DIR / "logs")
    LOG_MAX_BYTES: int = 10 * 1024 * 1024
    LOG_BACKUPS: int = 5

    # 备份目录
    BACKUP_DIR: str = str(BASE_DIR / "data" / "backups")

    # 速率限制开关（测试/排查时可关闭）
    RATE_LIMIT_ENABLED: bool = True

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# 启动时读取运行时 provider 选择（管理员在界面切换并持久化到 data/ai_provider_runtime.json），
# 覆盖 .env 中的 AI_PROVIDER 默认值，使「ollama <-> cloud」切换在重启后仍生效。
# 必须放在下方 B1 模型块之前，模型覆盖逻辑才能基于正确的 provider 决定改 OLLAMA_MODEL 还是 OPENAI_MODEL。
try:
    import json as _json
    _prov_path = BASE_DIR / "data" / "ai_provider_runtime.json"
    if _prov_path.exists():
        _prov = _json.loads(_prov_path.read_text(encoding="utf-8")).get("provider")
        if _prov in ("ollama", "cloud"):
            settings.AI_PROVIDER = _prov
except Exception:
    pass

# B1：启动时读取运行时模型选择（管理员在界面切换并持久化到 data/ollama_runtime.json），
# 覆盖 OLLAMA_MODEL 默认值，使切换在重启后仍生效。读不到/损坏则回退默认，不影响启动。
try:
    _rt_model_path = BASE_DIR / "data" / "ollama_runtime.json"
    if _rt_model_path.exists():
        import json as _json
        _rt_model = _json.loads(_rt_model_path.read_text(encoding="utf-8")).get("model")
        if isinstance(_rt_model, str) and _rt_model:
            if settings.AI_PROVIDER == "cloud":
                # 仅当运行时模型名是「云端格式」（不含 ':'，如 deepseek-chat）才覆盖 OPENAI_MODEL，
                # 避免 ollama 残留的 <family>:<tag>（如 qwen2.5:3b）污染云端模型名导致调用失败。
                if ":" not in _rt_model:
                    settings.OPENAI_MODEL = _rt_model
            else:
                settings.OLLAMA_MODEL = _rt_model
except Exception:
    pass

# 生产环境安全检查：
#  - development 环境：仅警告（不阻断本地开发，默认密钥即可）
#  - production 环境：若仍用开发默认密钥，直接启动失败，杜绝"默认值兜底生产"的隐患
if settings.SECRET_KEY.startswith("chy07-dev-only"):
    if settings.ENVIRONMENT == "production":
        raise RuntimeError(
            "SECRET_KEY 仍为开发默认值，生产环境必须通过环境变量 SECRET_KEY 设置随机密钥！"
        )
    import warnings
    warnings.warn(
        "SECRET_KEY 仍为开发默认值，生产环境请通过环境变量 SECRET_KEY 设置随机密钥！",
        RuntimeWarning,
        stacklevel=2,
    )

# 确保必要目录存在
for _d in (settings.CHROMA_PERSIST_DIR, settings.UPLOAD_DIR, settings.REPORT_DIR):
    Path(_d).mkdir(parents=True, exist_ok=True)
