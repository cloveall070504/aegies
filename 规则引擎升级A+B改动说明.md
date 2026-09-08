# 规则引擎升级 A+B 改动说明

> 提交：`1a4f4ff`
> 范围：语义兜底（近似描述可命中具体后果）+ 多风险并发与量化评分 + 诚实性修正
> 改动文件（4 个，均为增量向后兼容）：
> - `backend/app/services/risk_outcomes.py`（新增模糊匹配器）
> - `backend/app/services/agent_service.py`（接入兜底 + 诚实性门控 + 安全动词）
> - `backend/app/services/scan_service.py`（多风险收集 + 量化评分）
> - `frontend/src/pages/PC/Scan.jsx`（"共 N 处风险"徽标）

---

## 一、为什么改（背景）

原规则引擎 `risk_outcomes.py` 用**精确字符串相等**匹配 `_RISK_OUTCOMES`（约 100 条 `描述 → {后果, 整改}`）。
只有字字相符的写法才能拿到具体后果，**任何近似/口语化描述都静默降级为通用套话**。

举例：规则库里写的是「稀释浓硫酸时将水倒入浓硫酸中」，但学生可能写：
- 「把水倒进浓硫酸里会有什么危险」→ 旧逻辑：漏配，只给通用模板
- 「用嘴去吸移液管里的试剂」→ 旧逻辑：漏配
- 「氢气点燃前没验纯」→ 旧逻辑：漏配

同时还有**诚实性矛盾**：正确操作「稀释浓硫酸时把酸缓缓沿杯壁注入水中」被标为 `low`，却因为 canonical 兜底无视等级，直接显示了「酸液飞溅造成严重灼伤」的危险后果——低风险步骤配高危文案，自相矛盾。

---

## 二、A 语义兜底（近似描述也能命中）

### 1. `risk_outcomes.py` 新增 `match_risk_outcome(step, threshold=0.3)`

**匹配策略选型**：
- 弃用 jieba 分词 + 词级 Jaccard——短化学句上 jieba 极不稳（「倒进」被丢、「嘴/吸」被丢、「没验」≠「前未验」）。
- 改用**字符 bigram（2-gram）Dice 系数**：分割无关、对长短不对称鲁棒。
  - Dice = `2 * |A∩B| / (|A| + |B|)`，阈值 0.3，且要求公共 bigram ≥ 2。
- **同义归一** `_SYN_REPLACES`：`倒进→倒入`、`对着→朝向`、`防护镜→护目镜`、`溅到→溅`、`忘/漏→未`、`关/熄灭→关闭`、`硫酸→浓硫酸` 等。
- **停用字** `_STOPCHARS`（去/候/西 等）：保护「嘴吸」等关键 bigram（避免「去」插在「嘴」「吸」之间把 bigram 拆断）。

**匹配流程**：
1. 精确相等 / 规范化相等（去标点空白 + 同义归一）→ 直接返回；
2. 否则算字符 bigram Dice 系数，取最高分；公共 bigram ≥ 2 且 ≥ 0.3 → 返回最佳命中，否则 `None`。

`match_risk_outcome` 对以下近似描述均命中具体后果（验证通过）：
`把水倒进浓硫酸里会有什么危险`、`用嘴去吸移液管里的试剂`、`氢气点燃前没验纯`、`走的时候没关酒精灯`、`加热试管时试管口对着人`、`稀释浓硫酸把水加进酸里`、`闻气体时直接把鼻子凑到瓶口`、`实验结束后废液直接倒进下水道`。

### 2. `agent_service.py` 接入兜底（`_consequence_text` / `_correction_text`）

- 顶部 import 增加 `match_risk_outcome`。
- `_keyword_hits` 顶部增加 `behavior = behavior.replace("倒进", "倒入")`，让「把水倒进浓硫酸」与方向性危险检测（水入强酸）对齐，避免被误判为低风险。

---

## 三、诚实性修正（守"唯一事实源"边界）

**问题**：原 `_consequence_text` / `_correction_text` 的 canonical 兜底循环**无视 `level`** 直接返回危险后果。

