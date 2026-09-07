"""可编辑安全规则运行时存储（反向 RAG 升级 · C 方案：规则外置）。

把 agent_service 中「教师最可能增删」的短语清单类规则外置为可编辑配置：
- hard_danger    : 明确危险动作短语（优先级高于安全语境降级）
- safe_verbs     : 安全/正确执行动词（兜底降级用）
- prohibit_words : 禁止/告诫陈述词
- reactive_pat   : 活泼金属/遇水反应/水入酸（PPE 不得降级）

设计要点：
- 内置默认来自 `app.services.agent_service` 的对应常量（单一事实源：agent_service 持有
  默认，本模块在首次读取时从 agent_service 取作种子），教师通过接口增删的自定义项存于
  JSON 文件（默认 backend/data/safety_rules.json），与内置默认「并集」生效。
- 不破坏「诚实不变量」：危险短语只在并集里增加/减少，引擎判定逻辑不变；
  RISK_KEYWORDS 三级分级词库作为内置核心暂未外置（见改动说明）。
- 线程安全：用 _lock 保护内存态与文件写。
"""
import json
import os
import threading
from copy import deepcopy

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RULES_PATH = os.environ.get(
    "SAFETY_RULES_PATH", os.path.join(BASE_DIR, "data", "safety_rules.json")
)

SCOPES = ("hard_danger", "safe_verbs", "prohibit_words", "reactive_pat")

_lock = threading.Lock()
_STORE = None  # {scope: [custom_terms]}


def _builtin(scope: str):
    """内置默认（延迟导入避免与 agent_service 循环依赖；agent_service 持有默认种子）。"""
    from app.services import agent_service

    mapping = {
        "hard_danger": agent_service._HARD_DANGER,
        "safe_verbs": agent_service._SAFE_VERBS,
        "prohibit_words": agent_service._PROHIBIT_WORDS,
        "reactive_pat": agent_service._REACTIVE_PAT,
    }
    return list(mapping[scope])


def reload(path=None):
    """从 JSON 加载自定义规则层（文件不存在则自定义层为空）。"""
    global _STORE
    p = path or RULES_PATH
    custom = {s: [] for s in SCOPES}
    if os.path.exists(p):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            for s in SCOPES:
                if isinstance(data.get(s), list):
                    custom[s] = [str(x) for x in data[s]]
        except (ValueError, OSError):
            pass
    with _lock:
        _STORE = custom
    return _STORE


def _save(store, path=None):
    p = path or RULES_PATH
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


def _ensure():
    global _STORE
    if _STORE is None:
        reload()
    return _STORE


def _full(scope: str):
    store = _ensure()
    return list(set(_builtin(scope)) | set(store[scope]))


def get_hard_danger():
    return _full("hard_danger")


def get_safe_verbs():
    return _full("safe_verbs")


def get_prohibit_words():
    return _full("prohibit_words")


def get_reactive_pat():
    return _full("reactive_pat")


def list_rules():
    store = _ensure()
    return {
        s: {
            "builtin": _builtin(s),
            "custom": list(store[s]),
            "effective": _full(s),
        }
        for s in SCOPES
    }


def add_term(scope: str, term: str, path=None):
    if scope not in SCOPES:
        raise ValueError(f"unknown scope: {scope}")
    term = (term or "").strip()
    if not term:
        raise ValueError("term must not be empty")
    store = _ensure()
    with _lock:
        if term not in store[scope]:
            store[scope].append(term)
        _save(store, path)
    return list(store[scope])


def remove_term(scope: str, term: str, path=None):
    if scope not in SCOPES:
        raise ValueError(f"unknown scope: {scope}")
    term = (term or "").strip()
    store = _ensure()
    with _lock:
        if term in store[scope]:
            store[scope].remove(term)
        _save(store, path)
    return list(store[scope])


def reset_rules(path=None):
    global _STORE
    with _lock:
        _STORE = {s: [] for s in SCOPES}
        _save(_STORE, path)
    return deepcopy(_STORE)
