# 实战避错系统

基于「反向 RAG + 双智能体校验」的沉浸式风险实训平台。当前聚焦 **化学实验（chem_lab）** 单一场景，支持 PC 管理端与移动端多端访问；可选接入本地 Ollama 模型启用 AI 解说/复核，未启动时自动降级为内置规则引擎（前端全局标识当前引擎模式）。

## 项目结构

```
chy07/
├── backend/                 # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py          # 应用入口（CORS、路由注册、lifespan 启动建表+种子）
│   │   ├── config.py        # Ollama 地址、SQLite 路径等配置
│   │   ├── database.py      # SQLAlchemy 引擎与会话 + Alembic 自动迁移
│   │   ├── models/          # 核心表模型
│   │   ├── schemas/         # Pydantic 请求/响应模型
│   │   ├── api/v1/          # auth/dashboard/scenario/profile/scan/cases/docs/
│   │   │                     quiz/report/org/scene_system/assignment/
│   │   │                     simulation/system/meta
│   │   ├── services/        # rag/agent/prompt/scoring/profile/doc_parser/report
│   │   ├── core/            # security(JWT/密码)、deps(鉴权/终端识别/角色)
│   │   └── utils/           # response 统一响应
│   ├── alembic/             # 数据库迁移版本
│   ├── tests/               # pytest（隔离内存库）
│   └── requirements.txt
└── frontend/                # React + Vite 前端（端口固定 5174）
    └── src/
        ├── api/             # axios 封装（自动附带 JWT 与 X-Client-Type）
        ├── components/      # ScoreGauge/RiskCard/RiskTag/DualCheckBadge/
        │                     EngineModeBadge/PageHead/RiskTrendChart
        ├── pages/PC/         # 登录/驾驶舱/推演/画像/扫描/案例/文档/自测/作业/报告
        ├── pages/Mobile/     # 登录/首页/扫描/推演/画像/自测
        ├── layouts/          # PCLayout 侧边栏 / MobileLayout 底部 Tab
        ├── store/            # zustand：authStore、themeStore
        ├── hooks/            # useAuth、useTheme、useScan 等
        ├── router/           # PC 与 Mobile 路由，断点 768px/1024px
        └── utils/
```

## 环境要求

- Python 3.10+
- Node.js 18+

## 后端启动

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 推荐：统一启动入口（读取 HOST/PORT/LOG_* 环境变量，启用日志与限流）
python start.py
# 等价于：uvicorn app.main:app --host 127.0.0.1 --port 8001
```

- 健康检查：http://localhost:8001/api/v1/health （返回 DB / Ollama 组件状态）
- 接口文档：http://localhost:8001/docs
- 启动流程：执行 Alembic 迁移到 head（幂等）→ 写入种子数据（Prompt 模板、内置风险点、chem_lab 场景与步骤、默认账号）。

默认账号（首次启动自动写入，幂等）：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | admin | admin123 |
| 教师 | teacher | 123456 |
| 学生 | student | 123456 |

> 生产部署前务必修改 `SECRET_KEY` 与默认口令（见「配置」）。

## 前端启动

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5174 。开发端口已在 `vite.config.js` 固定为 **5174**，`/api` 自动代理到 `http://127.0.0.1:8001`。
PC 端（宽屏）进入 `/pc/*`，移动端（窄屏）自动进入 `/mobile/*`，登录页 `/login` 可切换设备模拟。

## 核心接口

统一前缀 `/api/v1`，统一响应 `{code, message, data, timestamp}`，鉴权头 `Authorization: Bearer <token>`，可选终端头 `X-Client-Type: pc|mobile`（移动端自动裁剪字段）。

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| /api/v1/auth/login | POST | 登录，返回 JWT |
| /api/v1/dashboard/summary | GET | 驾驶舱指标（红黄绿状态、高频错误） |
| /api/v1/scenario/infer | POST | 场景推演：风险分 + 双AI自检 + 条款溯源 |
| /api/v1/scene/scan-text | POST | 风险扫描（分析粘贴的实验步骤） |
| /api/v1/profile/personal | GET | 个人避错画像 |
| /api/v1/docs/upload | POST | 上传规范文档并抽取风险点 |
| /api/v1/quiz/questions | GET | 获取自测题目 |
| /api/v1/quiz/submit | POST | 提交自测并判分 |
| /api/v1/report/generate | POST | 生成个人/组织报告 |
| /api/v1/report/{id}/download | GET | 下载 PDF 报告 |
| /api/v1/org/dashboard | GET | 组织风险画像 |
| /api/v1/assignments | GET/POST/DELETE | 作业管理（教师/管理员） |
| /api/v1/meta/engine-status | GET | 引擎模式（规则 / AI），所有登录用户可见 |

