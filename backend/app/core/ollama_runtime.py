"""Ollama 模型运行时配置（B1）：支持在运行中切换活跃模型，无需重启后端。

- 活跃模型持久化到 data/ollama_runtime.json；启动时由 config.py 读取以覆盖默认值（重启仍生效）。
- set_active_model 同时：写文件 + 改 settings.OLLAMA_MODEL + 清引擎状态缓存与生成冷却，
  使新模型立即被探测/使用（配合 B2 自愈，不必重启进程）。
- MODEL_TIERS 为纯知识性的「升级路径」说明（档位/最小内存/显存/能力备注），不依赖联网。
"""
import json
from pathlib import Path

from app.config import BASE_DIR, settings

# 模型能力档位：用于前端展示「升级路径」与硬件要求。键可为具体 <family>:<tag> 或仅 <family>。
MODEL_TIERS = {
    "qwen2.5:3b":   {"params": "3B",  "min_ram": "8GB",  "min_vram": "无（CPU 可用）",       "note": "最快最稳，适合无独显笔记本；评论员复核能力有限。"},
    "qwen2.5:7b":   {"params": "7B",  "min_ram": "16GB", "min_vram": "6GB（如 RTX 3060）",  "note": "质量明显提升，独显机推荐起步档。"},
    "qwen2.5:14b":  {"params": "14B", "min_ram": "32GB", "min_vram": "12GB（如 RTX 4070Ti）", "note": "复核/解释质量更高，需较好独显。"},
    "llama3.1:8b":  {"params": "8B",  "min_ram": "16GB", "min_vram": "8GB",                 "note": "英文场景更强，中文略逊于 qwen2.5。"},
    "llama3.1:70b": {"params": "70B", "min_ram": "128GB", "min_vram": "48GB+",              "note": "仅适合服务器级显卡，普通机勿选。"},
}

_RUNTIME_PATH = Path(BASE_DIR) / "data" / "ollama_runtime.json"


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


def get_active_model() -> str:
    return _read_runtime().get("model") or settings.OLLAMA_MODEL


def candidate_models() -> list:
    """候选切换列表：默认档位 + 当前活跃模型（若不在默认表中也补上，避免丢失）。"""
    cands = list(settings.OLLAMA_MODELS)
    active = get_active_model()
    if active not in cands:
        cands.append(active)
    return cands


def _is_valid_model_name(model: str) -> bool:
    return isinstance(model, str) and 0 < len(model) <= 64 and ":" in model and " " not in model


def set_active_model(model: str) -> str:
    """运行时切换活跃模型：写文件 + 改 settings + 清状态缓存/冷却，立即生效。

    返回最终生效的模型名。非法模型名抛 ValueError（由接口层转 400）。
    """
    if not _is_valid_model_name(model):
        raise ValueError("非法模型名：需形如 <family>:<tag>（如 qwen2.5:7b）")
    settings.OLLAMA_MODEL = model
    _write_runtime({"model": model})
    # 让引擎状态缓存与生成冷却失效，新模型立即被探测/使用（B2 自愈配合）。
    try:
        from app.services import rag_service
        rag_service.reset_ollama_availability()
        rag_service._status_store().delete("ollama_status")
    except Exception:
        pass
    return model


def list_models() -> list:
    """返回候选模型列表（含档位元数据 + 是否已本地安装）。"""
    from app.services import rag_service
    local = set(rag_service.list_ollama_model_names())
    active = get_active_model()
    out = []
    for m in candidate_models():
        family = m.split(":")[0]
        tier = MODEL_TIERS.get(m) or MODEL_TIERS.get(family) or {
            "params": "自定义", "min_ram": "未知", "min_vram": "未知",
            "note": "自定义模型，请自行评估硬件是否足够。",
        }
        present = (m in local) or any(mm.split(":")[0] == family for mm in local)
        out.append({"name": m, "active": m == active, "present": present, **tier})
    return out
