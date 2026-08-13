---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 1e3de7b5412a7bb56e3070e76056b469_b609ec0696d511f1b799525400826444
    ReservedCode1: lpy4byA7ebFUHSDPJD0egUj/EBD4B8C39us1rT6mSMJ+T08dzBgEl1xsTzfOBB0Ok7ZKZJLbASNQsRWtAx3PZc7itEbly52ALh05/rt15ZtcNZJ7e2Qsc6S1S/5pA28bXsgLCI87MFM7Sdgq9l1qI5EUES94ousbY69LbcqPdIJPcMzjb8dJjLQxluI=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 1e3de7b5412a7bb56e3070e76056b469_b609ec0696d511f1b799525400826444
    ReservedCode2: lpy4byA7ebFUHSDPJD0egUj/EBD4B8C39us1rT6mSMJ+T08dzBgEl1xsTzfOBB0Ok7ZKZJLbASNQsRWtAx3PZc7itEbly52ALh05/rt15ZtcNZJ7e2Qsc6S1S/5pA28bXsgLCI87MFM7Sdgq9l1qI5EUES94ousbY69LbcqPdIJPcMzjb8dJjLQxluI=
---

# AI实操避错系统

基于「反向 RAG + 双智能体校验」的沉浸式风险实训平台脚手架，覆盖学生实验（蓝白实训风）与工人车间（深色工业风）双场景，支持 PC 管理端与移动端多端访问。

## 项目结构

```
chy07/
├── backend/                 # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py          # 应用入口（CORS、路由注册、启动建表+种子数据）
│   │   ├── config.py        # Ollama 地址、SQLite 路径等配置
│   │   ├── database.py      # SQLAlchemy 引擎与会话
│   │   ├── models/          # 10 个核心表模型
│   │   ├── schemas/         # Pydantic 请求/响应模型
│   │   ├── api/v1/          # auth/dashboard/scenario/profile/scan/cases/docs/quiz/report/org
│   │   ├── services/        # rag/agent/prompt/scoring/profile/doc_parser/report
│   │   ├── core/            # security(JWT/密码)、deps(鉴权/终端识别/角色)
│   │   └── utils/           # response 统一响应
│   └── requirements.txt
├── frontend/                # React + Vite 前端
│   └── src/
│       ├── api/             # axios 封装（自动附带 JWT 与 X-Client-Type）
│       ├── components/      # RiskCard/RiskTag/ScoreGauge/DualCheckBadge/ThemeToggle
│       ├── pages/PC/        # 登录/驾驶舱/推演/画像/扫描/案例/文档/自测/管理后台
│       ├── pages/Mobile/    # 登录/首页/扫描/推演/画像/自测
│       ├── layouts/         # PCLayout 侧边栏 / MobileLayout 底部 Tab
│       ├── store/           # zustand：authStore、themeStore
│       ├── hooks/           # useAuth、useTheme
│       ├── router/          # PC 与 Mobile 路由，断点 768px/1024px
│       └── utils/
└── README.md
```

## 环境要求

- Python 3.10+
- Node.js 18+
- （可选）Ollama 本地模型，用于启用双智能体真实推理；未启动时自动降级内置规则引擎

## 后端启动

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- 健康检查：http://localhost:8000/api/v1/health
- 接口文档：http://localhost:8000/docs
- 启动时自动建表并写入种子数据：内置 Prompt 模板、内置风险点（4 个场景）、默认账号。

默认账号：

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | admin | admin123 |
| 学生 | student | 123456 |
| 工人 | worker | 123456 |

## 前端启动

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173 ，PC 端（宽屏）进入 `/pc/*`，移动端（窄屏）自动进入 `/mobile/*`，登录页 `/login` 可切换设备模拟。

## 核心接口

统一前缀 `/api/v1`，统一响应 `{code, message, data, timestamp}`，鉴权头 `Authorization: Bearer <token>`，可选终端头 `X-Client-Type: pc|mobile`（移动端自动裁剪字段）。

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| /auth/login | POST | 登录，返回 JWT |
| /dashboard/summary | GET | 驾驶舱指标（红黄绿状态、高频错误） |
| /scenario/infer | POST | 场景推演：风险分 + 双AI自检 + 条款溯源 |
| /scene/{id}/scan | GET | 场景一键风险扫描 |
| /profile/personal | GET | 个人避错画像 |
| /docs/upload | POST | 上传规范文档并抽取风险点 |
| /quiz/questions | GET | 获取自测题目 |
| /quiz/submit | POST | 提交自测并判分 |
| /report/generate | POST | 生成个人/组织报告 |
| /report/{id}/download | GET | 下载 PDF 报告 |
| /org/dashboard | GET | 组织风险画像 |

## 环境配置

后端配置位于 `backend/app/config.py`：`OLLAMA_BASE_URL`、`OLLAMA_MODEL`、`DATABASE_URL`（默认 SQLite `ai_safety.db`）、`SECRET_KEY`。
*（内容由AI生成，仅供参考）*