## 配置

后端配置位于 `backend/app/config.py`，全部支持环境变量覆盖（`.env` 或系统环境变量）。
完整清单见 `backend/.env.example`。核心项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8001` | 服务绑定地址与端口（`start.py` 读取；容器部署传 `0.0.0.0` / `8000`） |
| `DATABASE_URL` | SQLite `ai_avoid_error.db` | 生产改 PostgreSQL 连接串 |
| `SECRET_KEY` | 开发占位值 | JWT 签名密钥，**生产必须替换为强随机值** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080`（7天） | 令牌有效期 |
| `ENABLE_OLLAMA` / `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `true` / `http://localhost:11434` / `qwen2.5:3b` | AI 增强模式与本地模型 |
| `LOG_LEVEL` / `LOG_DIR` / `LOG_MAX_BYTES` / `LOG_BACKUPS` | `INFO` / `logs` / 10MB / 5 | 日志级别、目录、滚动策略 |
| `BACKUP_DIR` | `data/backups` | 数据库备份输出目录 |
| `CORS_ORIGINS` | 留空=放行一组 localhost 开发源 | 生产逗号分隔显式配置 |

## 运维 (Ops)

> 面向部署、监控与故障恢复。架构层优点见下文「架构说明」。

### 端口矩阵（两种运行模式，互不冲突）
| 模式 | 前端 | 后端 | 说明 |
| --- | --- | --- | --- |
| 本地开发（推荐） | `5174` | `8001` | `start.py` 默认；前端 `npm run dev` 反代 `/api`→`8001` |
| 容器编排 | `8080`(nginx) | `8000` | `docker compose up`；nginx 反代 `/api`→`backend:8000` |

二者通过 `HOST`/`PORT` 与环境变量隔离，切换无需改代码。

### 日志
- 统一入口 `python start.py` 会初始化日志：控制台 + 滚动文件 `logs/app.log`（默认 INFO，10MB 滚动保留 5 份）。
- 每个请求带 `X-Request-ID`，日志可见 `method path -> status (耗时ms)`，便于串联排障。
- 调整：环境变量 `LOG_LEVEL` / `LOG_DIR` / `LOG_MAX_BYTES` / `LOG_BACKUPS`。

### 健康检查（监控 / 容器探针）
- `GET /api/v1/health` 返回各依赖组件状态：
  - `data.status`：`ok` / `degraded`
  - `data.components.database`：`ok` 或错误明细
  - `data.components.ollama`：`ok` / `unreachable`（未启 Ollama 时为正常降级，不影响整体 `ok`）
- 容器部署建议把该端点挂到健康检查探针。

### 速率限制（防爆破 / 防滥用）
内置内存滑动窗口限流（按 `客户端IP + 路径`），默认：
- 登录 `/api/v1/auth/login`：10 次/分钟
- 风险扫描 `/api/v1/scene/*`、避错沙盘 `/api/v1/simulate/*`：30 次/分钟
- 引擎状态 `/api/v1/meta/engine*`：60 次/分钟
- 其它接口全局上限 240 次/分钟；健康检查与文档豁免。
- 超限返回 `429` + `Retry-After: 60`。生产可把存储后端换成 Redis 做多实例共享。

### 缓存与多实例就绪
- 引擎模式/健康检查对 Ollama 的探测结果走统一 `CacheStore` 抽象层（`app/core/cache.py`）：
  - 默认 `MemoryCacheStore`（线程安全、零依赖，单实例行为与旧 dict 缓存一致）；
  - 设置环境变量 `REDIS_URL` 后自动切换 `RedisCacheStore`（`redis` 库懒加载，未安装/连不上会静默回退内存），
    多实例部署时限流、引擎缓存即可跨实例共享。
