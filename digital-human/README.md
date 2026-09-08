# LiveTalking 真数字人部署清单

> 配套 chy07 学生端「数字人主页」。**当前不部署也能正常演示**——
> 未检测到渲染服务时前端自动显示光形占位 + 字幕，功能不受任何影响。
> 只有当你想把占位换成真实会说话的数字人时，才需要跑下面的流程。

---

## 0. 先搞清楚：部署它换来了什么

| | 现在（默认） | 部署 LiveTalking 后 |
|---|---|---|
| 数字人本体 | AI 立绘占位 | 真人在说话的视频流（WebRTC，默认 wav2lip_avatar_glass_man） |
| 唇形 | 无 | Wav2Lip 实时唇形同步 |
| 语音 | 无（仅字幕） | EdgeTTS 合成语音 |
| 字幕 | ✅ 有 | ✅ 有 |
| 功能联动 | ✅ 完整可用 | ✅ 完整可用（并开口念出来） |

**台词内容始终来自你的规则引擎**，LiveTalking 只负责"嘴和脸"，不做任何内容生成。
所以即便渲染服务挂了，安全结论依然可审计、不幻觉。

---

## 1. 两种部署路径（选一条）

### 路径 A：Windows 整合包（推荐，强烈建议）

手动装 torch + CUDA 是这套方案最容易翻车的地方，整合包直接绕开。

- 下载地址（迅雷网盘）：<https://pan.xunlei.com/s/VOV0NCX2BoBkeySOVXj2lKRbA1?pwd=kaak>
- 解压即用，解压路径建议 `C:\LiveTalking`（路径不要含中文，避免编码问题）

### 路径 B：源码部署

```bash
git clone https://github.com/lipku/LiveTalking.git C:\LiveTalking
cd C:\LiveTalking

py -3.10 -m venv .venv
.venv\Scripts\activate

# CUDA 12.1（你的 RTX 4060 驱动较新，cu121/cu124 都行，二选一）
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
```

> 国内网络若访问不了 HuggingFace，启动前先设镜像：
> `set HF_ENDPOINT=https://hf-mirror.com`（Linux/macOS 用 `export`）

---

## 2. 模型权重与形象素材

### 推荐：HuggingFace 镜像站（命令行可下）

Google Drive 和夸克网盘在国内命令行直接下载容易失败，建议改用 HuggingFace 镜像站 `hf-mirror.com`。

下载前设置环境变量：

```bash
set HF_ENDPOINT=https://hf-mirror.com
```

> 如果你已有 HuggingFace 仓库地址（例如第三方整理的镜像 repo），可用下面脚本批量下载：
>
> ```bash
> set HF_ENDPOINT=https://hf-mirror.com
> huggingface-cli download <用户名>/<仓库名> wav2lip.pth --local-dir C:\LiveTalking\models
> huggingface-cli download <用户名>/<仓库名> wav2lip_avatar_glass_man --local-dir C:\LiveTalking\data\avatars
> ```
>
> 请将 `<用户名>/<仓库名>` 替换为实际来源。启动脚本 `start-livetalking.bat` 已自动设置 `HF_ENDPOINT`。

### 备选：夸克网盘（官方原版，需手动浏览器下载）

- 网盘链接：<https://pan.quark.cn/s/83a750323ef0>
- 需要两个文件：`wav2lip256.pth`、`wav2lip256_avatar1.tar.gz`
- 如果你想要官方原版 avatar，手动在浏览器打开上面的链接下载。

### 推荐 avatar：wav2lip_avatar_glass_man

你截图里给的形象是 **wav2lip_avatar_glass_man**（眼镜男），格式与 LiveTalking 完全兼容，可以直接用。本清单默认就用它。

放置位置：

```
C:\LiveTalking\
├─ models\
│   └─ wav2lip.pth          ← 注意：wav2lip256.pth 拷进来后【必须重命名】为 wav2lip.pth
└─ data\
    └─ avatars\
        └─ wav2lip_avatar_glass_man\   ← 包含 84 帧 full_imgs + 84 帧 face_imgs + coords.pkl
```

`wav2lip_avatar_glass_man` 文件夹内部结构示例：

```
wav2lip_avatar_glass_man/
├─ full_imgs/
│   ├─ 0.jpg
│   ├─ 1.jpg
│   └─ ...（共 84 帧）
├─ face_imgs/
│   ├─ 0.jpg
│   ├─ 1.jpg
│   └─ ...（共 84 帧）
└─ coords.pkl
```

> ⚠️ **最容易踩的坑**：代码里写死了 `models/wav2lip.pth`，不改名会直接 `FileNotFoundError`。

