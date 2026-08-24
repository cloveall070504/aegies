"""AI 引擎 provider 运行时切换（ollama <-> cloud），无需重启后端。

- 当前 provider 持久化到 data/ai_provider_runtime.json；启动时由 config.py 读取以覆盖 .env 默认值。
- set_active_provider 同时：写文件 + 改 settings.AI_PROVIDER + 清引擎状态缓存与生成冷却，
  使新 provider 立即生效（配合引擎自愈，不必重启进程）。
- 与 ollama_runtime.py 的「模型切换」正交：本模块只管「用哪类引擎」，模型档位仍由 ollama_runtime 负责。
"""
import json
from pathlib import Path

from app.config import BASE_DIR, settings

_RUNTIME_PATH = Path(BASE_DIR) / "data" / "ai_provider_runtime.json"
_VALID = ("ollama", "cloud")


def _read_runtime() -> dict:
    try:
        if _RUNTIME_PATH.exists():
            return json.loads(_RUNTIME_PATH.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _write_runtime(data: dict) -> None:
    try:
        _RUNTIME_PATH.parent.mkdir(parents=True, exist_ok=True)
        _RUNTIME_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _clear_engine_cache() -> None:
    """让引擎状态缓存与生成冷却失效，新 provider 立即被探测/使用（B2 自愈配合）。"""
    try:
        from app.services import rag_service
        rag_service.reset_ollama_availability()
        rag_service._status_store().delete("ollama_status")
    except Exception:
        pass


def get_active_provider() -> str:
    """返回当前生效的 provider：优先运行时持久化值，回退到 settings 默认值。"""
    return _read_runtime().get("provider") or settings.AI_PROVIDER


def set_active_provider(provider: str) -> str:
    """运行时切换 AI provider：写文件 + 改 settings + 清状态缓存/冷却，立即生效。

    返回最终生效的 provider；非法或前置条件不满足抛 ValueError（接口层转 400）。
    """
    if provider not in _VALID:
        raise ValueError("非法 provider：仅支持 'ollama' 或 'cloud'")

    if provider == "cloud":
        # 切云端：必须已配置密钥（密钥在 .env，需后端至少启动过一次以加载到内存）。
        if not settings.OPENAI_API_KEY:
            raise ValueError(
                "尚未配置 OPENAI_API_KEY，无法切换到云端模式。"
                "请在 backend/.env 填入密钥并重启一次后端以加载，然后再切换。"
            )
    else:  # ollama
        if not settings.ENABLE_OLLAMA:
            raise ValueError("ENABLE_OLLAMA 为 false，无法切换到本地 Ollama 模式。")
        # 直接探测本地 Ollama（不依赖当前 provider，避免从 cloud 切回时 list_ollama_model_names
        # 因 AI_PROVIDER==cloud 误返回云端模型名，导致「永远切不回本地」的 bug）。
        # Ollama 当前不可达（未启动）时放行切换：配置切到本地即可，B2 自愈会在 Ollama
        # 启动后自动恢复 AI；若 Ollama 在线但目标模型未安装则明确拦截，提示 ollama pull。
        try:
            import httpx
            _resp = httpx.get(
                f"{settings.OLLAMA_BASE_URL}/api/tags",
                timeout=httpx.Timeout(connect=3.0, read=5.0, write=5.0, pool=3.0),
            )
            _resp.raise_for_status()
            local = {m.get("name", "") for m in _resp.json().get("models", [])}
        except Exception:
            local = None  # Ollama 不可达：放行，不阻断切换
        if local is not None:
            fam = settings.OLLAMA_MODEL.split(":")[0]
            if settings.OLLAMA_MODEL not in local and not any(m.split(":")[0] == fam for m in local):
                raise ValueError(
                    f"本地 Ollama 未安装模型 {settings.OLLAMA_MODEL}，无法切换到本地模式。"
                    f"请先执行 `ollama pull {settings.OLLAMA_MODEL}`，然后再切换。"
                )

    settings.AI_PROVIDER = provider
    _write_runtime({"provider": provider})
    _clear_engine_cache()
    return provider