- AI 生成调用并发护栏：环境变量 `OLLAMA_MAX_CONCURRENCY`（默认 4）限制同时打 Ollama 的请求数，
  避免高并发把请求线程池打满；超限/超时自动降级规则引擎。

### 数据库并发加固
- SQLite 已开启 `WAL` + `PRAGMA busy_timeout=5000` + `synchronous=NORMAL` + `foreign_keys=ON`，
  并发写会等待而非立即报 `database is locked`。
- 生产用 PostgreSQL 时，`DATABASE_URL` 切换后自动采用显式连接池（`pool_size=10` / `max_overflow=20`）+ `pool_pre_ping`。

### 数据库备份与恢复
SQLite 在线热备（兼容 WAL，不阻塞业务）：
```bash
cd backend
python scripts/backup_db.py            # 备份到 data/backups/，默认保留 7 份
python scripts/backup_db.py --keep 10  # 保留最近 10 份
```
恢复：停服后，用最新一份 `.db` 覆盖 `ai_avoid_error.db`，并删除同名 `-wal`/`-shm` 文件。
> 生产建议改用 PostgreSQL + 定时 `pg_dump`，并配合对象存储归档。

### 进程守护 / 自启
- **本地（Windows）**：已配置登录自启计划任务 `Chy07Backend`(8001)、`Chy07Frontend`(5174)、`OllamaAutoStart`(11434)。
  - 计划任务`AtLogOn`本身**不提供崩溃自愈**，已补充看门狗脚本 `backend/scripts/backend_watchdog.ps1`：
    每 15s 探测 8001，进程掉了自动拉起 `start.py`。可作为另一个 `AtLogOn` 隐藏计划任务常驻。
- **生产**：`docker compose` 已配 `restart: unless-stopped` **且 backend 增加存活探针（healthcheck）**：
  后端无响应时 Docker 会自动重启容器（崩溃自愈），frontend 仅在 backend 健康后才启动。

### 安全提醒
- 默认账号 `admin/admin123`、`teacher/123456`、`student/123456` 仅用于演示，**生产必须改密**。
- `SECRET_KEY` 必须随机化；否则 JWT 可被伪造。
- 登录已加限流，但仍建议生产前置 WAF / 反向代理层限流。

## 架构说明（5 年经验视角）

**优点**：分层清晰（api/services/models/core）、Alembic 启动幂等迁移、配置可环境变量覆盖、
RBAC + 规则引擎降级保证可用性、存储用 `String` 存 JSON 避免方言锁定（SQLite↔PostgreSQL 可移植）。

**已知短板与已缓解项**：
- ✅ **AI 解说/复核同步阻塞（已解决）**：`/scenario/infer`、`/simulate/step`、`/<case>/practice` 三个端点已改为
  `async`，Ollama 调用经 `asyncio.to_thread` + 并发信号量（`OLLAMA_MAX_CONCURRENCY`）+ 超时兜底执行，
  不再阻塞事件循环 / 占满请求线程池，失败或超时自动降级规则引擎。
- ✅ **SQLite 写并发（已缓解）**：已开 `WAL` + `busy_timeout=5000`；PostgreSQL 走显式连接池。
- ✅ **缓存/限流进程内（已就绪）**：统一 `CacheStore` 抽象，配 `REDIS_URL` 即切 Redis 跨实例共享；
  限流窗口仍为单实例内存（多实例需共享可后续接 Redis 计数器，已在 README「缓存」节说明）。
- ⏳ **规模化**：当前 SQLite 单机文件不适合高并发写，规模化应迁移 PostgreSQL（连接串切换即可，已验证可移植）；
  推演解释如需更低延迟可进一步改为后台任务 + SSE 推流（当前线程池方案已足够单机演示）。

## 测试

```bash
# 后端（隔离内存 SQLite，自动建表 + 种子，不依赖外部服务；含覆盖率）
cd backend && pytest tests/ -q --cov=app --cov-report=term-missing

# 前端（Vitest，DOM-free 单元测试）
cd frontend && npm test
```

后端测试覆盖 API、规则引擎、缓存抽象等；前端测试覆盖工具函数与状态管理（store）。