> 夸克网盘链接来自官方文档（<https://doc.livetalking.ai/docs/quickstart>）。
> 若链接失效，以 GitHub 仓库首页 <https://github.com/lipku/LiveTalking> 的 README 为准。

---

## 3. 启动

直接用本目录下的 **`start-livetalking.bat`**（先按你的实际路径改脚本头部的配置区），
或手动执行：

```bash
cd C:\LiveTalking
.venv\Scripts\python.exe app.py --transport webrtc --model wav2lip ^
  --avatar_id wav2lip_avatar_glass_man --listenport 8010
```

> ⚠️ **注意**：`app.py` 只有 `--listenport`，**没有 `--listenhost` 参数**。
> 带 `--listenhost 0.0.0.0` 会直接报 `unrecognized arguments` 并退出。
> 默认已监听所有网卡，本机/局域网联调都不用加。

启动脚本自带**预检**：会先检查 `models/wav2lip.pth` 和 `data/avatars/<avatar_id>` 是否存在，
缺失会明确报错并告诉你缺哪个，而不是让你对着一长串 Python 堆栈猜。

---

## 4. 验证（先自证，再联调）

**第 1 步 —— 确认 LiveTalking 自己能跑：**

浏览器打开 <http://localhost:8010/index.html>
→ 页面加载后应出现数字人画面
→ 在页面文本框输入任意文字并提交（数字人应开口播报，唇形同步）

**这一关过不了，先别联调 chy07**——先解决 LiveTalking 自身问题。

**第 2 步 —— 确认 chy07 能自动接管：**

```bash
curl http://127.0.0.1:8001/api/v1/avatar/status -H "Authorization: Bearer <token>"
```

期望返回：

```json
{"available": true, "url": "http://127.0.0.1:8010", "mode": "livetalking"}
```

**第 3 步 —— 看效果：**

刷新 <http://localhost:5174>，学生端数字人主页的占位会自动切换成实时视频流。

> 整条链路：**规则引擎产出台词 → `/api/v1/avatar/talk` → LiveTalking `/human` → TTS → 唇形 → WebRTC → 前端**
> 全部代码已就位，**不需要改任何前端代码**。

---

## 5. 端口与网络

| 端口 | 协议 | 用途 |
|---|---|---|
| 8010 | TCP | HTTP 信令（`/offer`、`/human`） |
| 1–65536 | UDP | WebRTC 媒体流 |

- 本机演示无特殊要求；**跨机器访问必须放行 UDP**，否则画面出不来（只黑屏、无报错）。
- 若 8010 被占用，改 `--listenport`，同时给后端设环境变量 `LIVETALKING_URL=http://127.0.0.1:<新端口>`。

---

## 6. 硬件边界（答辩会被追问，提前备好口径）

你这台是 **RTX 4060 笔记本（8GB 显存）**：

- ✅ **Wav2Lip**：官方标 3060 即可 60FPS，你的卡够用。**本方案默认就用它。**
- ❌ **MuseTalk**：高精度嘴型，官方要求 3080Ti 及以上，**暂不适用**。
- 单路实时没问题；多路并发受 GPU 限制（演示用单路足够）。

**诚实说法**：这是"实时推理生成的说话头"，不是全身高清数字人，也不是预录视频。
链路是真的（规则引擎 → TTS → 唇形 → WebRTC），每一帧都是现算的。

---

## 7. 想换成自己的形象（可选）

需要一段人物视频做素材，要求：

- 人物**嘴部闭合**（不说话时嘴是闭的，这样唇形才由模型驱动）
- 正脸、光照均匀、背景尽量干净
- 几秒到十几秒即可

放到 `data\avatars\<你的名字>\`，启动时 `--avatar_id <你的名字>`。

---

## 8. 常见坑速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `FileNotFoundError: models/wav2lip.pth` | 权重没改名 | `wav2lip256.pth` → `wav2lip.pth` |
| 页面黑屏、无报错 | UDP 未放行 / ICE 失败 | 检查防火墙 UDP；本机换 `127.0.0.1` 试 |
| `/avatar/status` 一直 `available:false` | 服务没起或端口不对 | 先看 8010 能否打开；核对 `LIVETALKING_URL` |
| 数字人不出声 | TTS 缺依赖或网络 | 先确认官方 `webrtcapi.html` 能否出声 |
| 卡在下载模型 | HuggingFace 不通 | `set HF_ENDPOINT=https://hf-mirror.com`，或换夸克网盘手动下 |
| `avatar folder must contain...` 报错 | avatar 文件夹格式不对 | 确认文件夹内有 full_imgs/、face_imgs/、coords.pkl |