**修复**：把 canonical 精确匹配循环 与 fuzzy 模糊匹配**统一收进** `if level in ("high", "medium"):` 门控。
- `high`/`medium`（确有危险）→ 才返回具体（危险）后果/整改步骤；
- `low`/`none`（正确/低风险）→ 只返回通用/低风险文案，**绝不配发严重事故后果**。

**附带修复**：`_SAFE_VERBS` 增加 `预热`，消除 RAG 把「先预热」（正确）误配到「未预热」（否定条款）的误判；「未预热/未先预热」仍在 `_HARD_DANGER` 中不受影响。

> 效果（端到端实测）：
> - 「稀释浓硫酸时把酸缓缓沿杯壁注入水中」→ `low` + 通用文案 ✅
> - 「加热前先预热再集中加热」→ `low` + 通用文案 ✅
> - 「把水倒进浓硫酸里会有什么危险」→ `high` + 具体「酸液飞溅严重灼伤」✅

---

## 四、B 多风险并发 + 量化评分

### `scan_service.py` 的 `analyze_text`

- 新增 `_risk_block(desc, source, lvl, out)`：把一条命中整理为统一结构
  `{source, description, level, consequence, correction, severity_score}`；基础分 高9/中6/低3，命中具体再 +1（封顶 10）。
- 多风险收集（每个步骤不只取第一个）：
  - `canonical`：RAG 命中的条款 → `get_risk_outcome` → 具体后果；
  - `fuzzy`：一步最多补充 1 条 `match_risk_outcome` 命中（按后果去重）；
  - `keyword`：仅命中关键词、无具体后果的条目。
- 计算 `severity_score = 等级基础分 + (有 canonical/fuzzy 具体命中 ? 1 : 0)`，封顶 10。
- `findings[]` 新增两个**增量字段**（不破坏旧字段）：
  - `all_risks`：本步所有命中风险点列表；
  - `severity_score`：量化严重度（int）。

### `frontend/src/pages/PC/Scan.jsx`

风险卡片头部增加徽标（仅在多风险时出现）：

```jsx
{f.all_risks?.length > 1 && (
  <span className="badge" style={{ marginLeft: 'auto', background: 'rgba(255,170,0,.16)', color: '#b45309', borderColor: 'rgba(255,170,0,.4)' }}>
    共 {f.all_risks.length} 处风险
  </span>
)}
```

---

## 五、验证记录（三道关全过）

| 关卡 | 方式 | 结果 |
|---|---|---|
| 编译 | 三后端文件 `py_compile` | ✅ COMPILE_OK |
| 函数级 | 直连 `analyze_text(db, …)` 跑 11 例 | ✅ high/medium→具体、low→通用，无矛盾 |
| HTTP 级 | `TestClient` 真实路由 `POST /api/v1/scene/scan-text` | ✅ HTTP 200，`all_risks`/`severity_score` 正常、诚实边界成立 |

后端已重启加载新代码（8001 新进程）；前端 5174 在跑。

---

## 六、提交与未推送

- 本次提交：`1a4f4ff`（4 文件，A+B+诚实修正）。
- **未推送提交共 7 个**（gitee 推送需 `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null git -c credential.helper=store push` 绕过 GUI 凭据选择器 401）：
  `eb9adfc + da6d5ab + 08e1a2e + 7ec00ab + 3a9d2fb + 9cd30c8 + 1a4f4ff`。
- 队友未提交文件（dashboard/profile/simulation/seed_content 删除、digital-human/、frontend/public/）本次一律未动。

---

## 七、已知待补 / 下步

- **规则覆盖缺口**：裸手拿加热蒸发皿、徒手抓固体药品目前判 `low`（规则库无对应关键词/条款），属"加规则"范畴，留待 C 或后续补。
- **后续升级（用户已全选，按顺序推进）**：
  - C 规则库外置 + 教师可编辑（移 DB + 内存缓存 + 管理界面 + 一次性迁移）；
  - D 时序/因果链推理（如排水法先移管再熄灯、浓硫酸酸入水、可燃气体先验纯再点燃）；
  - E 数据反哺闭环（高频 generic 聚类 → LLM 起草 → 教师审核 → 晋级规则库）。
