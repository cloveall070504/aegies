"""TTS worker - 独立子进程，避免与 uvicorn 的 aiohttp 事件循环冲突。
用法：python _tts_worker.py <text> <voice> <rate> <pitch> <volume>
输出：stdout 写入 MP3 音频数据，出错时 stderr 输出错误信息。
"""
import sys
import asyncio
import traceback


async def main():
    if len(sys.argv) < 6:
        print("Usage: _tts_worker.py text voice rate pitch volume", file=sys.stderr)
        sys.exit(1)

    text = sys.argv[1]
    voice = sys.argv[2]
    rate = sys.argv[3]
    pitch = sys.argv[4]
    volume = sys.argv[5]

    import edge_tts
    comm = edge_tts.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
        volume=volume,
    )

    # 将音频数据直接写入 stdout（二进制模式）
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            sys.stdout.buffer.write(chunk["data"])

    sys.stdout.buffer.flush()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception:
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
