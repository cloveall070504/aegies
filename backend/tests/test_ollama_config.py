"""B1/B2 测试：模型运行时切换（无需重启）+ Ollama 生成自愈冷却。"""
import pytest

from app.config import settings
from app.core import ollama_runtime
from app.services import rag_service


def test_admin_list_ollama_models(client, admin_headers):
    """管理员可获取模型档位列表，且恰好一个为活跃。"""
    r = client.get("/admin/ollama-models", headers=admin_headers)
    assert r.status_code == 200, r.text
    cands = r.json()["data"]["candidates"]
    assert len(cands) >= 1
    assert sum(1 for c in cands if c["active"]) == 1
    for c in cands:
        assert c["name"] and c["params"] and c["min_ram"] and c["min_vram"] and "present" in c


def test_student_cannot_list_or_switch_models(client, student_headers):
    """学生既看不到也切换不了模型（属系统级配置）。"""
    r1 = client.get("/admin/ollama-models", headers=student_headers)
    assert r1.status_code == 403
    r2 = client.post(
        "/admin/ollama-models/switch",
        headers=student_headers,
        json={"model": "qwen2.5:7b"},
    )
    assert r2.status_code == 403


def test_admin_switch_valid_model_updates_settings(client, admin_headers, monkeypatch):
    """管理员切换合法模型：settings 生效，system-info 同步反映，且持久化可重启恢复。

    本用例验证"Ollama 模型切换"，故钉死 AI_PROVIDER=ollama；并注入本地已安装模型清单，
    避免无本地 Ollama 守护进程时触发"模型未安装"回滚（CI/测试环境通常不跑 Ollama）。
    """
    monkeypatch.setattr(settings, "AI_PROVIDER", "ollama")
    # 注入本地已安装模型清单，避免无本地 Ollama 守护进程时触发"模型未安装"回滚。
    # 该函数在 system.py 命名空间内被调用，需补在 system 模块上。
    from app.api.v1 import system as _system_mod
    monkeypatch.setattr(
        _system_mod, "list_ollama_model_names", lambda: ["qwen2.5:7b", "qwen2.5:3b"]
    )
    before = settings.OLLAMA_MODEL
    try:
        r = client.post(
            "/admin/ollama-models/switch",
            headers=admin_headers,
            json={"model": "qwen2.5:7b"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["active"] == "qwen2.5:7b"
        assert settings.OLLAMA_MODEL == "qwen2.5:7b"
        # system-info 同步反映
        r2 = client.get("/admin/system-info", headers=admin_headers)
        assert r2.status_code == 200 and r2.json()["data"]["ollama_model"] == "qwen2.5:7b"
        # 持久化文件已写入（重启后由 config.py 读取覆盖默认）
        assert ollama_runtime.get_active_model() == "qwen2.5:7b"
    finally:
        ollama_runtime.set_active_model(before)
        rag_service.reset_ollama_availability()


def test_admin_switch_invalid_model_rejected(client, admin_headers):
    """非法模型名（缺 <family>:<tag> 或含空格）应返回 400。"""
    r = client.post(
        "/admin/ollama-models/switch",
        headers=admin_headers,
        json={"model": "显然不是模型名"},
    )
    assert r.status_code == 400


def test_ollama_generate_self_heal_cooldown(monkeypatch):
    """B2：Ollama 探测失败后进入冷却，冷却期内快速降级（不重复打）；冷却过后自动重试。

    验证「一次失败≠永久不可用」，从而 Ollama 中途恢复后无需重启后端即可重启用 AI。
    """
    monkeypatch.setattr(settings, "ENABLE_OLLAMA", True)
    monkeypatch.setattr(settings, "OLLAMA_RETRY_COOLDOWN", 10.0)
    # 钉死走 Ollama 分支：本机 .env 默认 AI_PROVIDER=cloud，若不固定，
    # try_ollama_generate 会走云端分支（且 _cloud_generate_impl 带重试循环），
    # 导致 httpx.post 调用次数与冷却断言不符。此测试专测 Ollama 自愈冷却。
    monkeypatch.setattr(settings, "AI_PROVIDER", "ollama")
    rag_service.reset_ollama_availability()

    calls = {"n": 0}

    def fake_post(*args, **kwargs):
        calls["n"] += 1
        raise RuntimeError("simulated Ollama down")

    monkeypatch.setattr(rag_service.httpx, "post", fake_post)

    # 用可控时钟替代 time.monotonic
    clock = {"t": 0.0}

    def fake_monotonic():
        return clock["t"]

    monkeypatch.setattr(rag_service.time, "monotonic", fake_monotonic)

    # 第 1 次：尝试 -> 失败 -> 进入冷却（end=10）
    clock["t"] = 0.0
    assert rag_service.try_ollama_generate("行为A") is None
    assert calls["n"] == 1

    # 第 2 次：仍在冷却内（t=5 < 10）-> 直接降级，不重复打 Ollama
    clock["t"] = 5.0
    assert rag_service.try_ollama_generate("行为B") is None
    assert calls["n"] == 1, "冷却期内不应再次发起 Ollama 请求"

    # 第 3 次：冷却已过（t=11 > 10）-> 自动重试（自愈）
    clock["t"] = 11.0
    assert rag_service.try_ollama_generate("行为C") is None
    assert calls["n"] == 2, "冷却过后应自动重试 Ollama"

    rag_service.reset_ollama_availability()
