"""SQLite 在线热备工具。

使用 Python sqlite3 的 backup API（对启用了 WAL 的库也安全），
把当前库完整拷贝到 data/backups/ai_avoid_error_YYYYMMDD_HHMMSS.db，
并按需保留最近 N 份（默认 7）。

用法：
  python scripts/backup_db.py                # 默认备份并保留 7 份
  python scripts/backup_db.py --keep 10      # 保留最近 10 份
  python scripts/backup_db.py --dest D:/bak  # 指定备份目录

恢复：停服后，用最新一份备份覆盖 ai_avoid_error.db（连同其 -wal/-shm 一并删掉）。
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from app.config import settings  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="AI实操避错系统 · SQLite 热备")
    ap.add_argument("--keep", type=int, default=7, help="保留最近 N 份备份")
    ap.add_argument("--dest", type=str, default=None, help="备份输出目录")
    args = ap.parse_args()

    # 解析 DATABASE_URL -> 实际文件路径
    url = settings.DATABASE_URL
    if url.startswith("sqlite:///"):
        rel = url[len("sqlite:///"):]
    elif url.startswith("sqlite://"):
        rel = url[len("sqlite://"):]
    else:
        print(f"[backup] 仅支持 SQLite 备份，当前 DATABASE_URL={url}", file=sys.stderr)
        return 2
    src = Path(rel)
    if not src.is_absolute():
        src = (BACKEND / src).resolve()
    if not src.exists():
        print(f"[backup] 源库不存在: {src}", file=sys.stderr)
        return 1

    dest_dir = Path(args.dest) if args.dest else (BACKEND / "data" / "backups")
    dest_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = dest_dir / f"ai_avoid_error_{stamp}.db"

    con = sqlite3.connect(str(src))
    bck = sqlite3.connect(str(dest))
    try:
        con.backup(bck)
    finally:
        bck.close()
        con.close()

    size = dest.stat().st_size
    print(f"[backup] OK {src} -> {dest} ({size} bytes)")

    olds = sorted(
        dest_dir.glob("ai_avoid_error_*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in olds[args.keep:]:
        old.unlink()
        print(f"[backup] 清理旧备份 {old.name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
